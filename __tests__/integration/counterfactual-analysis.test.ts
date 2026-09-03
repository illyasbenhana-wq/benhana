import { describe, it, expect } from 'vitest'
import { getTestSupabase, ORG_A_ID, ORG_B_ID, ORG_A_APP_IDS } from './test-helpers'
import { simulateCounterfactual } from '../../lib/counterfactual-analysis'

// Counterfactual Analysis integration tests against ethosfi-test. Writes
// NOTHING (simulateCounterfactual persists nothing, by design) — these
// tests only need a real decision_record + data_snapshot to replay from,
// created as fresh fixtures. Never the three protected Phase 1
// verification applications/decision records.

const supabase = getTestSupabase()

async function insertFixtureDecisionRecord(orgId: string, appId: string, rawData: Record<string, unknown>) {
  const { data: mv, error: mvErr } = await supabase
    .from('model_versions')
    .insert({ score_version: 'v1', prompt_version: `counterfactual-test-fixture-${Date.now()}-${Math.random()}`, model_requested: null, model_responded: null })
    .select('id')
    .single()
  if (mvErr) throw mvErr

  const { data: snapshot, error: snapErr } = await supabase
    .from('data_snapshots')
    .insert({ organization_id: orgId, application_id: appId, source: 'apply_flow', raw_data: rawData })
    .select('id')
    .single()
  if (snapErr) throw snapErr

  const { data: record, error: recErr } = await supabase
    .from('decision_records')
    .insert({
      organization_id: orgId, application_id: appId, data_snapshot_id: snapshot!.id, model_version_id: mv!.id,
      signals_snapshot: [], etho_score: 72, risk_band: 'low', recommendation: 'approve',
      decision: 'approved', decision_reason: ['SCORE_ABOVE_THRESHOLD'], requires_human_review: false, confidence: 0.5,
    })
    .select('id')
    .single()
  if (recErr) throw recErr
  return record!.id as string
}

const FULL_FORM = {
  full_name: 'Counterfactual Test Applicant', email: 'cf-test@example.com', monthly_income: 4000,
  employment_type: 'employed', employer_name: 'Acme', months_at_current_job: 24,
  rent_months_paid: 18, rent_monthly_amount: 1000, gig_platforms: [], gig_monthly_avg: 0,
  savings_amount: 3000, loan_amount: 8000, loan_purpose: 'debt_consolidation', loan_term_months: 24,
  consent_data_use: true, consent_ai_decision: true,
}

describe('Counterfactual Analysis integration', () => {
  it('basic simulation against a real decision_record + data_snapshot', async () => {
    const decisionRecordId = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0], FULL_FORM)

    const outcome = await simulateCounterfactual(decisionRecordId, ORG_A_ID, [
      { field: 'monthly_income', operation: 'percentage_change', value: -50 },
    ])
    expect(outcome.success).toBe(true)
    if (!outcome.success) return
    expect(outcome.result.decision_record_id).toBe(decisionRecordId)
    expect(typeof outcome.result.counterfactual.etho_score).toBe('number')
  })

  it('original preservation: application, snapshot, and decision_record are unchanged after simulation', async () => {
    const decisionRecordId = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0], FULL_FORM)
    const { data: snapshotBefore } = await supabase.from('decision_records').select('data_snapshot_id').eq('id', decisionRecordId).single()
    const { data: rawBefore } = await supabase.from('data_snapshots').select('raw_data').eq('id', snapshotBefore!.data_snapshot_id).single()

    await simulateCounterfactual(decisionRecordId, ORG_A_ID, [
      { field: 'monthly_income', operation: 'set', value: 1 },
      { field: 'employment_type', operation: 'set', value: 'unemployed' },
    ])

    const { data: rawAfter } = await supabase.from('data_snapshots').select('raw_data').eq('id', snapshotBefore!.data_snapshot_id).single()
    expect(rawAfter!.raw_data).toEqual(rawBefore!.raw_data)
    expect((rawAfter!.raw_data as any).monthly_income).toBe(4000)

    const { data: recordAfter } = await supabase.from('decision_records').select('etho_score, decision').eq('id', decisionRecordId).single()
    expect(recordAfter!.etho_score).toBe(72)
    expect(recordAfter!.decision).toBe('approved')
  })

  it('tenant isolation: Org B cannot simulate an Org A decision', async () => {
    const decisionRecordId = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0], FULL_FORM)
    const outcome = await simulateCounterfactual(decisionRecordId, ORG_B_ID, [
      { field: 'monthly_income', operation: 'set', value: 1000 },
    ])
    expect(outcome.success).toBe(false)
    if (outcome.success === true) return
    expect(outcome.error.code).toBe('NOT_FOUND')
  })

  it('a historical decision (older decided_at) can be simulated without rewriting history', async () => {
    const decisionRecordId = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0], FULL_FORM)
    // simulate twice; the underlying decision_record must remain identical both times
    await simulateCounterfactual(decisionRecordId, ORG_A_ID, [{ field: 'loan_amount', operation: 'delta', value: 3000 }])
    await simulateCounterfactual(decisionRecordId, ORG_A_ID, [{ field: 'loan_amount', operation: 'delta', value: -3000 }])

    const { data: record } = await supabase.from('decision_records').select('etho_score, decision_reason').eq('id', decisionRecordId).single()
    expect(record!.etho_score).toBe(72)
    expect(record!.decision_reason).toEqual(['SCORE_ABOVE_THRESHOLD'])
  })

  it('no writes to provenance_records occur as a side effect of a simulation', async () => {
    const decisionRecordId = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0], FULL_FORM)
    const { count: before } = await supabase.from('provenance_records').select('*', { count: 'exact', head: true })
    await simulateCounterfactual(decisionRecordId, ORG_A_ID, [{ field: 'monthly_income', operation: 'percentage_change', value: -10 }])
    const { count: after } = await supabase.from('provenance_records').select('*', { count: 'exact', head: true })
    expect(after).toBe(before)
  })
})
