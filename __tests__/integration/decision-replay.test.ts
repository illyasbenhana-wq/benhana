import { describe, it, expect } from 'vitest'
import { getTestSupabase, ORG_A_ID, ORG_B_ID, ORG_A_APP_IDS, createFixtureOrg } from './test-helpers'
import { replayDecision } from '../../lib/decision-replay'

// Phase 2, Step 5 integration tests against ethosfi-test. All fixtures are
// fresh (prompt_version tagged 'decision-replay-test-fixture'), never the
// three protected Phase 1 verification applications/decision records.
// Nothing here attempts UPDATE/DELETE against any immutable table.

const supabase = getTestSupabase()

async function insertFixtureDecisionRecord(orgId: string, appId: string) {
  const { data: mv, error: mvErr } = await supabase
    .from('model_versions')
    .insert({ score_version: 'v1', prompt_version: `decision-replay-test-fixture-${Date.now()}-${Math.random()}`, model_requested: null, model_responded: null })
    .select('id')
    .single()
  if (mvErr) throw mvErr

  const rawData = { probe: 'decision-replay-fixture', monthly_income: 4200 }
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
      signals_snapshot: [], etho_score: 71, risk_band: 'medium', recommendation: 'review',
      decision: 'review', decision_reason: ['NEEDS_HUMAN_REVIEW'], requires_human_review: true,
    })
    .select('id')
    .single()
  if (recErr) throw recErr
  return { decisionRecordId: record!.id as string, rawData, snapshotId: snapshot!.id as string, modelVersionId: mv!.id as string }
}

describe('Decision Replay (Phase 2, Step 5) integration', () => {
  it('A/E/F/G/H. replays a real native decision, returning the frozen snapshot evidence, not live application state', async () => {
    // Dedicated fixture org + a freshly-inserted application, not one of
    // the three protected ORG_A_ID verification applications — this test
    // mutates the application afterward, and the protected fixture rows
    // must never be written to (see file header comment).
    const fixtureOrgId = await createFixtureOrg('decision-replay-mutation')
    const { data: fixtureApp, error: appErr } = await supabase
      .from('applications')
      .insert({ organization_id: fixtureOrgId, status: 'pending', full_name: 'Decision Replay Mutation Fixture', email: 'replay-mutation@example.com', monthly_income: 4200, employment_type: 'employed', months_at_current_job: 12, rent_months_paid: 12, rent_monthly_amount: 900, gig_platforms: [], gig_monthly_avg: 0, savings_amount: 1000, loan_amount: 5000, loan_purpose: 'test', loan_term_months: 12, consent_data_use: true, consent_ai_decision: true })
      .select('id')
      .single()
    if (appErr) throw appErr
    const fixtureAppId = fixtureApp!.id as string

    const { decisionRecordId, rawData, snapshotId, modelVersionId } = await insertFixtureDecisionRecord(fixtureOrgId, fixtureAppId)

    // Mutate the live application AFTER the decision was recorded — the
    // replay must still show the original frozen income, not this edit.
    await supabase.from('applications').update({ monthly_income: 999888 }).eq('id', fixtureAppId)

    const outcome = await replayDecision(decisionRecordId, fixtureOrgId)
    expect(outcome.success).toBe(true)
    if (outcome.success === false) return

    expect(outcome.result.decision_record_id).toBe(decisionRecordId)
    expect((outcome.result.data_snapshot as any).id).toBe(snapshotId)
    expect((outcome.result.data_snapshot as any).raw_data).toEqual(rawData)
    expect((outcome.result.data_snapshot as any).raw_data.monthly_income).toBe(4200) // NOT 999888
    expect((outcome.result.model_version as any).id).toBe(modelVersionId)
  })

  it('B/D. cross-organization replay is rejected: Org B cannot replay an Org A decision', async () => {
    const { decisionRecordId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
    const outcome = await replayDecision(decisionRecordId, ORG_B_ID)

    expect(outcome.success).toBe(false)
    if (outcome.success === true) return
    expect(outcome.error.code).toBe('NOT_FOUND')
  })

  it('C. a nonexistent decision_record_id returns NOT_FOUND', async () => {
    const outcome = await replayDecision('99999999-9999-9999-9999-999999999999', ORG_A_ID)
    expect(outcome.success).toBe(false)
    if (outcome.success === true) return
    expect(outcome.error.code).toBe('NOT_FOUND')
  })

  it('I/J/R. replay never writes to decision_records, scores, applications, data_snapshots, model_versions, outcomes, or performance_windows', async () => {
    const before: Record<string, number | null> = {}
    for (const t of ['decision_records', 'scores', 'applications', 'data_snapshots', 'model_versions', 'outcomes', 'performance_windows']) {
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
      before[t] = count
    }

    const { decisionRecordId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
    // capture counts AFTER fixture creation (which itself legitimately adds
    // to decision_records/data_snapshots/model_versions), then confirm
    // replay itself adds nothing further.
    const afterFixture: Record<string, number | null> = {}
    for (const t of ['decision_records', 'scores', 'applications', 'data_snapshots', 'model_versions', 'outcomes', 'performance_windows']) {
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
      afterFixture[t] = count
    }

    const outcome = await replayDecision(decisionRecordId, ORG_A_ID)
    expect(outcome.success).toBe(true)

    for (const t of ['decision_records', 'scores', 'applications', 'data_snapshots', 'model_versions', 'outcomes', 'performance_windows']) {
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
      expect(count).toBe(afterFixture[t])
    }
    expect(afterFixture.decision_records).toBeGreaterThan(before.decision_records as number) // sanity: fixture really was added
  })

  it('K. an outcome observed after the decision is returned only in post_decision_outcomes, never as original evidence', async () => {
    const { decisionRecordId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
    await supabase.from('outcomes').insert({ organization_id: ORG_A_ID, decision_record_id: decisionRecordId, status: 'current', observed_at: new Date().toISOString() })

    const outcome = await replayDecision(decisionRecordId, ORG_A_ID)
    expect(outcome.success).toBe(true)
    if (outcome.success === false) return
    expect(outcome.result.post_decision_outcomes).toHaveLength(1)
    expect(outcome.result.post_decision_outcomes[0].status).toBe('current')
    expect(outcome.result.original_decision.recommendation).toBe('review') // unaffected by the outcome
  })

  it('L/M. replay is deterministic against the real database: repeated calls return identical reconstructed content', async () => {
    const { decisionRecordId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
    const first = await replayDecision(decisionRecordId, ORG_A_ID)
    const second = await replayDecision(decisionRecordId, ORG_A_ID)

    expect(first.success && second.success).toBe(true)
    if (first.success === false || second.success === false) return
    const { replayed_at: _a, ...firstRest } = first.result
    const { replayed_at: _b, ...secondRest } = second.result
    expect(firstRest).toEqual(secondRest)
  })

  it('N. a historical_decision_records row is never returned by native replay', async () => {
    // Insert a historical fixture and confirm replaying its id (as if it
    // were a decision_record id) correctly returns NOT_FOUND rather than
    // silently treating historical data as a native decision.
    const { data: batch } = await supabase.from('historical_import_batches').insert({
      organization_id: ORG_A_ID, source_lender_org_id: ORG_A_ID, field_mapping: { probe: 'decision-replay-test' }, row_count: 1, accepted_count: 1,
    }).select('id').single()
    const { data: historicalRow } = await supabase.from('historical_decision_records').insert({
      organization_id: ORG_A_ID, source_lender_org_id: ORG_A_ID, import_batch_id: batch!.id,
      raw_payload: { probe: 'decision-replay-test-should-not-replay' }, validation_status: 'accepted',
      fingerprint: `decision-replay-test-${Date.now()}`,
    }).select('id').single()

    const outcome = await replayDecision(historicalRow!.id, ORG_A_ID)
    expect(outcome.success).toBe(false)
    if (outcome.success === true) return
    expect(outcome.error.code).toBe('NOT_FOUND')
  })
})
