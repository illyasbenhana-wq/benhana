import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Minimal chainable Supabase query-builder mock — enough to cover the
// .from(table).upsert(...).select(...).single() / .insert(...).select(...).single()
// shapes lib/audit-engine.ts actually uses, without a real database.
function chain(result: { data: any; error: any }) {
  const node: any = {}
  node.upsert = vi.fn(() => node)
  node.insert = vi.fn(() => node)
  node.select = vi.fn(() => node)
  node.single = vi.fn(() => Promise.resolve(result))
  return node
}

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

import { recordAuditEvent, type AuditInput } from '../lib/audit-engine'

const BASE_INPUT: AuditInput = {
  applicationId: 'app-1',
  orgId: 'org-1',
  source: 'apply_flow',
  inputSnapshot: { full_name: 'Test Applicant', monthly_income: 3000 },
  scoreId: 'score-1',
  scoreVersion: 'v2',
  modelVersion: 'ethoscore-v2',
  promptVersion: '2.0.0-fable5',
  modelRequested: 'claude-fable-5',
  modelResponded: 'claude-fable-5',
  aiProvider: 'claude',
  rawPrompt: 'prompt text',
  rawResponse: 'response text',
  ethoScore: 78,
  riskBand: 'low',
  recommendation: 'approve',
  signals: [{ name: 'Income Stability', weight: 25, score: 78, rationale: 'Stable income' }],
  scorePillars: { trust: { score: 220, max: 300 } },
  decision: 'approved',
  reasonCodes: ['SCORE_ABOVE_THRESHOLD'],
  confidence: 0.8,
  requiresHumanReview: false,
}

describe('recordAuditEvent (decision-lineage persistence)', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_KEY

  beforeEach(() => {
    mockFrom.mockReset()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'fake-service-key'
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    process.env.SUPABASE_SERVICE_KEY = originalKey
  })

  it('writes model_versions -> data_snapshots -> decision_records in order and returns the new decision_records id', async () => {
    const tables: Record<string, ReturnType<typeof chain>> = {
      model_versions: chain({ data: { id: 'mv-1' }, error: null }),
      data_snapshots: chain({ data: { id: 'ds-1' }, error: null }),
      decision_records: chain({ data: { id: 'dr-1' }, error: null }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const result = await recordAuditEvent(BASE_INPUT)

    expect(result).toEqual({ decisionRecordId: 'dr-1', applicationId: 'app-1', createdAt: expect.any(String) })

    // model_versions upserted on its natural key, not duplicated per call
    expect(tables.model_versions.upsert).toHaveBeenCalledWith(
      {
        score_version: 'v2',
        prompt_version: '2.0.0-fable5',
        model_requested: 'claude-fable-5',
        model_responded: 'claude-fable-5',
      },
      { onConflict: 'score_version,prompt_version,model_requested,model_responded', ignoreDuplicates: false }
    )

    // data_snapshots gets the raw input verbatim, tenant-scoped
    expect(tables.data_snapshots.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        application_id: 'app-1',
        source: 'apply_flow',
        raw_data: BASE_INPUT.inputSnapshot,
      })
    )

    // decision_records links the snapshot + model version + score + decision
    expect(tables.decision_records.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: 'org-1',
        application_id: 'app-1',
        score_id: 'score-1',
        data_snapshot_id: 'ds-1',
        model_version_id: 'mv-1',
        etho_score: 78,
        risk_band: 'low',
        decision: 'approved',
        decision_reason: ['SCORE_ABOVE_THRESHOLD'],
        requires_human_review: false,
        decided_by: 'system',
      })
    )
  })

  it('degrades gracefully (never throws, returns decisionRecordId: null) when the migration has not been applied yet', async () => {
    const tables: Record<string, ReturnType<typeof chain>> = {
      model_versions: chain({ data: null, error: { code: '42P01', message: 'relation "model_versions" does not exist' } }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const result = await recordAuditEvent(BASE_INPUT)

    expect(result.decisionRecordId).toBeNull()
    expect(result.applicationId).toBe('app-1')
  })

  it('degrades gracefully when Supabase is not configured (no env vars)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_KEY

    const result = await recordAuditEvent(BASE_INPUT)

    expect(result.decisionRecordId).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('never persists raw AI model identifiers into a table read by any UI — only into model_versions, which is the intended registry', async () => {
    // Regression guard for the same class of leak fixed this week on
    // /intelligence/score/[id] and /score/[id]: model_requested/
    // model_responded must land ONLY in model_versions (an internal
    // registry never rendered to end users), never duplicated into
    // decision_records or data_snapshots.
    const tables: Record<string, ReturnType<typeof chain>> = {
      model_versions: chain({ data: { id: 'mv-1' }, error: null }),
      data_snapshots: chain({ data: { id: 'ds-1' }, error: null }),
      decision_records: chain({ data: { id: 'dr-1' }, error: null }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    await recordAuditEvent(BASE_INPUT)

    const decisionRecordsPayload = tables.decision_records.insert.mock.calls[0][0]
    expect(decisionRecordsPayload).not.toHaveProperty('model_requested')
    expect(decisionRecordsPayload).not.toHaveProperty('model_responded')
    const snapshotPayload = tables.data_snapshots.insert.mock.calls[0][0]
    expect(snapshotPayload).not.toHaveProperty('model_requested')
    expect(snapshotPayload).not.toHaveProperty('model_responded')
  })
})
