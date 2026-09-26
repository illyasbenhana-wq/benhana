/**
 * Bank-statement verification lifecycle (Ocrolus), end to end:
 *
 *   startBankVerification()   create book → upload statement → 'processing'
 *   handleProviderEvent()     webhook events: book verified / document
 *                             rejected / Detect outcome
 *   finalize (internal)       once BOTH book verified AND a Detect outcome
 *                             are in (provider event order is not
 *                             guaranteed): fetch Detect + cash-flow data,
 *                             re-score with the 1.1.0-bank-verified prompt,
 *                             decide via makeDecision(), commit a new
 *                             Decision Package with source 'ocrolus'
 *
 * The first score (self-reported, from POST /api/v1/applications or
 * /api/score) is untouched; the verified re-score is a second, later
 * Decision Package for the same application — the latest one is current.
 *
 * External calls happen outside the atomic commit, as everywhere else.
 * Raw bank data lives only in the immutable data_snapshots row, never in
 * bank_verifications (status tracking only).
 */

import { createClient } from '@supabase/supabase-js'
import { ApplicationForm, ScoreFactor, validateApplicationForm } from '@/types'
import { scoreApplication, computeRiskBand, BANK_VERIFIED_PROMPT_VERSION } from './scoring-engine'
import { makeDecision, decisionRuleVersionFor } from './decision-engine'
import { commitDecisionPackage, RawInputProvenance } from './audit-engine'
import { recordEvent } from './workflow-engine'
import { log } from './logger'
import {
  getOcrolusClient, OcrolusClient, OcrolusError, MockOcrolusClient, mockScenarioFor,
  summarizeDetect, selectBankMetrics, DetectOutcome,
} from './ocrolus'

export const PROVIDER = 'ocrolus'

export type VerificationStatus = 'submitting' | 'processing' | 'scoring' | 'verified' | 'rejected' | 'failed'
export type Channel = 'apply_flow' | 'partner_api'

export interface BankVerificationRow {
  id: string
  organization_id: string
  application_id: string
  channel: Channel
  mode: 'live' | 'mock'
  status: VerificationStatus
  provider_book_uuid: string | null
  book_verified_at: string | null
  detect_outcome: DetectOutcome | null
  review_required: boolean | null
  failure_reason: string | null
  result_score_id: string | null
  result_decision_record_id: string | null
  created_at: string
  completed_at: string | null
}

export type StartResult =
  | { ok: true; verification: BankVerificationRow }
  | { ok: false; status: number; code: string; message: string }

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

const ACTIVE: VerificationStatus[] = ['submitting', 'processing', 'scoring']
const DECIDED_STATUSES = new Set(['approved', 'declined'])

export async function startBankVerification(params: {
  applicationId: string
  orgId: string | null // null = resolve from the application (apply flow)
  channel: Channel
  actorId: string
  file: Blob
  fileName: string
  client?: OcrolusClient | null // injectable for tests
}): Promise<StartResult> {
  const supabase = getSupabase()
  if (!supabase) return { ok: false, status: 503, code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' }

  const client = params.client === undefined ? getOcrolusClient() : params.client
  if (!client) {
    return { ok: false, status: 503, code: 'BANK_VERIFICATION_UNAVAILABLE', message: 'Bank statement verification is not enabled in this environment' }
  }

  let appQuery = supabase.from('applications').select('id, organization_id, status').eq('id', params.applicationId)
  if (params.orgId) appQuery = appQuery.eq('organization_id', params.orgId)
  const { data: app } = await appQuery.maybeSingle()
  if (!app) return { ok: false, status: 404, code: 'NOT_FOUND', message: 'Application not found' }
  if (DECIDED_STATUSES.has(app.status)) {
    return { ok: false, status: 409, code: 'APPLICATION_ALREADY_DECIDED', message: `Application is already ${app.status}; bank verification can no longer change the decision` }
  }
  if (app.status !== 'scored' && app.status !== 'more_info') {
    return { ok: false, status: 409, code: 'APPLICATION_NOT_SCORED', message: 'Submit and score the application before uploading a bank statement' }
  }

  // One in-flight verification per application (also enforced by a unique
  // partial index — this check just gives a clean error).
  const { data: active } = await supabase.from('bank_verifications').select('id')
    .eq('application_id', app.id).in('status', ACTIVE).limit(1)
  if (active && active.length > 0) {
    return { ok: false, status: 409, code: 'VERIFICATION_IN_PROGRESS', message: 'A bank statement for this application is already being verified' }
  }

  const { data: row, error: insErr } = await supabase.from('bank_verifications').insert({
    organization_id: app.organization_id,
    application_id: app.id,
    channel: params.channel,
    provider: PROVIDER,
    mode: client.mode,
    status: 'submitting',
  }).select().single()
  if (insErr || !row) {
    log.error('bank_verifications insert failed', { applicationId: app.id, error: insErr?.message })
    return { ok: false, status: 500, code: 'INSERT_FAILED', message: 'Could not start bank verification' }
  }

  try {
    const { bookUuid } = await client.createBook(`ethosfi-${app.id}`)
    const upload = await client.uploadStatement(bookUuid, params.file, params.fileName)
    await supabase.from('bank_verifications').update({
      status: 'processing', provider_book_uuid: bookUuid, provider_doc_uuid: upload.docUuid, updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    await recordEvent({
      entityType: 'application', entityId: app.id, orgId: app.organization_id,
      eventType: 'bank_verification_submitted', actorId: params.actorId,
      payload: { verificationId: row.id, provider: PROVIDER, provider_book_uuid: bookUuid, mode: client.mode, duplicate_upload: upload.duplicate },
    })

    // Mock mode: the provider "responds" immediately with the events the
    // scenario implies, through the exact same handler a webhook uses.
    if (client instanceof MockOcrolusClient) {
      const scenario = mockScenarioFor(params.fileName)
      if (scenario === 'rejected') {
        await handleProviderEvent(bookUuid, { kind: 'document_rejected', reason: 'Document rejected (sandbox simulation)' }, client)
      } else {
        await handleProviderEvent(bookUuid, { kind: 'book_verified' }, client)
        await handleProviderEvent(bookUuid, {
          kind: 'detect_outcome',
          outcome: scenario === 'tampered' ? 'found' : scenario === 'unreadable' ? 'unable' : 'not_found',
        }, client)
      }
    }
  } catch (err) {
    const isOcrolus = err instanceof OcrolusError
    const message = err instanceof Error ? err.message : String(err)
    await markFailed(row.id, isOcrolus ? `${err.kind}: ${message}` : message)
    log.error('bank verification submission failed', { applicationId: app.id, verificationId: row.id, error: message })
    if (isOcrolus && err.kind === 'invalid_pdf') {
      return { ok: false, status: 422, code: 'INVALID_PDF', message: 'The file is not a readable PDF bank statement. Please upload it again.' }
    }
    return { ok: false, status: 502, code: 'VERIFICATION_PROVIDER_ERROR', message: 'The bank statement could not be submitted for verification. Please try again later.' }
  }

  const latest = await getVerification(row.id)
  return latest ? { ok: true, verification: latest } : { ok: false, status: 500, code: 'INTERNAL_ERROR', message: 'Verification state unavailable' }
}

export type ProviderEvent =
  | { kind: 'book_verified' }
  | { kind: 'document_rejected'; reason?: string }
  | { kind: 'detect_outcome'; outcome: DetectOutcome }

export async function handleProviderEvent(bookUuid: string, event: ProviderEvent, client?: OcrolusClient | null): Promise<'applied' | 'unknown_book' | 'ignored'> {
  const supabase = getSupabase()
  if (!supabase) return 'ignored'
  const { data: row } = await supabase.from('bank_verifications').select('*').eq('provider_book_uuid', bookUuid).maybeSingle()
  if (!row) return 'unknown_book'
  if (row.status !== 'processing') return 'ignored' // already finalised / failed — webhook retries are no-ops

  const now = new Date().toISOString()
  if (event.kind === 'document_rejected') {
    // Single-document books: a rejected statement ends this verification.
    // (Whether a rejected document can still let the book complete is an
    // open question with Ocrolus — irrelevant with one document per book.)
    await supabase.from('bank_verifications').update({
      status: 'rejected', failure_reason: event.reason ?? 'Document rejected by verification provider', completed_at: now, updated_at: now,
    }).eq('id', row.id).eq('status', 'processing')
    await recordEvent({
      entityType: 'application', entityId: row.application_id, orgId: row.organization_id,
      eventType: 'bank_verification_completed', actorId: 'system:bank_verification',
      payload: { verificationId: row.id, outcome: 'rejected' },
    })
    return 'applied'
  }

  const patch: Record<string, unknown> = { updated_at: now }
  if (event.kind === 'book_verified' && !row.book_verified_at) patch.book_verified_at = now
  if (event.kind === 'detect_outcome' && !row.detect_outcome) patch.detect_outcome = event.outcome
  const { data: updated } = await supabase.from('bank_verifications').update(patch).eq('id', row.id).select().single()
  const current = (updated ?? row) as BankVerificationRow

  if (current.book_verified_at && current.detect_outcome) {
    await finalize(current, client === undefined ? getOcrolusClient() : client)
  }
  return 'applied'
}

async function finalize(row: BankVerificationRow, client: OcrolusClient | null): Promise<void> {
  const supabase = getSupabase()
  if (!supabase || !client) return

  // Atomic claim: only one handler (e.g. two near-simultaneous webhooks)
  // gets to re-score.
  const { data: claimed } = await supabase.from('bank_verifications')
    .update({ status: 'scoring', updated_at: new Date().toISOString() })
    .eq('id', row.id).eq('status', 'processing').select().maybeSingle()
  if (!claimed) return

  try {
    const form = await loadOriginalForm(row.application_id)
    if (!form) throw new Error('original application snapshot not found')
    const bookUuid = row.provider_book_uuid as string

    const [detectRaw, cashFlowRaw] = await Promise.all([
      client.getDetectSignals(bookUuid),
      client.getCashFlowFeatures(bookUuid),
    ])
    const authenticity = summarizeDetect(detectRaw, row.detect_outcome)
    const bankData = selectBankMetrics(cashFlowRaw)

    // Fraud/authenticity results are NOT passed to the scorer — only the
    // cash-flow metrics. They reach the decision engine and nothing else.
    const scoreData = process.env.ANTHROPIC_API_KEY
      ? await scoreApplication(form, { verifiedBankData: bankData })
      : mockVerifiedScore()
    const { result } = scoreData

    const decisionInput = {
      ethoScore: result.etho_score,
      riskBand: result.risk_band,
      riskFactors: result.factors,
      documentAuthenticity: { reviewRequired: authenticity.reviewRequired },
    }
    const decision = makeDecision(decisionInput)
    const recommendation = decision.requiresHumanReview ? 'review' : decision.approved ? 'approve' : 'decline'

    const formSource = row.channel === 'apply_flow' ? 'applicant_provided' : 'lender_provided'
    const rawInputProvenance: RawInputProvenance[] = [
      ...Object.entries(form).map(([field_name, raw_value]) => ({ field_name, source_type: formSource as RawInputProvenance['source_type'], raw_value })),
      ...Object.entries(bankData.metrics).map(([k, v]) => ({
        field_name: `bank_statement.${k}`, source_type: 'external_provider' as const, raw_value: v, provider: PROVIDER, provider_reference: bookUuid,
      })),
      {
        field_name: 'bank_statement.document_authenticity', source_type: 'external_provider', provider: PROVIDER, provider_reference: bookUuid,
        raw_value: authenticity,
      },
    ]

    const pkg = await commitDecisionPackage({
      applicationId: row.application_id,
      orgId: row.organization_id,
      source: 'ocrolus',
      // Everything that was actually used at decision time, frozen verbatim.
      inputSnapshot: {
        application_form: form,
        bank_verification: {
          provider: PROVIDER,
          mode: row.mode,
          provider_book_uuid: bookUuid,
          metrics_used_for_scoring: bankData.metrics,
          statement_period: bankData.statementPeriod ?? null,
          document_authenticity: authenticity,
          cash_flow_features_raw: cashFlowRaw,
          detect_signals_raw: detectRaw,
        },
      },
      rawInputProvenance,
      scoreVersion: 'v1',
      promptVersion: scoreData.promptVersion ?? BANK_VERIFIED_PROMPT_VERSION,
      modelRequested: scoreData.modelRequested ?? null,
      modelResponded: scoreData.modelResponded ?? null,
      modelVersionLabel: result.model_version,
      rawPrompt: scoreData.rawPrompt,
      rawResponse: scoreData.rawResponse,
      confidenceOverall: scoreData.confidenceOverall ?? null,
      ethoScore: result.etho_score,
      riskBand: result.risk_band,
      aiSummary: result.ai_summary,
      factors: result.factors,
      recommendation,
      scorePillars: null,
      decision: decision.requiresHumanReview ? 'review' : decision.approved ? 'approved' : 'declined',
      reasonCodes: decision.reasonCodes,
      confidence: decision.confidence,
      requiresHumanReview: decision.requiresHumanReview,
    }, decisionRuleVersionFor(decisionInput))

    if (pkg.success === false) throw new Error(`decision package: ${pkg.error}`)

    const now = new Date().toISOString()
    await supabase.from('bank_verifications').update({
      status: 'verified', review_required: authenticity.reviewRequired,
      result_score_id: pkg.scoreId, result_decision_record_id: pkg.decisionRecordId,
      completed_at: now, updated_at: now,
    }).eq('id', row.id)
    await recordEvent({
      entityType: 'application', entityId: row.application_id, orgId: row.organization_id,
      eventType: 'bank_verification_completed', actorId: 'system:bank_verification',
      payload: {
        verificationId: row.id, outcome: 'verified', scoreId: pkg.scoreId,
        etho_score: result.etho_score, review_required: authenticity.reviewRequired,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('bank verification re-score failed', { verificationId: row.id, applicationId: row.application_id, error: message })
    await markFailed(row.id, `rescore: ${message}`)
  }
}

async function markFailed(id: string, reason: string) {
  const supabase = getSupabase()
  if (!supabase) return
  const now = new Date().toISOString()
  await supabase.from('bank_verifications').update({ status: 'failed', failure_reason: reason.slice(0, 2000), completed_at: now, updated_at: now }).eq('id', id)
}

// The self-reported form exactly as first scored (frozen in the first
// Decision Package's snapshot) — never re-read from the mutable
// applications row.
async function loadOriginalForm(applicationId: string): Promise<ApplicationForm | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.from('data_snapshots').select('raw_data')
    .eq('application_id', applicationId).in('source', ['apply_flow', 'partner_api'])
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!data?.raw_data) return null
  const v = validateApplicationForm(data.raw_data)
  return v.valid ? v.data : null
}

export async function getVerification(id: string): Promise<BankVerificationRow | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.from('bank_verifications').select('*').eq('id', id).maybeSingle()
  return (data as BankVerificationRow) ?? null
}

export async function getLatestVerification(applicationId: string, orgId: string): Promise<BankVerificationRow | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.from('bank_verifications').select('*')
    .eq('application_id', applicationId).eq('organization_id', orgId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) return null // table absent before the migration — treat as "none"
  return (data as BankVerificationRow) ?? null
}

// Partner-facing view: no provider name, ids, raw data or internal reasons.
export function toPartnerVerification(row: BankVerificationRow | null) {
  if (!row) return null
  const status = row.status === 'submitting' || row.status === 'scoring' ? 'processing' : row.status
  return {
    status,
    submitted_at: row.created_at,
    completed_at: row.completed_at,
    ...(status === 'verified' ? { document_review_required: row.review_required === true } : {}),
    ...(status === 'rejected' ? { reason: 'DOCUMENT_REJECTED' } : {}),
    ...(status === 'failed' ? { reason: 'VERIFICATION_FAILED' } : {}),
    ...(row.mode === 'mock' ? { simulated: true } : {}),
  }
}

// No scoring model configured (sandbox): fixed factors, recorded under the
// bank-verified prompt version. 74 (approve band) on purpose, so sandbox
// tests show the document-authenticity rule turning an approval into
// human review ("tampered" file) — with a review-band mock score the rule
// would be invisible.
function mockVerifiedScore() {
  const factors: ScoreFactor[] = [
    { name: 'Income Stability', weight: 25, score: 80, rationale: 'Verified bank statements show regular monthly payroll credits' },
    { name: 'Rent Payment History', weight: 30, score: 75, rationale: 'Consistent rent payments indicate responsibility' },
    { name: 'Loan-to-Income Ratio', weight: 25, score: 65, rationale: 'Loan amount relative to verified income is acceptable' },
    { name: 'Savings Buffer', weight: 15, score: 70, rationale: 'Verified average balance provides a reasonable cushion' },
    { name: 'Cash Flow Consistency', weight: 5, score: 80, rationale: 'No overdraft or returned-payment events in the statement period' },
  ]
  return {
    result: {
      etho_score: 74, risk_band: computeRiskBand(74), recommendation: 'approve' as const,
      ai_summary: 'Verified bank statements confirm stable income and a healthy balance history, consistent with the self-reported application.',
      factors, model_version: 'mock-v1',
    },
    rawPrompt: 'Mock scoring (ANTHROPIC_API_KEY not configured) — bank-verified',
    rawResponse: 'Mock response',
    promptVersion: BANK_VERIFIED_PROMPT_VERSION,
    modelRequested: null as string | null,
    modelResponded: null as string | null,
    confidenceOverall: null as string | null,
  }
}
