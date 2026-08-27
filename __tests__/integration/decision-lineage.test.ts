import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getTestSupabase, ORG_A_ID, ORG_A_APP_IDS, ORG_B_ID, ORG_B_APP_ID } from './test-helpers'

// Phase 1 of the decision-intelligence data layer: model_versions ->
// data_snapshots -> decision_records (see supabase/migrations/
// 20260827000000_add_decision_lineage_tables.sql). These tests require
// that migration to be applied to the test project (gwvhlemfubmcnbzdarnx)
// first — they will fail with a missing-relation error until then, the
// same as every other integration test in this suite that depends on a
// not-yet-applied migration.

const supabase = getTestSupabase()

async function insertProbeSnapshot() {
  const { data, error } = await supabase
    .from('data_snapshots')
    .insert({ organization_id: ORG_A_ID, application_id: ORG_A_APP_IDS[0], source: 'apply_flow', raw_data: { probe: 'immutability-test' } })
    .select('id')
    .single()
  if (error) throw error
  return data!.id as string
}

// Same allowlist safety pattern as test-helpers.ts's getTestSupabase() —
// only used here to prove RLS actually blocks the anon key, never to
// grant this client any real capability.
const ALLOWED_TEST_PROJECT_REF = 'gwvhlemfubmcnbzdarnx'
function getTestAnonClient() {
  const url = process.env.TEST_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (!url.includes(ALLOWED_TEST_PROJECT_REF)) {
    throw new Error(`FATAL: anon-key RLS test will ONLY run against the test project (${ALLOWED_TEST_PROJECT_REF}).`)
  }
  return createClient(url, anonKey)
}

describe('Decision lineage (Phase 1) integration', () => {
  describe('model_versions registry', () => {
    it('upserting the same (score_version, prompt_version, model_requested, model_responded) twice yields one row, not two', async () => {
      const key = {
        score_version: 'v2',
        prompt_version: 'test-fixture-v1',
        model_requested: 'test-model',
        model_responded: 'test-model',
      }

      const first = await supabase
        .from('model_versions')
        .upsert(key, { onConflict: 'score_version,prompt_version,model_requested,model_responded' })
        .select('id')
        .single()
      const second = await supabase
        .from('model_versions')
        .upsert(key, { onConflict: 'score_version,prompt_version,model_requested,model_responded' })
        .select('id')
        .single()

      expect(first.error).toBeNull()
      expect(second.error).toBeNull()
      expect(first.data!.id).toBe(second.data!.id)
    })
  })

  describe('data_snapshots + decision_records persistence and FK integrity', () => {
    it('a full snapshot -> decision_record chain can be written and read back with all fields intact', async () => {
      const { data: mv, error: mvErr } = await supabase
        .from('model_versions')
        .upsert(
          { score_version: 'v2', prompt_version: 'test-fixture-v1', model_requested: 'test-model', model_responded: 'test-model' },
          { onConflict: 'score_version,prompt_version,model_requested,model_responded' }
        )
        .select('id')
        .single()
      expect(mvErr).toBeNull()

      const rawData = { full_name: 'Integration Test Applicant', monthly_income: 4200 }
      const { data: snapshot, error: snapErr } = await supabase
        .from('data_snapshots')
        .insert({
          organization_id: ORG_A_ID,
          application_id: ORG_A_APP_IDS[0],
          source: 'apply_flow',
          raw_data: rawData,
        })
        .select('id, raw_data')
        .single()
      expect(snapErr).toBeNull()
      expect(snapshot!.raw_data).toEqual(rawData)

      const { data: record, error: recErr } = await supabase
        .from('decision_records')
        .insert({
          organization_id: ORG_A_ID,
          application_id: ORG_A_APP_IDS[0],
          data_snapshot_id: snapshot!.id,
          model_version_id: mv!.id,
          signals_snapshot: [{ name: 'Income', weight: 30, score: 75, rationale: 'Stable' }],
          score_pillars_snapshot: { trust: { score: 220, max: 300 } },
          etho_score: 78,
          risk_band: 'low',
          recommendation: 'approve',
          decision: 'approved',
          decision_reason: ['SCORE_ABOVE_THRESHOLD'],
          confidence: 0.8,
          requires_human_review: false,
        })
        .select('*')
        .single()

      expect(recErr).toBeNull()
      expect(record!.data_snapshot_id).toBe(snapshot!.id)
      expect(record!.model_version_id).toBe(mv!.id)
      expect(record!.etho_score).toBe(78)
      expect(record!.decided_by).toBe('system') // column default
      expect(record!.decision_id).toBeNull() // unpopulated in Phase 1, by design
    })
  })

  describe('tenant isolation', () => {
    it('a decision_record inserted under Org A is never visible when querying by Org B', async () => {
      const { data: mv } = await supabase
        .from('model_versions')
        .upsert(
          { score_version: 'v1', prompt_version: 'v1', model_requested: null, model_responded: null },
          { onConflict: 'score_version,prompt_version,model_requested,model_responded' }
        )
        .select('id')
        .single()

      const { data: snapshot } = await supabase
        .from('data_snapshots')
        .insert({ organization_id: ORG_A_ID, application_id: ORG_A_APP_IDS[0], source: 'apply_flow', raw_data: { probe: 'org-a-only' } })
        .select('id')
        .single()

      await supabase.from('decision_records').insert({
        organization_id: ORG_A_ID,
        application_id: ORG_A_APP_IDS[0],
        data_snapshot_id: snapshot!.id,
        model_version_id: mv!.id,
        signals_snapshot: [],
        etho_score: 50,
        risk_band: 'medium',
        recommendation: 'review',
        decision: 'review',
        decision_reason: [],
        requires_human_review: true,
      })

      const { data: crossTenantRead } = await supabase
        .from('decision_records')
        .select('id')
        .eq('organization_id', ORG_B_ID)
        .eq('application_id', ORG_A_APP_IDS[0])

      expect(crossTenantRead).toEqual([])

      const { data: sameOrgSnapshotRead } = await supabase
        .from('data_snapshots')
        .select('id')
        .eq('organization_id', ORG_B_ID)
        .contains('raw_data', { probe: 'org-a-only' })

      expect(sameOrgSnapshotRead).toEqual([])
    })

    it('Org B application never resolves a decision_record row scoped to Org A', async () => {
      const { data } = await supabase
        .from('decision_records')
        .select('id')
        .eq('organization_id', ORG_A_ID)
        .eq('application_id', ORG_B_APP_ID)

      expect(data).toEqual([])
    })
  })

  // ─── Database-enforced immutability ───────────────────────────────────────
  // Proves the actual guarantee, not just "no code path calls update" (the
  // static check in __tests__/decision-lineage-immutability.test.ts) — these
  // attempt a real UPDATE/DELETE against the live database using the same
  // service-role client the application itself uses, and assert Postgres
  // itself rejects it via the trg_*_immutable triggers.
  describe('database-enforced immutability (INSERT allowed, UPDATE/DELETE rejected)', () => {
    it('INSERT into data_snapshots succeeds (sanity check for the tests below)', async () => {
      const id = await insertProbeSnapshot()
      expect(id).toBeTruthy()
    })

    it('UPDATE on data_snapshots is rejected by the database, even via the service-role client', async () => {
      const id = await insertProbeSnapshot()
      const { error } = await supabase.from('data_snapshots').update({ source: 'partner_api' }).eq('id', id)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/append-only/i)
    })

    it('DELETE on data_snapshots is rejected by the database, even via the service-role client', async () => {
      const id = await insertProbeSnapshot()
      const { error } = await supabase.from('data_snapshots').delete().eq('id', id)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/append-only/i)
    })

    it('UPDATE on decision_records is rejected by the database', async () => {
      const { data: mv } = await supabase
        .from('model_versions')
        .upsert(
          { score_version: 'v1', prompt_version: 'v1', model_requested: null, model_responded: null },
          { onConflict: 'score_version,prompt_version,model_requested,model_responded' }
        )
        .select('id')
        .single()
      const snapshotId = await insertProbeSnapshot()
      const { data: record } = await supabase
        .from('decision_records')
        .insert({
          organization_id: ORG_A_ID,
          application_id: ORG_A_APP_IDS[0],
          data_snapshot_id: snapshotId,
          model_version_id: mv!.id,
          signals_snapshot: [],
          etho_score: 50,
          risk_band: 'medium',
          recommendation: 'review',
          decision: 'review',
          decision_reason: [],
          requires_human_review: true,
        })
        .select('id')
        .single()

      const { error } = await supabase.from('decision_records').update({ etho_score: 99 }).eq('id', record!.id)
      expect(error).not.toBeNull()
      expect(error!.message).toMatch(/append-only/i)

      const { error: deleteError } = await supabase.from('decision_records').delete().eq('id', record!.id)
      expect(deleteError).not.toBeNull()
      expect(deleteError!.message).toMatch(/append-only/i)
    })
  })

  // ─── Row Level Security ─────────────────────────────────────────────────
  // The application never queries these tables with the anon key today —
  // this proves the forward-looking safety net actually works, not that
  // it's currently load-bearing.
  describe('RLS: anon key is fully blocked, service-role key is unaffected', () => {
    it('anon key cannot read data_snapshots (RLS enabled, zero policies)', async () => {
      const anon = getTestAnonClient()
      const { data, error } = await anon.from('data_snapshots').select('id').limit(1)
      // Zero-policy RLS on Postgres returns an empty result set for a
      // SELECT (not necessarily a top-level error) — either an explicit
      // error or an empty array both satisfy "the anon key sees nothing."
      expect(error !== null || (data ?? []).length === 0).toBe(true)
    })

    it('anon key cannot read decision_records (RLS enabled, zero policies)', async () => {
      const anon = getTestAnonClient()
      const { data, error } = await anon.from('decision_records').select('id').limit(1)
      expect(error !== null || (data ?? []).length === 0).toBe(true)
    })

    it('anon key cannot insert into decision_records (RLS enabled, zero policies)', async () => {
      const anon = getTestAnonClient()
      const { error } = await anon.from('decision_records').insert({
        organization_id: ORG_A_ID,
        application_id: ORG_A_APP_IDS[0],
        data_snapshot_id: '00000000-0000-0000-0000-000000000000',
        model_version_id: '00000000-0000-0000-0000-000000000000',
        signals_snapshot: [],
        etho_score: 1,
        risk_band: 'low',
        recommendation: 'approve',
        decision: 'approved',
        decision_reason: [],
        requires_human_review: false,
      })
      expect(error).not.toBeNull()
    })

    it('service-role key is completely unaffected by RLS (still reads/writes normally)', async () => {
      const id = await insertProbeSnapshot()
      const { data, error } = await supabase.from('data_snapshots').select('id').eq('id', id).single()
      expect(error).toBeNull()
      expect(data!.id).toBe(id)
    })
  })
})
