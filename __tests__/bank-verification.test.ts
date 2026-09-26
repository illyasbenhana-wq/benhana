import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'crypto'
import {
  makeDecision, decisionRuleVersionFor, DECISION_RULE_VERSION, DECISION_RULE_VERSION_BANK_VERIFIED,
} from '../lib/decision-engine'
import { classifyUploadError, isDuplicateUpload, LiveOcrolusClient, OcrolusError } from '../lib/ocrolus/client'
import { summarizeDetect } from '../lib/ocrolus/detect'
import { selectBankMetrics } from '../lib/ocrolus/cash-flow'
import { isAuthenticWebhook, toProviderEvent } from '../lib/ocrolus/webhook'
import { mockScenarioFor } from '../lib/ocrolus/mock'
import { issueUploadToken, verifyUploadToken } from '../lib/upload-token'
import { toPartnerVerification, rejectedDocumentDecisionInput } from '../lib/bank-verification'
import { redactPartnerMetadata } from '../lib/partner-redaction'
import * as BankPrompt from '../lib/prompts/ethoscore-v1-bank-verified'

const VENDOR = /ocrolus|claude|anthropic/i
const factors = [{ name: 'Income', weight: 50, score: 70, rationale: 'r' }]

describe('document-authenticity decision rule', () => {
  it('forces human review in every score band — never approves, never declines', () => {
    for (const [score, band] of [[90, 'low'], [60, 'medium'], [20, 'high']] as const) {
      const d = makeDecision({ ethoScore: score, riskBand: band, riskFactors: factors, documentAuthenticity: { reviewRequired: true } })
      expect(d.approved).toBe(false)
      expect(d.requiresHumanReview).toBe(true)
      expect(d.reasonCodes).toContain('DOCUMENT_AUTHENTICITY_REVIEW')
    }
  })

  it('a clean verification leaves the v1 thresholds untouched', () => {
    const base = makeDecision({ ethoScore: 90, riskBand: 'low', riskFactors: factors })
    const verified = makeDecision({ ethoScore: 90, riskBand: 'low', riskFactors: factors, documentAuthenticity: { reviewRequired: false } })
    expect(verified).toEqual(base)
    expect(verified.approved).toBe(true)
  })

  it('a rejected document forces human review in every band, on the carried-forward score', () => {
    for (const [score, band] of [[90, 'low'], [60, 'medium'], [20, 'high']] as const) {
      const input = rejectedDocumentDecisionInput({ etho_score: score, risk_band: band, factors })
      const d = makeDecision(input)
      expect(input.ethoScore).toBe(score)
      expect(d.approved).toBe(false)
      expect(d.requiresHumanReview).toBe(true)
      expect(d.reasonCodes).toContain('DOCUMENT_AUTHENTICITY_REVIEW')
      expect(decisionRuleVersionFor(input)).toBe(DECISION_RULE_VERSION_BANK_VERIFIED)
    }
  })

  it('records a distinct rule version only when verification was an input', () => {
    expect(decisionRuleVersionFor({})).toBe(DECISION_RULE_VERSION)
    expect(decisionRuleVersionFor({ documentAuthenticity: { reviewRequired: false } })).toBe(DECISION_RULE_VERSION_BANK_VERIFIED)
  })
})

describe('Ocrolus upload error handling (integration brief table)', () => {
  it('classifies each documented error', () => {
    expect(classifyUploadError(400, { code: 1401, message: 'Book not found' }).kind).toBe('book_not_found')
    expect(classifyUploadError(400, { message: 'MixedDoc.pdf is not a valid pdf' }).kind).toBe('invalid_pdf')
    expect(classifyUploadError(400, { message: 'No permission to access this book' }).kind).toBe('permission')
    expect(classifyUploadError(400, { message: 'Required pk or book uuid' }).kind).toBe('programming')
    expect(isDuplicateUpload({ message: 'MixedDoc.pdf already exists' })).toBe(true)
  })

  function client(responses: Array<{ status: number; body: unknown }>) {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      if (url.includes('oauth')) return new Response(JSON.stringify({ access_token: 't', expires_in: 3600 }), { status: 200 })
      const r = responses.shift()!
      return new Response(JSON.stringify(r.body), { status: r.status })
    })
    const c = new LiveOcrolusClient(
      { apiBase: 'https://api.test', tokenUrl: 'https://auth.test/oauth/token', audience: 'a', clientId: 'id', clientSecret: 's' },
      fetchImpl as unknown as typeof fetch,
      async () => {},
    )
    return { c, calls }
  }
  const pdf = new Blob(['%PDF-1.4'])

  it('retries "Book not found" exactly once, then succeeds', async () => {
    const { c, calls } = client([
      { status: 400, body: { status: 400, code: 1401, message: 'Book not found' } },
      { status: 200, body: { status: 200, response: { uuid: 'doc-1' } } },
    ])
    await expect(c.uploadStatement('b', pdf, 's.pdf')).resolves.toEqual({ docUuid: 'doc-1', duplicate: false })
    expect(calls.filter(u => u.includes('upload/mixed'))).toHaveLength(2)
    expect(calls.filter(u => u.includes('oauth'))).toHaveLength(1) // token cached
  })

  it('treats a duplicate as success and never retries a permission error', async () => {
    const dup = client([{ status: 400, body: { message: 'MixedDoc.pdf already exists', response: { uuid: 'orig' } } }])
    await expect(dup.c.uploadStatement('b', pdf, 's.pdf')).resolves.toEqual({ docUuid: 'orig', duplicate: true })

    const perm = client([{ status: 400, body: { message: 'No permission to access this book' } }])
    await expect(perm.c.uploadStatement('b', pdf, 's.pdf')).rejects.toMatchObject({ kind: 'permission' })
    expect(perm.calls.filter(u => u.includes('upload/mixed'))).toHaveLength(1)
  })

  it('surfaces an invalid PDF as its own error kind', async () => {
    const { c } = client([{ status: 400, body: { message: 'MixedDoc.pdf is not a valid pdf' } }])
    const err = await c.uploadStatement('b', pdf, 's.pdf').catch(e => e)
    expect(err).toBeInstanceOf(OcrolusError)
    expect(err.kind).toBe('invalid_pdf')
  })
})

describe('Detect interpretation (conservative until Ocrolus confirms the scale)', () => {
  const clean = { form_analysis: [{ signals: [], form_authenticity: { score: 95, reason_codes: [] } }] }
  it('clean statement → no review', () => {
    expect(summarizeDetect(clean, 'not_found', null).reviewRequired).toBe(false)
  })
  it('any signal, reason code, unable-to-process or no analysed form → review', () => {
    expect(summarizeDetect({ form_analysis: [{ signals: [{ identifier: 'dollar_amount_edits' }] }] }, 'not_found', null).reviewRequired).toBe(true)
    expect(summarizeDetect({ form_analysis: [{ signals: [], form_authenticity: { score: 90, reason_codes: [{ code: '006-L' }] } }] }, 'not_found', null).reviewRequired).toBe(true)
    expect(summarizeDetect(clean, 'unable', null).reviewRequired).toBe(true)
    expect(summarizeDetect(clean, 'found', null).reviewRequired).toBe(true)
    expect(summarizeDetect({ form_analysis: [] }, 'not_found', null).reviewRequired).toBe(true)
  })
  it('optional score threshold applies only when configured', () => {
    const mid = { form_analysis: [{ signals: [], form_authenticity: { score: 60, reason_codes: [] } }] }
    expect(summarizeDetect(mid, 'not_found', null).reviewRequired).toBe(false)
    expect(summarizeDetect(mid, 'not_found', 70).reviewRequired).toBe(true)
  })
})

describe('cash-flow metric selection', () => {
  it('keeps financial metrics, drops identifying fields and non-numbers', () => {
    const { metrics, statementPeriod } = selectBankMetrics({
      period_start: '2026-06-01', period_end: '2026-08-31',
      account_number: 12345678, holder_name: 'A Person', book_pk: 99,
      avg_monthly_payroll_3m: 3600.456, rent_paid_months: 12, nsf_count_3m: 0,
      nested: { min_daily_balance_3m: 310 }, transactions: [{ amount: 5 }],
    })
    expect(metrics).toEqual({ avg_monthly_payroll_3m: 3600.46, rent_paid_months: 12, nsf_count_3m: 0, 'nested.min_daily_balance_3m': 310 })
    expect(statementPeriod).toBe('2026-06-01 to 2026-08-31')
  })
})

describe('inbound webhook authentication (fail closed)', () => {
  const body = JSON.stringify({ book_uuid: 'b', event_name: 'book.verified' })
  const url = new URL('https://x/api/webhooks/ocrolus')
  it('rejects everything when no secret is configured', () => {
    expect(isAuthenticWebhook(body, new Headers(), new URL('https://x/?token=anything'), undefined)).toBe(false)
  })
  it('accepts a valid HMAC or URL token, rejects a wrong one', () => {
    const sig = createHmac('sha256', 'sec').update(body).digest('hex')
    expect(isAuthenticWebhook(body, new Headers({ 'x-ocrolus-signature': sig }), url, 'sec')).toBe(true)
    expect(isAuthenticWebhook(body, new Headers({ 'webhook-signature': `sha256=${sig}` }), url, 'sec')).toBe(true)
    expect(isAuthenticWebhook(body, new Headers(), new URL('https://x/?token=sec'), 'sec')).toBe(true)
    expect(isAuthenticWebhook(body, new Headers({ 'x-ocrolus-signature': 'bad' }), url, 'sec')).toBe(false)
    expect(isAuthenticWebhook(body, new Headers(), new URL('https://x/?token=nope'), 'sec')).toBe(false)
  })
  it('normalises every documented event spelling', () => {
    expect(toProviderEvent({ book_uuid: 'b', event_name: 'book.verified' })?.event).toEqual({ kind: 'book_verified' })
    expect(toProviderEvent({ book_uuid: 'b', event_name: 'Book Verified' })?.event).toEqual({ kind: 'book_verified' })
    expect(toProviderEvent({ book_uuid: 'b', status: 'BOOK_COMPLETE' })?.event).toEqual({ kind: 'book_verified' })
    expect(toProviderEvent({ book_uuid: 'b', event_name: 'Document Rejected' })?.event.kind).toBe('document_rejected')
    expect(toProviderEvent({ book_uuid: 'b', event_name: 'Detect Signal Found' })?.event).toEqual({ kind: 'detect_outcome', outcome: 'found' })
    expect(toProviderEvent({ book_uuid: 'b', event_name: 'Detect Signal Not Found' })?.event).toEqual({ kind: 'detect_outcome', outcome: 'not_found' })
    expect(toProviderEvent({ book_uuid: 'b', event_name: 'Detect Unable to Process' })?.event).toEqual({ kind: 'detect_outcome', outcome: 'unable' })
    expect(toProviderEvent({ book_uuid: 'b', event_name: 'book.classified' })).toBeNull()
    expect(toProviderEvent({ event_name: 'book.verified' })).toBeNull()
  })
})

describe('apply-flow upload token', () => {
  it('binds to one application and expires', () => {
    const t = issueUploadToken('app-1', 's', 1_000_000)!
    expect(verifyUploadToken('app-1', t, 's', 1_000_000)).toBe(true)
    expect(verifyUploadToken('app-2', t, 's', 1_000_000)).toBe(false)
    expect(verifyUploadToken('app-1', t, 'other', 1_000_000)).toBe(false)
    expect(verifyUploadToken('app-1', t, 's', 1_000_000 + 2 * 3600_000)).toBe(false)
    expect(issueUploadToken('app-1', undefined)).toBeNull()
  })
})

describe('bank-verified prompt', () => {
  it('extends v1 without dropping its output schema', () => {
    expect(BankPrompt.PROMPT_VERSION).toBe('1.1.0-bank-verified')
    expect(BankPrompt.ETHOSCORE_SYSTEM_PROMPT).toContain('VERIFIED BANK STATEMENT DATA')
    expect(BankPrompt.ETHOSCORE_SYSTEM_PROMPT).toContain('"etho_score": number')
    expect(BankPrompt.ETHOSCORE_SYSTEM_PROMPT).toContain('EU AI Act compliance')
  })
  it('never mentions fraud/authenticity — those only reach the decision engine', () => {
    expect(BankPrompt.ETHOSCORE_SYSTEM_PROMPT).not.toMatch(/fraud|tamper|authentic/i)
  })
})

describe('partner-facing bank verification view', () => {
  const row = {
    id: 'v', organization_id: 'o', application_id: 'a', channel: 'partner_api' as const, mode: 'mock' as const,
    status: 'verified' as const, provider_book_uuid: 'mock-book-1', book_verified_at: 't', detect_outcome: 'found' as const,
    review_required: true, failure_reason: 'internal', result_score_id: 's', result_decision_record_id: 'd',
    created_at: 't0', completed_at: 't1',
  }
  it('exposes status only — no provider, ids or internal reasons', () => {
    const v = toPartnerVerification(row)
    expect(v).toEqual({ status: 'verified', submitted_at: 't0', completed_at: 't1', document_review_required: true, simulated: true })
    expect(JSON.stringify(v)).not.toMatch(VENDOR)
    expect(toPartnerVerification({ ...row, status: 'scoring' })?.status).toBe('processing')
  })
  it('a rejected document reports the forced review, without the provider reason', () => {
    const v = toPartnerVerification({ ...row, status: 'rejected', failure_reason: 'Ocrolus: unsupported document' })
    expect(v).toEqual({ status: 'rejected', submitted_at: 't0', completed_at: 't1', document_review_required: true, reason: 'DOCUMENT_REJECTED', simulated: true })
    expect(JSON.stringify(v)).not.toMatch(VENDOR)
  })
  it('event metadata loses provider identity', () => {
    const out = redactPartnerMetadata({ verificationId: 'v', provider: 'ocrolus', provider_book_uuid: 'b', mode: 'mock' })
    expect(out).toEqual({ verificationId: 'v', mode: 'mock' })
  })
  it('mock scenarios are selected by file name', () => {
    expect(mockScenarioFor('statement.pdf')).toBe('clean')
    expect(mockScenarioFor('Tampered-statement.pdf')).toBe('tampered')
    expect(mockScenarioFor('unreadable.pdf')).toBe('unreadable')
    expect(mockScenarioFor('rejected.pdf')).toBe('rejected')
  })
})
