import { describe, it, expect, vi, beforeEach } from 'vitest'

function chain(result: { data: any; error: any; count?: number | null }) {
  const node: any = {}
  node.select = vi.fn(() => node)
  node.insert = vi.fn(() => node)
  node.eq = vi.fn(() => node)
  node.order = vi.fn(() => node)
  node.then = (resolve: any) => Promise.resolve(result).then(resolve)
  return node
}

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

import { recordProvenance, getProvenanceForDecision, type ProvenanceRecordInput } from '../lib/provenance'

const ORG_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const DECISION_RECORD_ID = '11111111-1111-1111-1111-111111111111'

const BASE_ENTRY: ProvenanceRecordInput = {
  organizationId: ORG_ID,
  decisionRecordId: DECISION_RECORD_ID,
  signalLevel: 'raw_input',
  sourceType: 'applicant_provided',
  fieldName: 'monthly_income',
  rawValue: 3800,
  retrievedAt: '2026-08-29T00:00:00Z',
}

describe('recordProvenance', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'fake-service-key'
  })

  it('returns success with zero writes for an empty input, without querying the database', async () => {
    const result = await recordProvenance([])
    expect(result).toEqual({ success: true, written: 0 })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('inserts one row per entry and reports the count', async () => {
    const table = chain({ data: null, error: null, count: 2 })
    mockFrom.mockImplementation((t: string) => (t === 'provenance_records' ? table : undefined))

    const result = await recordProvenance([
      BASE_ENTRY,
      { ...BASE_ENTRY, fieldName: 'employment_type', rawValue: 'employed' },
    ])

    expect(result).toEqual({ success: true, written: 2 })
    expect(table.insert).toHaveBeenCalledWith(
      [
        expect.objectContaining({ organization_id: ORG_ID, decision_record_id: DECISION_RECORD_ID, field_name: 'monthly_income', raw_value: 3800 }),
        expect.objectContaining({ field_name: 'employment_type', raw_value: 'employed' }),
      ],
      { count: 'exact' }
    )
  })

  it('degrades gracefully (never throws) when the migration has not been applied yet', async () => {
    const table = chain({ data: null, error: { code: '42P01', message: 'relation "provenance_records" does not exist' } })
    mockFrom.mockImplementation(() => table)

    const result = await recordProvenance([BASE_ENTRY])
    expect(result.success).toBe(false)
    expect(result.written).toBe(0)
  })

  it('degrades gracefully when Supabase is not configured', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_KEY

    const result = await recordProvenance([BASE_ENTRY])
    expect(result.success).toBe(false)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('getProvenanceForDecision', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'fake-service-key'
  })

  it('scopes the query by organization_id and decision_record_id, ordered chronologically', async () => {
    const rows = [{ id: 'p1', field_name: 'monthly_income' }]
    const table = chain({ data: rows, error: null })
    mockFrom.mockImplementation((t: string) => (t === 'provenance_records' ? table : undefined))

    const result = await getProvenanceForDecision(DECISION_RECORD_ID, ORG_ID)

    expect(result).toEqual({ success: true, records: rows })
    expect(table.eq).toHaveBeenCalledWith('organization_id', ORG_ID)
    expect(table.eq).toHaveBeenCalledWith('decision_record_id', DECISION_RECORD_ID)
  })
})
