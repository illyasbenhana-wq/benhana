import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same chainable-mock style as __tests__/audit-engine.test.ts /
// __tests__/outcomes-route.test.ts. Covers .from(table).select().eq().eq()
// (existing-fingerprints lookup, awaited directly) and
// .from(table).insert().select().single() (batch insert) / .insert()
// (records insert, awaited directly, no .select()).
function chain(result: { data: any; error: any }) {
  const node: any = {}
  node.select = vi.fn(() => node)
  node.insert = vi.fn(() => node)
  node.eq = vi.fn(() => node)
  node.single = vi.fn(() => Promise.resolve(result))
  node.then = (resolve: any) => Promise.resolve(result).then(resolve)
  return node
}

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

import { ingestHistoricalCsv, HistoricalFieldMapping } from '../lib/historical-ingestion'

const ORG_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const SOURCE_ID = 'aaaaaaaa-0000-0000-0000-000000000001'

const MAPPING: HistoricalFieldMapping = {
  decision_date: 'date', status: 'status', loan_amount: 'amount', external_id: null,
}

function setupTables(overrides: { existing?: any[]; batchId?: string } = {}) {
  const tables: Record<string, ReturnType<typeof chain>> = {
    historical_decision_records: chain({ data: overrides.existing ?? [], error: null }),
    historical_import_batches: chain({ data: { id: overrides.batchId ?? 'batch-1' }, error: null }),
  }
  // historical_decision_records is used twice: once for the existing-
  // fingerprints SELECT (thenable), once for the records INSERT (also
  // thenable, no .select()) — same chain object handles both since both
  // paths just resolve `result`.
  mockFrom.mockImplementation((table: string) => tables[table])
  return tables
}

describe('ingestHistoricalCsv', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'fake-service-key'
  })

  it('A/B/C/D. valid CSV creates a batch and accepts every structurally valid row', async () => {
    setupTables()
    const csv = 'date,status,amount\n2026-01-01,current,1000\n2026-01-02,delinquent_30,2000\n'
    const result = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    expect(result.success).toBe(true)
    expect(result.batchId).toBe('batch-1')
    expect(result.rowCount).toBe(2)
    expect(result.acceptedCount).toBe(2)
    expect(result.rejectedCount).toBe(0)
    expect(result.duplicateCount).toBe(0)
  })

  it('G. preserves the raw row verbatim in raw_payload', async () => {
    const tables = setupTables()
    const csv = 'date,status,amount,extra_unmapped_field\n2026-01-01,current,1000,some lender-specific value\n'
    await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    const insertedRecords = tables.historical_decision_records.insert.mock.calls.find(
      (c: any) => Array.isArray(c[0])
    )![0]
    expect(insertedRecords[0].raw_payload).toEqual({
      date: '2026-01-01', status: 'current', amount: '1000', extra_unmapped_field: 'some lender-specific value',
    })
  })

  it('H. explicit field mapping is stored on the batch, unchanged', async () => {
    const tables = setupTables()
    const csv = 'date,status,amount\n2026-01-01,current,1000\n'
    await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    expect(tables.historical_import_batches.insert).toHaveBeenCalledWith(
      expect.objectContaining({ field_mapping: MAPPING })
    )
  })

  it('I/J. a row missing the required decision_date is rejected with an explicit reason', async () => {
    const tables = setupTables()
    const csv = 'date,status,amount\n,current,1000\n'
    const result = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    expect(result.acceptedCount).toBe(0)
    expect(result.rejectedCount).toBe(1)
    const insertedRecords = tables.historical_decision_records.insert.mock.calls.find((c: any) => Array.isArray(c[0]))![0]
    expect(insertedRecords[0].validation_status).toBe('rejected')
    expect(insertedRecords[0].validation_reasons).toEqual(['MISSING_DECISION_DATE'])
  })

  it('K. a row with a status outside the controlled vocabulary is rejected', async () => {
    const tables = setupTables()
    const csv = 'date,status,amount\n2026-01-01,not_a_real_status,1000\n'
    const result = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    expect(result.rejectedCount).toBe(1)
    const insertedRecords = tables.historical_decision_records.insert.mock.calls.find((c: any) => Array.isArray(c[0]))![0]
    expect(insertedRecords[0].validation_reasons).toEqual(['INVALID_STATUS_VALUE'])
  })

  it('L. a row with an unparseable decision_date is rejected', async () => {
    const tables = setupTables()
    const csv = 'date,status,amount\nnot-a-date,current,1000\n'
    const result = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    expect(result.rejectedCount).toBe(1)
    const insertedRecords = tables.historical_decision_records.insert.mock.calls.find((c: any) => Array.isArray(c[0]))![0]
    expect(insertedRecords[0].validation_reasons).toEqual(['INVALID_DECISION_DATE'])
  })

  it('M/P. deterministic fingerprint: identical rows -> identical fingerprint, different rows -> different fingerprint', async () => {
    const tables = setupTables()
    const csv = 'date,status,amount\n2026-01-01,current,1000\n2026-01-01,delinquent_30,1000\n'
    await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    const insertedRecords = tables.historical_decision_records.insert.mock.calls.find((c: any) => Array.isArray(c[0]))![0]
    expect(insertedRecords[0].fingerprint).not.toBe(insertedRecords[1].fingerprint)
    expect(typeof insertedRecords[0].fingerprint).toBe('string')
    expect(insertedRecords[0].fingerprint).toHaveLength(64) // sha256 hex
  })

  it('N. a row matching an already-imported fingerprint is counted as a duplicate, not inserted again', async () => {
    const csv = 'date,status,amount\n2026-01-01,current,1000\n'

    // First run (no prior state) establishes the real fingerprint this
    // row computes to, via the insert call.
    const tablesFirst = setupTables()
    const first = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })
    expect(first.success).toBe(true)
    const firstFingerprint = tablesFirst.historical_decision_records.insert.mock.calls.find((c: any) => Array.isArray(c[0]))![0][0].fingerprint

    // Second run: simulate that fingerprint already existing in the table.
    const tablesSecond = setupTables({ existing: [{ fingerprint: firstFingerprint }] })
    const result = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    expect(result.duplicateCount).toBe(1)
    expect(result.acceptedCount).toBe(0)
    expect(result.rejectedCount).toBe(0)
    // no records insert call with any rows — nothing to insert
    const recordsInsertCalls = tablesSecond.historical_decision_records.insert.mock.calls.filter((c: any) => Array.isArray(c[0]) && c[0].length > 0)
    expect(recordsInsertCalls).toEqual([])
  })

  it('O. re-importing the exact same file in one call dedupes repeats within that file too', async () => {
    const tables = setupTables()
    const csv = 'date,status,amount\n2026-01-01,current,1000\n2026-01-01,current,1000\n'
    const result = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    expect(result.rowCount).toBe(2)
    expect(result.acceptedCount).toBe(1)
    expect(result.duplicateCount).toBe(1)
  })

  it('W. batch counters are internally consistent: row_count === accepted + rejected + duplicate', async () => {
    const tables = setupTables()
    const csv = 'date,status,amount\n2026-01-01,current,1000\n,current,1000\n2026-01-01,current,1000\n'
    const result = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    expect(result.rowCount).toBe(3)
    expect(result.acceptedCount + result.rejectedCount + result.duplicateCount).toBe(result.rowCount)
  })

  it('X. running ingestHistoricalCsv twice on identical input (with no prior state) produces identical counts', async () => {
    const csv = 'date,status,amount\n2026-01-01,current,1000\n2026-01-02,delinquent_30,2000\n'
    setupTables()
    const first = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })
    setupTables()
    const second = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    expect(second.rowCount).toBe(first.rowCount)
    expect(second.acceptedCount).toBe(first.acceptedCount)
    expect(second.rejectedCount).toBe(first.rejectedCount)
  })

  it('Y. empty CSV (no data rows) is rejected, no batch is created', async () => {
    const tables = setupTables()
    const result = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv: 'date,status,amount\n', mapping: MAPPING })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no data rows/)
    expect(tables.historical_import_batches.insert).not.toHaveBeenCalled()
  })

  it('Z. malformed mapping (decision_date column not present in CSV headers) is rejected before any row is processed', async () => {
    const tables = setupTables()
    const badMapping: HistoricalFieldMapping = { ...MAPPING, decision_date: 'nonexistent_column' }
    const result = await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv: 'date,status,amount\n2026-01-01,current,1000\n', mapping: badMapping })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/does not match any CSV column header/)
    expect(tables.historical_import_batches.insert).not.toHaveBeenCalled()
  })

  it('origin is always "imported"', async () => {
    const tables = setupTables()
    const csv = 'date,status,amount\n2026-01-01,current,1000\n'
    await ingestHistoricalCsv({ organizationId: ORG_ID, sourceLenderOrgId: SOURCE_ID, importedBy: null, csv, mapping: MAPPING })

    const insertedRecords = tables.historical_decision_records.insert.mock.calls.find((c: any) => Array.isArray(c[0]))![0]
    expect(insertedRecords[0].origin).toBe('imported')
  })
})
