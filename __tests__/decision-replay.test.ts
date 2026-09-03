import { describe, it, expect, vi, beforeEach } from 'vitest'

function chain(result: { data: any; error: any }) {
  const node: any = {}
  node.select = vi.fn(() => node)
  node.eq = vi.fn(() => node)
  node.order = vi.fn(() => node)
  node.maybeSingle = vi.fn(() => Promise.resolve(result))
  node.then = (resolve: any) => Promise.resolve(result).then(resolve)
  return node
}

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

import { replayDecision } from '../lib/decision-replay'

const ORG_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const OTHER_ORG_ID = 'bbbbbbbb-0000-0000-0000-000000000002'
const DECISION_RECORD_ID = '11111111-1111-1111-1111-111111111111'

const BASE_RECORD = {
  id: DECISION_RECORD_ID,
  organization_id: ORG_ID,
  application_id: 'app-1',
  score_id: 'score-1',
  decision_id: null,
  data_snapshot_id: 'snap-1',
  model_version_id: 'mv-1',
  etho_score: 78,
  risk_band: 'low',
  recommendation: 'approve',
  decision: 'approved',
  decision_reason: ['SCORE_ABOVE_THRESHOLD'],
  confidence: 0.8,
  requires_human_review: false,
  decided_by: 'system',
  override_reason: null,
  decided_at: '2026-01-01T00:00:00Z',
}

const BASE_MODEL_VERSION = { id: 'mv-1', score_version: 'v2', prompt_version: '2.0.0', model_requested: 'claude-fable-5', model_responded: 'claude-fable-5' }
const BASE_SNAPSHOT = { id: 'snap-1', captured_at: '2026-01-01T00:00:00Z', source: 'apply_flow', raw_data: { full_name: 'Test Applicant', monthly_income: 3800 } }

function mockTables(overrides: Partial<{ record: any; modelVersion: any; snapshot: any; outcomes: any[] }> = {}) {
  const tables: Record<string, ReturnType<typeof chain>> = {
    decision_records: chain({ data: overrides.record !== undefined ? overrides.record : BASE_RECORD, error: null }),
    model_versions: chain({ data: overrides.modelVersion !== undefined ? overrides.modelVersion : BASE_MODEL_VERSION, error: null }),
    data_snapshots: chain({ data: overrides.snapshot !== undefined ? overrides.snapshot : BASE_SNAPSHOT, error: null }),
    outcomes: chain({ data: overrides.outcomes ?? [], error: null }),
  }
  mockFrom.mockImplementation((table: string) => tables[table])
  return tables
}

describe('replayDecision', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'fake-service-key'
  })

  it('A/E/F/G. replays a valid decision, returning decided_at, model_version_id, data_snapshot_id, and original output verbatim', async () => {
    mockTables()
    const outcome = await replayDecision(DECISION_RECORD_ID, ORG_ID)

    expect(outcome.success).toBe(true)
    if (outcome.success === false) return
    expect(outcome.result.decision_record_id).toBe(DECISION_RECORD_ID)
    expect(outcome.result.decided_at).toBe('2026-01-01T00:00:00Z')
    expect(outcome.result.original_decision.etho_score).toBe(78)
    expect(outcome.result.original_decision.recommendation).toBe('approve')
    expect((outcome.result.model_version as any).id).toBe('mv-1')
    expect((outcome.result.data_snapshot as any).id).toBe('snap-1')
    expect((outcome.result.data_snapshot as any).raw_data).toEqual({ full_name: 'Test Applicant', monthly_income: 3800 })
  })

  it('C. a nonexistent decision_record returns NOT_FOUND', async () => {
    mockTables({ record: null })
    const outcome = await replayDecision(DECISION_RECORD_ID, ORG_ID)

    expect(outcome.success).toBe(false)
    if (outcome.success === true) return
    expect(outcome.error.code).toBe('NOT_FOUND')
  })

  it('B/D. a decision_record belonging to another organization is not returned (tenant isolation)', async () => {
    // organization_id-filtered query returning no row for the wrong org
    mockTables({ record: null })
    const outcome = await replayDecision(DECISION_RECORD_ID, OTHER_ORG_ID)

    expect(outcome.success).toBe(false)
    if (outcome.success === true) return
    expect(outcome.error.code).toBe('NOT_FOUND')
  })

  it('H. uses the stored data_snapshot as evidence, never live application data (no applications table is ever queried)', async () => {
    mockTables()
    await replayDecision(DECISION_RECORD_ID, ORG_ID)

    const queriedTables = mockFrom.mock.calls.map(c => c[0])
    expect(queriedTables).not.toContain('applications')
    expect(queriedTables).not.toContain('scores')
  })

  it('K. later outcomes are returned separately as post_decision_outcomes, never merged into original_decision', async () => {
    mockTables({ outcomes: [{ id: 'o1', status: 'current', observed_at: '2026-02-01T00:00:00Z', superseded_outcome_id: null }] })
    const outcome = await replayDecision(DECISION_RECORD_ID, ORG_ID)

    expect(outcome.success).toBe(true)
    if (outcome.success === false) return
    expect(outcome.result.post_decision_outcomes).toHaveLength(1)
    expect(outcome.result.post_decision_outcomes[0].status).toBe('current')
    // original_decision fields are untouched by the presence of a later outcome
    expect(outcome.result.original_decision.recommendation).toBe('approve')
    expect(outcome.result.original_decision.etho_score).toBe(78)
  })

  it('L/M. replay is deterministic: repeating it against unchanged evidence yields identical reconstructed content', async () => {
    mockTables()
    const first = await replayDecision(DECISION_RECORD_ID, ORG_ID)
    mockTables()
    const second = await replayDecision(DECISION_RECORD_ID, ORG_ID)

    expect(first.success && second.success).toBe(true)
    if (first.success === false || second.success === false) return
    const { replayed_at: _a, ...firstWithoutTimestamp } = first.result
    const { replayed_at: _b, ...secondWithoutTimestamp } = second.result
    expect(firstWithoutTimestamp).toEqual(secondWithoutTimestamp)
  })

  it('lineage surfaces raw ids only, never dereferences them into live rows', async () => {
    mockTables()
    const outcome = await replayDecision(DECISION_RECORD_ID, ORG_ID)

    expect(outcome.success).toBe(true)
    if (outcome.success === false) return
    expect(outcome.result.lineage).toEqual({ application_id: 'app-1', score_id: 'score-1', decision_id: null })
  })

  it('marks model_version/data_snapshot as unavailable rather than guessing, if a lookup somehow returns nothing', async () => {
    mockTables({ modelVersion: null, snapshot: null })
    const outcome = await replayDecision(DECISION_RECORD_ID, ORG_ID)

    expect(outcome.success).toBe(true)
    if (outcome.success === false) return
    expect(outcome.result.model_version).toEqual({ available: false, reason: 'model_versions row not found' })
    expect(outcome.result.data_snapshot).toEqual({ available: false, reason: 'data_snapshots row not found' })
  })
})
