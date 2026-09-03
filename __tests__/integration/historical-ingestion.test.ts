import { describe, it, expect } from 'vitest'
import { getTestSupabase, ORG_A_ID, ORG_B_ID } from './test-helpers'
import { ingestHistoricalCsv, HistoricalFieldMapping } from '../../lib/historical-ingestion'

// Phase 2, Step 4 integration tests against the real ethosfi-test
// database. historical_import_batches/historical_decision_records are
// both append-only (immutable trigger, see Step 1's migration) — no test
// here attempts UPDATE/DELETE against them, and none is needed: nothing
// created is cleaned up, matching the same precedent already established
// for data_snapshots/decision_records/outcomes fixtures in this suite.
//
// Fixture determinism: the fingerprint lib/historical-ingestion.ts
// computes is derived from the normalized (mapped) field values —
// decision_date/status/loan_amount here — not from organization_id,
// import_batch_id, or wall-clock import time. Earlier versions of this
// file used fixed literal CSV values (e.g. a hardcoded date), which
// meant every *repeated* run of this suite against the same ethosfi-test
// database reproduced the exact same fingerprint as a prior run and was
// legitimately (correctly) detected as a duplicate — not a bug in
// duplicate detection, but a non-unique fixture. Each test below embeds
// RUN_ID (a per-file-execution timestamp) into the CSV's amount field so
// every fresh execution of this file produces fingerprints that have
// never existed in the database before, while every within-test
// duplicate/non-duplicate assertion still uses byte-identical CSV
// content where the test actually needs two calls to collide (test R),
// preserving the real duplicate-detection semantics being tested.
const RUN_ID = Date.now()

const supabase = getTestSupabase()

const MAPPING: HistoricalFieldMapping = {
  decision_date: 'date', status: 'status', loan_amount: 'amount', external_id: null,
}

describe('Historical Ingestion (Phase 2, Step 4) integration', () => {
  it('Q. tenant isolation: Org A cannot see Org B historical records, and vice versa', async () => {
    const csvA = `date,status,amount\n2026-04-01,current,${RUN_ID}01\n`
    const resultA = await ingestHistoricalCsv({ organizationId: ORG_A_ID, sourceLenderOrgId: ORG_A_ID, importedBy: null, csv: csvA, mapping: MAPPING })
    expect(resultA.success).toBe(true)

    const { data: crossTenantRead } = await supabase
      .from('historical_decision_records')
      .select('id')
      .eq('organization_id', ORG_B_ID)
      .eq('import_batch_id', resultA.batchId)

    expect(crossTenantRead).toEqual([])

    const { data: sameOrgRead } = await supabase
      .from('historical_decision_records')
      .select('id')
      .eq('organization_id', ORG_A_ID)
      .eq('import_batch_id', resultA.batchId)

    expect(sameOrgRead).toHaveLength(1)
  })

  it('R. source-lender scoping: duplicate detection never crosses source_lender_org_id even within the same organization_id', async () => {
    // Same CSV content reused deliberately for both calls below — this
    // test is specifically about whether identical content is (correctly)
    // NOT treated as a duplicate across a different source_lender_org_id,
    // so the content itself must stay identical between the two calls;
    // RUN_ID still makes it unique versus any *other* test run.
    const csv = `date,status,amount\n2026-04-05,current,${RUN_ID}02\n`

    const resultSourceA = await ingestHistoricalCsv({ organizationId: ORG_A_ID, sourceLenderOrgId: ORG_A_ID, importedBy: null, csv, mapping: MAPPING })
    expect(resultSourceA.duplicateCount).toBe(0)
    expect(resultSourceA.acceptedCount).toBe(1)

    // Same organization_id, but a DIFFERENT source_lender_org_id (ORG_B_ID
    // used here purely as a second real, existing org id for scoping —
    // not implying Org B is actually a lender partner) — must NOT be
    // treated as a duplicate of the Org-A-sourced row above.
    const resultSourceB = await ingestHistoricalCsv({ organizationId: ORG_A_ID, sourceLenderOrgId: ORG_B_ID, importedBy: null, csv, mapping: MAPPING })
    expect(resultSourceB.duplicateCount).toBe(0)
    expect(resultSourceB.acceptedCount).toBe(1)
  })

  it('S/T. historical records never create a native decision_records row or a performance_windows row', async () => {
    const { count: decisionRecordsBefore } = await supabase.from('decision_records').select('*', { count: 'exact', head: true }).eq('organization_id', ORG_A_ID)
    const { count: perfWindowsBefore } = await supabase.from('performance_windows').select('*', { count: 'exact', head: true }).eq('organization_id', ORG_A_ID)

    const csv = `date,status,amount\n2026-04-10,current,${RUN_ID}03\n`
    const result = await ingestHistoricalCsv({ organizationId: ORG_A_ID, sourceLenderOrgId: ORG_A_ID, importedBy: null, csv, mapping: MAPPING })
    expect(result.success).toBe(true)
    expect(result.acceptedCount).toBe(1)

    const { count: decisionRecordsAfter } = await supabase.from('decision_records').select('*', { count: 'exact', head: true }).eq('organization_id', ORG_A_ID)
    const { count: perfWindowsAfter } = await supabase.from('performance_windows').select('*', { count: 'exact', head: true }).eq('organization_id', ORG_A_ID)

    // ingesting one accepted historical row created zero decision_records
    // and zero performance_windows rows — the only new row is in
    // historical_decision_records itself.
    expect(decisionRecordsAfter).toBe(decisionRecordsBefore)
    expect(perfWindowsAfter).toBe(perfWindowsBefore)

    const { data: historicalRow } = await supabase.from('historical_decision_records').select('id, origin').eq('import_batch_id', result.batchId).single()
    expect(historicalRow!.origin).toBe('imported')
  })

  it('U. no writes occur to native scoring tables (applications/scores/outcomes counts unaffected by this import)', async () => {
    const { count: appsBefore } = await supabase.from('applications').select('*', { count: 'exact', head: true })
    const { count: scoresBefore } = await supabase.from('scores').select('*', { count: 'exact', head: true })
    const { count: outcomesBefore } = await supabase.from('outcomes').select('*', { count: 'exact', head: true })

    const csv = `date,status,amount\n2026-04-15,current,${RUN_ID}04\n`
    const result = await ingestHistoricalCsv({ organizationId: ORG_A_ID, sourceLenderOrgId: ORG_A_ID, importedBy: null, csv, mapping: MAPPING })
    expect(result.success).toBe(true)

    const { count: appsAfter } = await supabase.from('applications').select('*', { count: 'exact', head: true })
    const { count: scoresAfter } = await supabase.from('scores').select('*', { count: 'exact', head: true })
    const { count: outcomesAfter } = await supabase.from('outcomes').select('*', { count: 'exact', head: true })

    expect(appsAfter).toBe(appsBefore)
    expect(scoresAfter).toBe(scoresBefore)
    expect(outcomesAfter).toBe(outcomesBefore)
  })

  it('immutability: UPDATE/DELETE on historical_decision_records is rejected by the database', async () => {
    const csv = `date,status,amount\n2026-04-20,current,${RUN_ID}05\n`
    const result = await ingestHistoricalCsv({ organizationId: ORG_A_ID, sourceLenderOrgId: ORG_A_ID, importedBy: null, csv, mapping: MAPPING })
    const { data: rows } = await supabase.from('historical_decision_records').select('id').eq('import_batch_id', result.batchId)
    const id = rows![0].id

    const { error: updateError } = await supabase.from('historical_decision_records').update({ validation_status: 'accepted' }).eq('id', id)
    expect(updateError).not.toBeNull()
    expect(updateError!.message).toMatch(/append-only/i)

    const { error: deleteError } = await supabase.from('historical_decision_records').delete().eq('id', id)
    expect(deleteError).not.toBeNull()
    expect(deleteError!.message).toMatch(/append-only/i)
  })

  it('immutability: UPDATE/DELETE on historical_import_batches is rejected by the database', async () => {
    const csv = `date,status,amount\n2026-04-25,current,${RUN_ID}06\n`
    const result = await ingestHistoricalCsv({ organizationId: ORG_A_ID, sourceLenderOrgId: ORG_A_ID, importedBy: null, csv, mapping: MAPPING })

    const { error: updateError } = await supabase.from('historical_import_batches').update({ batch_status: 'failed' }).eq('id', result.batchId)
    expect(updateError).not.toBeNull()
    expect(updateError!.message).toMatch(/append-only/i)

    const { error: deleteError } = await supabase.from('historical_import_batches').delete().eq('id', result.batchId)
    expect(deleteError).not.toBeNull()
    expect(deleteError!.message).toMatch(/append-only/i)
  })
})
