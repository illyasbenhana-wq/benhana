import { describe, it, expect } from 'vitest'
import { getTestSupabase, ORG_A_ID, ORG_B_ID, ORG_A_APP_IDS, createFixtureOrg } from './test-helpers'
import { recordProvenance, getProvenanceForDecision } from '../../lib/provenance'

// Data Provenance integration tests against ethosfi-test. Requires
// supabase/migrations/20260829000000_add_provenance_records.sql to be
// applied first (same manual-apply convention as every prior migration
// this session — I cannot execute DDL myself). All fixtures are fresh,
// never the three protected Phase 1 verification applications/decision
// records. provenance_records is append-only (immutable trigger) —
// nothing here attempts UPDATE/DELETE except to prove the trigger itself.

const supabase = getTestSupabase()

async function insertFixtureDecisionRecord(orgId: string, appId: string) {
  const { data: mv, error: mvErr } = await supabase
    .from('model_versions')
    .insert({ score_version: 'v1', prompt_version: `provenance-test-fixture-${Date.now()}-${Math.random()}`, model_requested: null, model_responded: null })
    .select('id')
    .single()
  if (mvErr) throw mvErr

  const { data: snapshot, error: snapErr } = await supabase
    .from('data_snapshots')
    .insert({ organization_id: orgId, application_id: appId, source: 'apply_flow', raw_data: { probe: 'provenance-fixture' } })
    .select('id')
    .single()
  if (snapErr) throw snapErr

  const { data: record, error: recErr } = await supabase
    .from('decision_records')
    .insert({
      organization_id: orgId, application_id: appId, data_snapshot_id: snapshot!.id, model_version_id: mv!.id,
      signals_snapshot: [], etho_score: 65, risk_band: 'medium', recommendation: 'review',
      decision: 'review', decision_reason: [], requires_human_review: true,
    })
    .select('id')
    .single()
  if (recErr) throw recErr
  return { decisionRecordId: record!.id as string, snapshotId: snapshot!.id as string, modelVersionId: mv!.id as string }
}

describe('Data Provenance integration', () => {
  it('creation: records are written with correct linkage and are readable back', async () => {
    const { decisionRecordId, snapshotId, modelVersionId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])

    const writeResult = await recordProvenance([
      {
        organizationId: ORG_A_ID, decisionRecordId, signalLevel: 'raw_input', sourceType: 'applicant_provided',
        fieldName: 'monthly_income', rawValue: 4200, retrievedAt: new Date().toISOString(), dataSnapshotId: snapshotId,
      },
      {
        organizationId: ORG_A_ID, decisionRecordId, signalLevel: 'model_interpretation', sourceType: 'model_generated',
        fieldName: 'Income Stability', normalizedValue: { score: 70, weight: 25 }, retrievedAt: new Date().toISOString(), modelVersionId,
      },
    ])
    expect(writeResult.success).toBe(true)
    expect(writeResult.written).toBe(2)

    const readResult = await getProvenanceForDecision(decisionRecordId, ORG_A_ID)
    expect(readResult.success).toBe(true)
    expect(readResult.records).toHaveLength(2)
    const rawInput = readResult.records.find(r => r.field_name === 'monthly_income')!
    expect(rawInput.raw_value).toBe(4200)
    expect(rawInput.data_snapshot_id).toBe(snapshotId)
    const modelInterp = readResult.records.find(r => r.field_name === 'Income Stability')!
    expect(modelInterp.model_version_id).toBe(modelVersionId)
  })

  it('tenant isolation: Org B cannot read Org A provenance', async () => {
    const { decisionRecordId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
    await recordProvenance([{
      organizationId: ORG_A_ID, decisionRecordId, signalLevel: 'raw_input', sourceType: 'applicant_provided',
      fieldName: 'monthly_income', rawValue: 4200, retrievedAt: new Date().toISOString(),
    }])

    const crossTenantRead = await getProvenanceForDecision(decisionRecordId, ORG_B_ID)
    expect(crossTenantRead.success).toBe(true)
    expect(crossTenantRead.records).toEqual([])
  })

  it('immutability: UPDATE/DELETE on provenance_records is rejected by the database', async () => {
    const { decisionRecordId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
    await recordProvenance([{
      organizationId: ORG_A_ID, decisionRecordId, signalLevel: 'raw_input', sourceType: 'applicant_provided',
      fieldName: 'monthly_income', rawValue: 4200, retrievedAt: new Date().toISOString(),
    }])
    const { data: rows } = await supabase.from('provenance_records').select('id').eq('decision_record_id', decisionRecordId)
    const id = rows![0].id

    const { error: updateError } = await supabase.from('provenance_records').update({ raw_value: 999 }).eq('id', id)
    expect(updateError).not.toBeNull()
    expect(updateError!.message).toMatch(/append-only/i)

    const { error: deleteError } = await supabase.from('provenance_records').delete().eq('id', id)
    expect(deleteError).not.toBeNull()
    expect(deleteError!.message).toMatch(/append-only/i)
  })

  it('model attribution: provenance correctly identifies the exact model_version row, not the current production model', async () => {
    const { decisionRecordId, modelVersionId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
    await recordProvenance([{
      organizationId: ORG_A_ID, decisionRecordId, signalLevel: 'model_interpretation', sourceType: 'model_generated',
      fieldName: 'Trust', retrievedAt: new Date().toISOString(), modelVersionId,
    }])

    const result = await getProvenanceForDecision(decisionRecordId, ORG_A_ID)
    expect(result.records[0].model_version_id).toBe(modelVersionId)
  })

  it('snapshot linkage: provenance correctly links to the frozen data_snapshot, not the live application', async () => {
    const { decisionRecordId, snapshotId } = await insertFixtureDecisionRecord(ORG_A_ID, ORG_A_APP_IDS[0])
    await recordProvenance([{
      organizationId: ORG_A_ID, decisionRecordId, signalLevel: 'raw_input', sourceType: 'applicant_provided',
      fieldName: 'monthly_income', rawValue: 4200, retrievedAt: new Date().toISOString(), dataSnapshotId: snapshotId,
    }])

    const result = await getProvenanceForDecision(decisionRecordId, ORG_A_ID)
    expect(result.records[0].data_snapshot_id).toBe(snapshotId)
  })

  it('governance: commitDecisionPackage() end-to-end call generates provenance for a real decision, writing only to provenance_records', async () => {
    // Exercises the real integration point (lib/audit-engine.ts), not just
    // the provenance module in isolation. Uses a dedicated fixture
    // organization (not ORG_A_ID) so this INSERT into `applications` never
    // inflates the exact-count assertions multi-tenancy.test.ts and
    // scoring-pipeline.test.ts make against the permanent, hand-seeded
    // ORG_A_ID fixture.
    //
    // Production Closure note: as of 2026-09-03, recordAuditEvent() was
    // replaced by commitDecisionPackage(), which calls the
    // commit_decision_package Postgres RPC defined in
    // supabase/migrations/20260903000002_atomic_decision_package.sql.
    // That migration has NOT been applied to this database (no direct
    // DDL execution capability in this environment, standing limitation
    // all session) — this test is expected to FAIL against the current,
    // un-migrated ethosfi-test with a "function commit_decision_package
    // does not exist" error until that migration is applied manually via
    // the Supabase SQL Editor. This is a documented, expected consequence
    // of an unappliable migration, not a defect in this test or in
    // commitDecisionPackage() itself — see the Production Readiness
    // Closure report's Test Results / Real DB Verification section.
    const { commitDecisionPackage } = await import('../../lib/audit-engine')
    const fixtureOrgId = await createFixtureOrg('provenance-governance')
    const { data: application, error: appErr } = await supabase
      .from('applications')
      .insert({ organization_id: fixtureOrgId, status: 'pending', full_name: 'Provenance Governance Test', email: 'prov-gov@example.com', monthly_income: 3900, employment_type: 'employed', months_at_current_job: 20, rent_months_paid: 12, rent_monthly_amount: 900, gig_platforms: [], gig_monthly_avg: 0, savings_amount: 2000, loan_amount: 5000, loan_purpose: 'test', loan_term_months: 12, consent_data_use: true, consent_ai_decision: true })
      .select('id')
      .single()
    expect(appErr).toBeNull()

    const packageResult = await commitDecisionPackage(
      {
        applicationId: application!.id, orgId: fixtureOrgId, source: 'apply_flow',
        inputSnapshot: { monthly_income: 3900, employment_type: 'employed' },
        scoreVersion: 'v1', modelVersionLabel: 'mock-v1', promptVersion: 'v1',
        modelRequested: null, modelResponded: null,
        rawPrompt: 'mock', rawResponse: 'mock', confidenceOverall: null,
        ethoScore: 60, riskBand: 'medium', aiSummary: 'test summary', recommendation: 'review',
        factors: [{ name: 'Income Stability', weight: 25, score: 60, rationale: 'test' }], scorePillars: null,
        decision: 'review', reasonCodes: [], confidence: 0.5, requiresHumanReview: true,
      },
      'threshold-70-50-v1'
    )
    expect(packageResult.success).toBe(true)
    if (packageResult.success === false) return

    const provenance = await getProvenanceForDecision(packageResult.decisionRecordId, fixtureOrgId)
    expect(provenance.success).toBe(true)
    // 2 raw input fields + 1 signal = 3
    expect(provenance.records).toHaveLength(3)
  })
})
