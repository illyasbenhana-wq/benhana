import { describe, it, expect } from 'vitest'
import { getTestSupabase, ORG_A_ID, ORG_B_ID, ORG_A_APP_IDS, ORG_B_APP_ID } from './test-helpers'

// Phase 2, Step 2 (Outcome Tracking) integration tests, against the real
// outcomes table created by supabase/migrations/
// 20260828000000_add_outcomes_performance_historical_foundation.sql.
// These prove the actual database-level guarantees the route in
// app/api/outcomes/route.ts relies on: append-only immutability (real
// UPDATE/DELETE attempts, not just "no code path calls it"), and that
// decision_record_id/superseded_outcome_id really carry no FK. All fixture
// rows created here are fresh (a throwaway model_version/data_snapshot/
// decision_record pair per test), never the three protected Phase 1
// verification applications.

const supabase = getTestSupabase()

async function insertFixtureDecisionRecord(orgId: string, appId: string) {
  const { data: mv, error: mvErr } = await supabase
    .from('model_versions')
    .upsert(
      { score_version: 'v1', prompt_version: 'outcomes-test-fixture', model_requested: null, model_responded: null },
      { onConflict: 'score_version,prompt_version,model_requested,model_responded' }
    )
    .select('id')
    .single()
  if (mvErr) throw mvErr

  const { data: snapshot, error: snapErr } = await supabase
    .from('data_snapshots')
    .insert({ organization_id: orgId, application_id: appId, source: 'apply_flow', raw_data: { probe: 'outcomes-fixture' } })
    .select('id')
    .single()
  if (snapErr) throw snapErr

  const { data: record, error: recErr } = await supabase
    .from('decision_records')
    .insert({
      organization_id: orgId,
      application_id: appId,
      data_snapshot_id: snapshot!.id,
      model_version_id: mv!.id,
      signals_snapshot: [],
      etho_score: 60,
      risk_band: 'medium',
      recommendation: 'review',
      decision: 'review',
      decision_reason: [],
      requires_human_review: true,
    })
    .select('id')
    .single()
  if (recErr) throw recErr
  return record!.id as string
}

describe('Outcome Tracking (Phase 2, Step 2) integration', () => {
  describe('creation and decision_record linkage', () => {
    it('an outcome can be inserted referencing a real decision_record, with no FK enforcing it', async () => {
      const decisionRecordId = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])

      const { data: outcome, error } = await supabase
        .from('outcomes')
        .insert({ organization_id: ORG_A_ID, decision_record_id: decisionRecordId, status: 'current', observed_at: new Date().toISOString() })
        .select('*')
        .single()

      expect(error).toBeNull()
      expect(outcome!.decision_record_id).toBe(decisionRecordId)
      expect(outcome!.superseded_outcome_id).toBeNull()
    })

    it('an outcome can be inserted referencing a decision_record_id that does not exist anywhere — proving no FK is enforced by the database (integrity is application-layer only)', async () => {
      const nonexistentId = '99999999-9999-9999-9999-999999999999'
      const { data: outcome, error } = await supabase
        .from('outcomes')
        .insert({ organization_id: ORG_A_ID, decision_record_id: nonexistentId, status: 'current', observed_at: new Date().toISOString() })
        .select('id')
        .single()

      expect(error).toBeNull()
      expect(outcome!.id).toBeTruthy()
    })

    it('rejects a status outside the controlled vocabulary at the database level', async () => {
      const decisionRecordId = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
      const { error } = await supabase
        .from('outcomes')
        .insert({ organization_id: ORG_A_ID, decision_record_id: decisionRecordId, status: 'not_a_real_status', observed_at: new Date().toISOString() })

      expect(error).not.toBeNull()
    })
  })

  describe('timeline and corrections', () => {
    it('multiple outcomes can exist for one decision_record, and a correction (superseded_outcome_id) links back without overwriting the original', async () => {
      const decisionRecordId = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])

      const { data: first } = await supabase
        .from('outcomes')
        .insert({ organization_id: ORG_A_ID, decision_record_id: decisionRecordId, status: 'delinquent_30', observed_at: '2026-08-01T00:00:00Z' })
        .select('id, status')
        .single()

      const { data: correction } = await supabase
        .from('outcomes')
        .insert({
          organization_id: ORG_A_ID, decision_record_id: decisionRecordId, status: 'current',
          observed_at: '2026-08-15T00:00:00Z', superseded_outcome_id: first!.id,
        })
        .select('id, status, superseded_outcome_id')
        .single()

      expect(correction!.superseded_outcome_id).toBe(first!.id)

      const { data: timeline } = await supabase
        .from('outcomes')
        .select('id, status, observed_at, superseded_outcome_id')
        .eq('organization_id', ORG_A_ID)
        .eq('decision_record_id', decisionRecordId)
        .order('observed_at', { ascending: true })

      expect(timeline).toHaveLength(2)
      expect(timeline![0].id).toBe(first!.id)
      expect(timeline![0].status).toBe('delinquent_30') // original row unchanged
      expect(timeline![1].id).toBe(correction!.id)

      // re-fetch the original directly: still there, still its original status
      const { data: originalAfter } = await supabase.from('outcomes').select('status').eq('id', first!.id).single()
      expect(originalAfter!.status).toBe('delinquent_30')
    })
  })

  describe('tenant isolation', () => {
    it('an outcome inserted under Org A is never visible when querying by Org B', async () => {
      const decisionRecordId = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
      await supabase.from('outcomes').insert({
        organization_id: ORG_A_ID, decision_record_id: decisionRecordId, status: 'current', observed_at: new Date().toISOString(),
      })

      const { data: crossTenantRead } = await supabase
        .from('outcomes')
        .select('id')
        .eq('organization_id', ORG_B_ID)
        .eq('decision_record_id', decisionRecordId)

      expect(crossTenantRead).toEqual([])
    })
  })

  // ─── Database-enforced immutability ───────────────────────────────────────
  // Proves the actual guarantee (real UPDATE/DELETE against the live
  // database via the service-role client), not just "no application code
  // path calls update" — mirrors __tests__/integration/decision-lineage.test.ts's
  // equivalent proofs for data_snapshots/decision_records.
  describe('database-enforced immutability (INSERT allowed, UPDATE/DELETE rejected)', () => {
    it('UPDATE on outcomes is rejected by the database, even via the service-role client', async () => {
      const decisionRecordId = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
      const { data: outcome } = await supabase
        .from('outcomes')
        .insert({ organization_id: ORG_A_ID, decision_record_id: decisionRecordId, status: 'current', observed_at: new Date().toISOString() })
        .select('id')
        .single()

      const { error } = await supabase.from('outcomes').update({ status: 'default' }).eq('id', outcome!.id)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/append-only/i)
    })

    it('DELETE on outcomes is rejected by the database, even via the service-role client', async () => {
      const decisionRecordId = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
      const { data: outcome } = await supabase
        .from('outcomes')
        .insert({ organization_id: ORG_A_ID, decision_record_id: decisionRecordId, status: 'current', observed_at: new Date().toISOString() })
        .select('id')
        .single()

      const { error } = await supabase.from('outcomes').delete().eq('id', outcome!.id)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/append-only/i)
    })
  })
})
