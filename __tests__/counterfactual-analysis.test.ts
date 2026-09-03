import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ApplicationForm } from '@/types'

const { mockReplayDecision } = vi.hoisted(() => ({ mockReplayDecision: vi.fn() }))
vi.mock('../lib/decision-replay', () => ({ replayDecision: mockReplayDecision }))

import {
  validateCounterfactualChanges, applyCounterfactualChanges, simulateCounterfactual,
} from '../lib/counterfactual-analysis'

const BASE_FORM: ApplicationForm = {
  full_name: 'Test Applicant', email: 'test@example.com', monthly_income: 4000,
  employment_type: 'employed', employer_name: 'Acme', months_at_current_job: 24,
  rent_months_paid: 18, rent_monthly_amount: 1000, gig_platforms: [], gig_monthly_avg: 0,
  savings_amount: 3000, loan_amount: 8000, loan_purpose: 'debt_consolidation', loan_term_months: 24,
  consent_data_use: true, consent_ai_decision: true,
}

const ORG_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const DECISION_RECORD_ID = '11111111-1111-1111-1111-111111111111'

function baseReplaySuccess(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    success: true as const,
    result: {
      decision_record_id: DECISION_RECORD_ID,
      organization_id: ORG_ID,
      decided_at: '2026-01-01T00:00:00Z',
      original_decision: {
        etho_score: 72, risk_band: 'low', recommendation: 'approve', decision: 'approved',
        decision_reason: ['SCORE_ABOVE_THRESHOLD'], confidence: 0.5, requires_human_review: false,
        decided_by: 'system', override_reason: null,
      },
      model_version: { id: 'mv-1', score_version: 'v2', prompt_version: '2.0.0', model_requested: 'claude', model_responded: 'claude' },
      data_snapshot: { id: 'snap-1', captured_at: '2026-01-01T00:00:00Z', source: 'apply_flow', raw_data: BASE_FORM },
      lineage: { application_id: 'app-1', score_id: 'score-1', decision_id: null },
      post_decision_outcomes: [],
      replayed_at: '2026-01-02T00:00:00Z',
      ...overrides,
    },
  }
}

describe('validateCounterfactualChanges', () => {
  it('accepts a valid numeric percentage_change and a valid categorical set', () => {
    const result = validateCounterfactualChanges(
      [{ field: 'monthly_income', operation: 'percentage_change', value: -10 }, { field: 'employment_type', operation: 'set', value: 'gig' }],
      BASE_FORM
    )
    expect(result.valid).toBe(true)
  })

  it('rejects a non-array input', () => {
    const result = validateCounterfactualChanges({ field: 'monthly_income' }, BASE_FORM)
    expect(result.valid).toBe(false)
  })

  it('rejects a field outside the allowlist', () => {
    const result = validateCounterfactualChanges([{ field: 'full_name', operation: 'set', value: 'Someone Else' }], BASE_FORM)
    expect(result.valid).toBe(false)
    if (result.valid === true) return
    expect(result.errors[0].field).toBe('full_name')
  })

  it('rejects an unsupported operation', () => {
    const result = validateCounterfactualChanges([{ field: 'monthly_income', operation: 'multiply', value: 2 }], BASE_FORM)
    expect(result.valid).toBe(false)
  })

  it('rejects a non-numeric value for a numeric field', () => {
    const result = validateCounterfactualChanges([{ field: 'monthly_income', operation: 'set', value: 'lots' }], BASE_FORM)
    expect(result.valid).toBe(false)
  })

  it('rejects an employment_type value outside the enum', () => {
    const result = validateCounterfactualChanges([{ field: 'employment_type', operation: 'set', value: 'retired' }], BASE_FORM)
    expect(result.valid).toBe(false)
  })

  it('rejects a change that would produce a negative resulting value', () => {
    const result = validateCounterfactualChanges([{ field: 'monthly_income', operation: 'delta', value: -999999 }], BASE_FORM)
    expect(result.valid).toBe(false)
  })

  it('rejects arbitrary formula-shaped input (no expression evaluation exists)', () => {
    const result = validateCounterfactualChanges([{ field: 'monthly_income', operation: 'set', value: '4000 * 2' }], BASE_FORM)
    expect(result.valid).toBe(false)
  })
})

describe('applyCounterfactualChanges', () => {
  it('never mutates the original form object', () => {
    const before = JSON.stringify(BASE_FORM)
    applyCounterfactualChanges(BASE_FORM, [{ field: 'monthly_income', operation: 'set', value: 1 }])
    expect(JSON.stringify(BASE_FORM)).toBe(before)
  })

  it('applies percentage_change correctly', () => {
    const result = applyCounterfactualChanges(BASE_FORM, [{ field: 'monthly_income', operation: 'percentage_change', value: -10 }])
    expect(result.monthly_income).toBe(3600)
  })

  it('applies delta correctly', () => {
    const result = applyCounterfactualChanges(BASE_FORM, [{ field: 'loan_amount', operation: 'delta', value: 2000 }])
    expect(result.loan_amount).toBe(10000)
  })

  it('applies multiple changes deterministically', () => {
    const changes = [
      { field: 'monthly_income' as const, operation: 'percentage_change' as const, value: -10 },
      { field: 'employment_type' as const, operation: 'set' as const, value: 'gig' as const },
    ]
    const a = applyCounterfactualChanges(BASE_FORM, changes)
    const b = applyCounterfactualChanges(BASE_FORM, changes)
    expect(a).toEqual(b)
  })
})

describe('simulateCounterfactual', () => {
  beforeEach(() => {
    mockReplayDecision.mockReset()
  })

  it('basic simulation: a known income drop produces a lower score and reports the difference', async () => {
    mockReplayDecision.mockResolvedValue(baseReplaySuccess())
    const outcome = await simulateCounterfactual(DECISION_RECORD_ID, ORG_ID, [
      { field: 'monthly_income', operation: 'percentage_change', value: -50 },
    ])
    expect(outcome.success).toBe(true)
    if (!outcome.success) return
    expect(outcome.result.original.etho_score).toBe(72)
    expect(outcome.result.difference.etho_score_delta).toBe(outcome.result.counterfactual.etho_score - 72)
    expect(outcome.result.fidelity.engine_used).toBe('ethoscore-v2-deterministic')
  })

  it('reproducibility: same decision + same changes = same result (excluding the timestamp)', async () => {
    mockReplayDecision.mockResolvedValue(baseReplaySuccess())
    const changes = [{ field: 'monthly_income', operation: 'percentage_change', value: -10 }]
    const first = await simulateCounterfactual(DECISION_RECORD_ID, ORG_ID, changes)
    const second = await simulateCounterfactual(DECISION_RECORD_ID, ORG_ID, changes)
    expect(first.success && second.success).toBe(true)
    if (first.success === false || second.success === false) return
    const { simulated_at: _a, ...firstRest } = first.result
    const { simulated_at: _b, ...secondRest } = second.result
    expect(firstRest).toEqual(secondRest)
  })

  it('tenant isolation: a cross-organization decision is not found (propagated from decision-replay)', async () => {
    mockReplayDecision.mockResolvedValue({ success: false, error: { code: 'NOT_FOUND', message: 'decision_record not found for this organization' } })
    const outcome = await simulateCounterfactual(DECISION_RECORD_ID, 'bbbbbbbb-0000-0000-0000-000000000002', [
      { field: 'monthly_income', operation: 'set', value: 1000 },
    ])
    expect(outcome.success).toBe(false)
    if (outcome.success === true) return
    expect(outcome.error.code).toBe('NOT_FOUND')
  })

  it('validation: unsupported field is rejected before any scoring is attempted', async () => {
    mockReplayDecision.mockResolvedValue(baseReplaySuccess())
    const outcome = await simulateCounterfactual(DECISION_RECORD_ID, ORG_ID, [{ field: 'full_name', operation: 'set', value: 'x' }])
    expect(outcome.success).toBe(false)
    if (outcome.success === true) return
    expect(outcome.error.code).toBe('VALIDATION_ERROR')
  })

  it('evidence unavailable: a decision whose data_snapshot could not be resolved is rejected, not silently guessed', async () => {
    mockReplayDecision.mockResolvedValue(baseReplaySuccess({ data_snapshot: { available: false, reason: 'data_snapshots row not found' } }))
    const outcome = await simulateCounterfactual(DECISION_RECORD_ID, ORG_ID, [{ field: 'monthly_income', operation: 'set', value: 1000 }])
    expect(outcome.success).toBe(false)
    if (outcome.success === true) return
    expect(outcome.error.code).toBe('EVIDENCE_UNAVAILABLE')
  })

  it('governance: does not mutate the original evidence returned by decision-replay', async () => {
    const replayResult = baseReplaySuccess()
    mockReplayDecision.mockResolvedValue(replayResult)
    const before = JSON.stringify(replayResult)
    await simulateCounterfactual(DECISION_RECORD_ID, ORG_ID, [{ field: 'monthly_income', operation: 'percentage_change', value: -20 }])
    expect(JSON.stringify(replayResult)).toBe(before)
  })

  it('multiple changes combine deterministically into one simulation', async () => {
    mockReplayDecision.mockResolvedValue(baseReplaySuccess())
    const outcome = await simulateCounterfactual(DECISION_RECORD_ID, ORG_ID, [
      { field: 'monthly_income', operation: 'percentage_change', value: -30 },
      { field: 'loan_amount', operation: 'delta', value: 5000 },
    ])
    expect(outcome.success).toBe(true)
    if (!outcome.success) return
    expect(outcome.result.changes).toHaveLength(2)
  })
})
