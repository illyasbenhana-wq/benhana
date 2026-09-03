import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// commitDecisionPackage() now makes exactly one call:
// supabase.rpc('commit_decision_package', {...}).single(). Mock that
// boundary directly rather than the old five-call .from(table).insert()
// chain this file used to mock — the whole point of the atomic-commit
// change is that there is only one call left to make assertions about.
const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mockRpc }),
}))

import { commitDecisionPackage, type DecisionPackageInput } from '../lib/audit-engine'

function rpcChain(result: { data: any; error: any }) {
  return { single: vi.fn(() => Promise.resolve(result)) }
}

const BASE_INPUT: DecisionPackageInput = {
  applicationId: 'app-1',
  orgId: 'org-1',
  source: 'apply_flow',
  inputSnapshot: { full_name: 'Test Applicant', monthly_income: 3000 },
  scoreVersion: 'v2',
  promptVersion: '2.0.0-fable5',
  modelRequested: 'claude-fable-5',
  modelResponded: 'claude-fable-5',
  modelVersionLabel: 'claude-fable-5',
  rawPrompt: 'prompt text',
  rawResponse: 'response text',
  confidenceOverall: 'high',
  ethoScore: 78,
  riskBand: 'low',
  aiSummary: 'Strong applicant.',
  factors: [{ name: 'Income Stability', weight: 25, score: 78, rationale: 'Stable income' }],
  recommendation: 'approve',
  scorePillars: { trust: { score: 220, max: 300 } },
  decision: 'approved',
  reasonCodes: ['SCORE_ABOVE_THRESHOLD'],
  confidence: 0.8,
  requiresHumanReview: false,
}

const DECISION_RULE_VERSION = 'threshold-70-50-v1'

describe('commitDecisionPackage (atomic decision-package persistence)', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_KEY

  beforeEach(() => {
    mockRpc.mockReset()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'fake-service-key'
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    process.env.SUPABASE_SERVICE_KEY = originalKey
  })

  it('makes exactly one RPC call and returns all four ids on success', async () => {
    mockRpc.mockReturnValue(rpcChain({
      data: { score_id: 'score-1', decision_record_id: 'dr-1', data_snapshot_id: 'ds-1', model_version_id: 'mv-1' },
      error: null,
    }))

    const result = await commitDecisionPackage(BASE_INPUT, DECISION_RULE_VERSION)

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ success: true, scoreId: 'score-1', decisionRecordId: 'dr-1', dataSnapshotId: 'ds-1', modelVersionId: 'mv-1' })
  })

  it('passes the full set of scalar/jsonb params the RPC expects, including the decision rule version', async () => {
    mockRpc.mockReturnValue(rpcChain({
      data: { score_id: 'score-1', decision_record_id: 'dr-1', data_snapshot_id: 'ds-1', model_version_id: 'mv-1' },
      error: null,
    }))

    await commitDecisionPackage(BASE_INPUT, DECISION_RULE_VERSION)

    expect(mockRpc).toHaveBeenCalledWith('commit_decision_package', expect.objectContaining({
      p_organization_id: 'org-1',
      p_application_id: 'app-1',
      p_source: 'apply_flow',
      p_raw_data: BASE_INPUT.inputSnapshot,
      p_score_version: 'v2',
      p_prompt_version: '2.0.0-fable5',
      p_model_requested: 'claude-fable-5',
      p_model_responded: 'claude-fable-5',
      p_etho_score: 78,
      p_risk_band: 'low',
      p_decision: 'approved',
      p_decision_reason: ['SCORE_ABOVE_THRESHOLD'],
      p_requires_human_review: false,
      p_decision_rule_version: DECISION_RULE_VERSION,
    }))
  })

  it('generates provenance entries for every raw input field and every model output factor', async () => {
    mockRpc.mockReturnValue(rpcChain({
      data: { score_id: 'score-1', decision_record_id: 'dr-1', data_snapshot_id: 'ds-1', model_version_id: 'mv-1' },
      error: null,
    }))

    await commitDecisionPackage(BASE_INPUT, DECISION_RULE_VERSION)

    const params = mockRpc.mock.calls[0][1]
    const entries = params.p_provenance_entries as Array<Record<string, unknown>>
    // 2 raw input fields (full_name, monthly_income) + 1 factor = 3
    expect(entries).toHaveLength(3)
    expect(entries).toContainEqual(expect.objectContaining({
      field_name: 'monthly_income', raw_value: 3000, signal_level: 'raw_input', source_type: 'applicant_provided', model_version_ref: false,
    }))
    expect(entries).toContainEqual(expect.objectContaining({
      field_name: 'Income Stability', signal_level: 'model_interpretation', source_type: 'model_generated', model_version_ref: true,
    }))
  })

  it('returns success: false (never throws) when the RPC errors — the caller decides how to fail the request', async () => {
    mockRpc.mockReturnValue(rpcChain({ data: null, error: { message: 'boom', code: 'XXYYY' } }))

    const result = await commitDecisionPackage(BASE_INPUT, DECISION_RULE_VERSION)

    expect(result).toEqual({ success: false, error: 'boom' })
  })

  it('returns success: false when the migration/RPC has not been applied yet (undefined function)', async () => {
    mockRpc.mockReturnValue(rpcChain({ data: null, error: { message: 'function commit_decision_package does not exist', code: '42883' } }))

    const result = await commitDecisionPackage(BASE_INPUT, DECISION_RULE_VERSION)

    expect(result.success).toBe(false)
  })

  it('returns success: false (does not throw) when Supabase is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_KEY

    const result = await commitDecisionPackage(BASE_INPUT, DECISION_RULE_VERSION)

    expect(result).toEqual({ success: false, error: 'Database not configured' })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
