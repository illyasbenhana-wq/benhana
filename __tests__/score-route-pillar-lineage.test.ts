import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Architectural correction (Issue 2): scores.score_version /
// decision_records (via recordAuditEvent's scoreVersion) must describe
// which scoring approach actually produced result.etho_score (was the
// LLM called with the v2/fable5 prompt?), not merely "did the separate,
// always-run deterministic lib/ethoscore-v2.ts calculation succeed."
// lib/ethoscore-v2.ts itself is NOT mocked here — it's the real,
// deterministic engine, and it succeeds for any valid form, which is
// exactly the condition that made the old `v2 ? 'v2' : 'v1'` check
// mislabel v1-prompt-scored decisions as 'v2'.

function chain(result: { data: any; error: any }) {
  const node: any = {}
  node.insert = vi.fn(() => node)
  node.select = vi.fn(() => node)
  node.single = vi.fn(() => Promise.resolve(result))
  return node
}

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mockFrom }) }))

const { mockResolveApiContext } = vi.hoisted(() => ({ mockResolveApiContext: vi.fn() }))
vi.mock('../lib/api-guard', () => ({ resolveApiContext: mockResolveApiContext }))

const { mockScoreApplication } = vi.hoisted(() => ({ mockScoreApplication: vi.fn() }))
vi.mock('../lib/scoring-engine', async () => {
  const actual = await vi.importActual<typeof import('../lib/scoring-engine')>('../lib/scoring-engine')
  return { ...actual, scoreApplication: mockScoreApplication }
})

// Production Closure (2026-09-03): recordAuditEvent() was replaced by
// commitDecisionPackage(), which now also performs the `scores` insert
// (folded into the same atomic RPC) — this route no longer calls
// supabase.from('scores').insert(...) directly, so mockFrom's 'scores'
// table entry below is now unused/vestigial for the applications-insert
// path only. Mock the new single-call boundary instead.
const { mockCommitDecisionPackage } = vi.hoisted(() => ({ mockCommitDecisionPackage: vi.fn() }))
vi.mock('../lib/audit-engine', () => ({ commitDecisionPackage: mockCommitDecisionPackage }))

const { mockTransition, mockRecordEvent } = vi.hoisted(() => ({ mockTransition: vi.fn(), mockRecordEvent: vi.fn() }))
vi.mock('../lib/workflow-engine', () => ({ transition: mockTransition, recordEvent: mockRecordEvent }))

import { POST } from '../app/api/score/route'
import { PROMPT_VERSION as FABLE5_PROMPT_VERSION } from '../lib/prompts/ethoscore-llm-v2'
import { PROMPT_VERSION as V1_PROMPT_VERSION } from '../lib/prompts/ethoscore-v1'

const ORG_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

const VALID_FORM = {
  full_name: 'Test Applicant', email: 'test@example.com', monthly_income: 4000,
  employment_type: 'employed', employer_name: 'Acme', months_at_current_job: 24,
  rent_months_paid: 18, rent_monthly_amount: 1000, gig_platforms: [], gig_monthly_avg: 0,
  savings_amount: 3000, loan_amount: 8000, loan_purpose: 'debt_consolidation', loan_term_months: 24,
  consent_data_use: true, consent_ai_decision: true,
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/score', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/score — score_version pillar-lineage correction', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    mockFrom.mockReset()
    mockResolveApiContext.mockReset()
    mockScoreApplication.mockReset()
    mockCommitDecisionPackage.mockReset()
    mockTransition.mockReset()
    mockRecordEvent.mockReset()
    mockResolveApiContext.mockResolvedValue({ userId: 'user-1', orgId: ORG_ID, role: 'analyst' })
    mockCommitDecisionPackage.mockResolvedValue({ success: true, scoreId: 'score-1', decisionRecordId: 'dr-1', dataSnapshotId: 'ds-1', modelVersionId: 'mv-1' })
    mockTransition.mockResolvedValue({ success: true, event: {} })
    mockRecordEvent.mockResolvedValue({ success: true, event: {} })
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  it('an LLM v2/fable5-scored decision stores score_version = \'v2\' (matches the actual scoring approach)', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake-key'
    mockScoreApplication.mockResolvedValue({
      result: {
        etho_score: 78, risk_band: 'low', recommendation: 'approve', ai_summary: 'summary',
        factors: [{ name: 'Trust', weight: 30, score: 80, rationale: 'r' }], model_version: 'claude-fable-5',
      },
      rawPrompt: 'prompt', rawResponse: 'response', promptVersion: FABLE5_PROMPT_VERSION,
      modelRequested: 'claude-fable-5', modelResponded: 'claude-fable-5', confidenceOverall: 0.9,
      validationFallback: false, fable5Assessment: { pillars: {} },
    })

    const applicationsTable = chain({ data: { id: 'app-1' }, error: null })
    mockFrom.mockImplementation((table: string) => (table === 'applications' ? applicationsTable : chain({ data: null, error: null })))

    const res = await POST(postRequest(VALID_FORM))
    expect(res.status).toBe(200)

    expect(mockCommitDecisionPackage).toHaveBeenCalledWith(
      expect.objectContaining({ scoreVersion: 'v2' }),
      expect.any(String)
    )
  })

  it('a v1-prompt (mock fallback) decision stores score_version = \'v1\', even though the deterministic engine always succeeds', async () => {
    delete process.env.ANTHROPIC_API_KEY // forces the mock-score path, promptVersion 'v1'

    const applicationsTable = chain({ data: { id: 'app-1' }, error: null })
    mockFrom.mockImplementation((table: string) => (table === 'applications' ? applicationsTable : chain({ data: null, error: null })))

    const res = await POST(postRequest(VALID_FORM))
    expect(res.status).toBe(200)

    // This is the exact regression the correction fixes: before the fix,
    // this would have received scoreVersion: 'v2', because the real,
    // unmocked computeEthoScoreV2(form) always succeeds for a valid form
    // — regardless of promptVersion being 'v1'.
    expect(mockCommitDecisionPackage).toHaveBeenCalledWith(
      expect.objectContaining({ scoreVersion: 'v1' }),
      expect.any(String)
    )
    // score_pillars (the deterministic engine's own, independent output)
    // is still populated -- this correction does not touch that contract.
    expect(mockCommitDecisionPackage).toHaveBeenCalledWith(
      expect.objectContaining({ scorePillars: expect.any(Object) }),
      expect.any(String)
    )
    expect(mockScoreApplication).not.toHaveBeenCalled()
    expect(V1_PROMPT_VERSION).toBe('v1') // sanity: confirms the mock path's promptVersion literal
  })
})
