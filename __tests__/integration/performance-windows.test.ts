import { describe, it, expect } from 'vitest'
import { getTestSupabase, ORG_A_ID, ORG_B_ID, ORG_A_APP_IDS, ORG_B_APP_ID } from './test-helpers'
import { calculateAndPersistPerformanceWindows } from '../../lib/performance-windows'

// Phase 2, Step 3 integration tests: exercises the real read+write path
// (calculateAndPersistPerformanceWindows) against ethosfi-test, proving
// what the pure-function unit tests (__tests__/performance-windows.test.ts)
// can't: real upsert/no-duplicate-rows behavior, real tenant isolation via
// the actual organization_id-scoped queries, and that only native
// decision_records are ever read. All fixtures here are fresh
// (prompt_version: 'perf-windows-test-fixture'), never the three protected
// Phase 1 verification applications/decision records, and outcomes/
// decision_records/data_snapshots are never deleted (they're append-only
// by design) -- only performance_windows rows are written, which is the
// one table this module is allowed to write to.

const supabase = getTestSupabase()
const FAR_FUTURE = new Date('2030-01-01T00:00:00Z')

async function insertFixtureDecisionRecord(orgId: string, appId: string, decidedAt: string) {
  const { data: mv, error: mvErr } = await supabase
    .from('model_versions')
    .insert({ score_version: 'v1', prompt_version: `perf-windows-test-fixture-${Date.now()}-${Math.random()}`, model_requested: null, model_responded: null })
    .select('id')
    .single()
  if (mvErr) throw mvErr

  const { data: snapshot, error: snapErr } = await supabase
    .from('data_snapshots')
    .insert({ organization_id: orgId, application_id: appId, source: 'apply_flow', raw_data: { probe: 'perf-windows-fixture' } })
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
      decided_at: decidedAt,
    })
    .select('id, model_version_id')
    .single()
  if (recErr) throw recErr
  return { decisionRecordId: record!.id as string, modelVersionId: record!.model_version_id as string }
}

describe('Performance Windows (Phase 2, Step 3) integration', () => {
  it('L. calculation is organization-scoped: an Org A decision never contributes to an Org B window', async () => {
    const { decisionRecordId, modelVersionId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0], '2026-01-01T00:00:00Z')
    await supabase.from('outcomes').insert({ organization_id: ORG_A_ID, decision_record_id: decisionRecordId, status: 'current', observed_at: '2026-01-10T00:00:00Z' })

    const resultA = await calculateAndPersistPerformanceWindows(ORG_A_ID, FAR_FUTURE)
    expect(resultA.success).toBe(true)

    const { data: rowsForOrgB } = await supabase
      .from('performance_windows')
      .select('id')
      .eq('organization_id', ORG_B_ID)
      .eq('model_version_id', modelVersionId)

    expect(rowsForOrgB).toEqual([])

    const { data: rowsForOrgA } = await supabase
      .from('performance_windows')
      .select('id, window_days, sample_size')
      .eq('organization_id', ORG_A_ID)
      .eq('model_version_id', modelVersionId)

    expect(rowsForOrgA).toHaveLength(5)
  })

  it('M/N. recalculation upserts in place — no duplicate rows, and rerunning twice is stable', async () => {
    const { decisionRecordId, modelVersionId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0], '2026-01-01T00:00:00Z')
    await supabase.from('outcomes').insert({ organization_id: ORG_A_ID, decision_record_id: decisionRecordId, status: 'current', observed_at: '2026-01-10T00:00:00Z' })

    const first = await calculateAndPersistPerformanceWindows(ORG_A_ID, FAR_FUTURE)
    expect(first.success).toBe(true)

    const { data: afterFirst } = await supabase
      .from('performance_windows')
      .select('id, sample_size')
      .eq('organization_id', ORG_A_ID)
      .eq('model_version_id', modelVersionId)
      .order('window_days', { ascending: true })
    expect(afterFirst).toHaveLength(5)
    const idsAfterFirst = afterFirst!.map(r => r.id).sort()

    const second = await calculateAndPersistPerformanceWindows(ORG_A_ID, FAR_FUTURE)
    expect(second.success).toBe(true)

    const { data: afterSecond } = await supabase
      .from('performance_windows')
      .select('id, sample_size')
      .eq('organization_id', ORG_A_ID)
      .eq('model_version_id', modelVersionId)
      .order('window_days', { ascending: true })

    // still exactly 5 rows (no duplicates), same row identities (upsert
    // updated in place rather than inserting new rows), same values
    expect(afterSecond).toHaveLength(5)
    expect(afterSecond!.map(r => r.id).sort()).toEqual(idsAfterFirst)
    expect(afterSecond).toEqual(afterFirst)
  })

  it('O. only native decision_records are read — a historical_decision_records row is never included', async () => {
    // Insert a historical_decision_records fixture (Step 1 table, storage
    // only) for the same org, and confirm it has zero effect on the
    // calculation: it's a different table entirely, never queried by
    // calculateAndPersistPerformanceWindows.
    const { data: batch, error: batchErr } = await supabase
      .from('historical_import_batches')
      .insert({
        organization_id: ORG_A_ID, source_lender_org_id: ORG_A_ID,
        field_mapping: { probe: 'perf-windows-test' }, row_count: 1, accepted_count: 1,
      })
      .select('id')
      .single()
    expect(batchErr).toBeNull()

    const { error: historicalErr } = await supabase.from('historical_decision_records').insert({
      organization_id: ORG_A_ID, source_lender_org_id: ORG_A_ID, import_batch_id: batch!.id,
      raw_payload: { probe: 'perf-windows-test-should-be-ignored' }, validation_status: 'accepted',
      fingerprint: `perf-windows-test-${Date.now()}`,
    })
    expect(historicalErr).toBeNull()

    const { decisionRecordId, modelVersionId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0], '2026-01-01T00:00:00Z')
    await supabase.from('outcomes').insert({ organization_id: ORG_A_ID, decision_record_id: decisionRecordId, status: 'current', observed_at: '2026-01-10T00:00:00Z' })

    const result = await calculateAndPersistPerformanceWindows(ORG_A_ID, FAR_FUTURE)
    expect(result.success).toBe(true)

    const { data: w30 } = await supabase
      .from('performance_windows')
      .select('sample_size')
      .eq('organization_id', ORG_A_ID)
      .eq('model_version_id', modelVersionId)
      .eq('window_days', 30)
      .single()

    // sample_size reflects exactly the one native decision_record fixture,
    // not inflated by the historical_decision_records row above.
    expect(w30!.sample_size).toBe(1)
  })
})
