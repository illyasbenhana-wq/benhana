import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Same chainable-mock style as __tests__/audit-engine.test.ts — enough to
// cover the .from(table).select().eq().eq().maybeSingle() /
// .insert().select().single() / .select().eq().eq().order().order() shapes
// app/api/outcomes/route.ts actually uses, without a real database or a
// running dev server (the HTTP-integration approach used by
// __tests__/integration/endpoint-isolation.test.ts requires a live server,
// which is exercised separately and isn't needed for this route's own
// validation/authorization logic).
function chain(result: { data: any; error: any }) {
  const node: any = {}
  node.select = vi.fn(() => node)
  node.insert = vi.fn(() => node)
  node.eq = vi.fn(() => node)
  node.order = vi.fn(() => node)
  node.maybeSingle = vi.fn(() => Promise.resolve(result))
  node.single = vi.fn(() => Promise.resolve(result))
  // GET's query is awaited directly (no .single()/.maybeSingle()) — make
  // the node itself thenable so `await query` resolves to `result`.
  node.then = (resolve: any) => Promise.resolve(result).then(resolve)
  return node
}

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

const { mockRequirePermission } = vi.hoisted(() => ({ mockRequirePermission: vi.fn() }))
vi.mock('../lib/api-guard', () => ({
  requirePermission: mockRequirePermission,
}))

const { mockRecordEvent } = vi.hoisted(() => ({ mockRecordEvent: vi.fn() }))
vi.mock('../lib/workflow-engine', () => ({
  recordEvent: mockRecordEvent,
}))

import { POST, GET } from '../app/api/outcomes/route'

const ORG_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const DECISION_RECORD_ID = '11111111-1111-1111-1111-111111111111'
const PRIOR_OUTCOME_ID = '22222222-2222-2222-2222-222222222222'
const OTHER_DECISION_RECORD_ID = '33333333-3333-3333-3333-333333333333'

function authOk() {
  return { context: { userId: 'user-1', orgId: ORG_ID, role: 'analyst' } }
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/outcomes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function getRequest(qs: string) {
  return new NextRequest(`http://localhost/api/outcomes${qs}`, { method: 'GET' })
}

describe('POST /api/outcomes', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockRequirePermission.mockReset()
    mockRecordEvent.mockReset()
    mockRecordEvent.mockResolvedValue({ success: true })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'fake-service-key'
  })

  it('returns the requirePermission error unchanged when unauthorized', async () => {
    const errorResponse = new Response(null, { status: 403 })
    mockRequirePermission.mockResolvedValue({ error: errorResponse })

    const res = await POST(postRequest({}))
    expect(res).toBe(errorResponse)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects an invalid status not in the controlled vocabulary', async () => {
    mockRequirePermission.mockResolvedValue(authOk())

    const res = await POST(postRequest({
      decision_record_id: DECISION_RECORD_ID,
      status: 'not_a_real_status',
      observed_at: '2026-08-28T00:00:00Z',
    }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error.code).toBe('VALIDATION_ERROR')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects an invalid decision_record_id (not a UUID)', async () => {
    mockRequirePermission.mockResolvedValue(authOk())

    const res = await POST(postRequest({
      decision_record_id: 'not-a-uuid',
      status: 'current',
      observed_at: '2026-08-28T00:00:00Z',
    }))

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects an invalid observed_at timestamp', async () => {
    mockRequirePermission.mockResolvedValue(authOk())

    const res = await POST(postRequest({
      decision_record_id: DECISION_RECORD_ID,
      status: 'current',
      observed_at: 'not-a-timestamp',
    }))

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rejects when decision_record does not exist for this organization', async () => {
    mockRequirePermission.mockResolvedValue(authOk())
    mockFrom.mockImplementation((table: string) => {
      if (table === 'decision_records') return chain({ data: null, error: null })
      throw new Error(`unexpected table: ${table}`)
    })

    const res = await POST(postRequest({
      decision_record_id: DECISION_RECORD_ID,
      status: 'current',
      observed_at: '2026-08-28T00:00:00Z',
    }))

    expect(res.status).toBe(404)
  })

  it('creates a valid outcome for an existing, same-organization decision record', async () => {
    mockRequirePermission.mockResolvedValue(authOk())
    const tables: Record<string, ReturnType<typeof chain>> = {
      decision_records: chain({ data: { id: DECISION_RECORD_ID, organization_id: ORG_ID }, error: null }),
      outcomes: chain({
        data: {
          id: 'new-outcome-id', organization_id: ORG_ID, decision_record_id: DECISION_RECORD_ID,
          status: 'current', observed_at: '2026-08-28T00:00:00Z', superseded_outcome_id: null,
          created_at: '2026-08-28T00:00:01Z',
        },
        error: null,
      }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const res = await POST(postRequest({
      decision_record_id: DECISION_RECORD_ID,
      status: 'current',
      observed_at: '2026-08-28T00:00:00Z',
    }))

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.data.id).toBe('new-outcome-id')
    expect(tables.outcomes.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        decision_record_id: DECISION_RECORD_ID,
        status: 'current',
        observed_at: '2026-08-28T00:00:00Z',
        superseded_outcome_id: null,
      })
    )
    // complementary, non-blocking audit trail
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'decision_record', entityId: DECISION_RECORD_ID, eventType: 'outcome_recorded' })
    )
  })

  it('rejects a correction whose superseded_outcome_id does not exist for this organization', async () => {
    mockRequirePermission.mockResolvedValue(authOk())
    const tables: Record<string, ReturnType<typeof chain>> = {
      decision_records: chain({ data: { id: DECISION_RECORD_ID, organization_id: ORG_ID }, error: null }),
      outcomes: chain({ data: null, error: null }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const res = await POST(postRequest({
      decision_record_id: DECISION_RECORD_ID,
      status: 'current',
      observed_at: '2026-08-28T00:00:00Z',
      superseded_outcome_id: PRIOR_OUTCOME_ID,
    }))

    expect(res.status).toBe(404)
  })

  it('rejects a correction whose superseded_outcome_id belongs to a different decision_record', async () => {
    mockRequirePermission.mockResolvedValue(authOk())
    const tables: Record<string, ReturnType<typeof chain>> = {
      decision_records: chain({ data: { id: DECISION_RECORD_ID, organization_id: ORG_ID }, error: null }),
      outcomes: chain({
        data: { id: PRIOR_OUTCOME_ID, organization_id: ORG_ID, decision_record_id: OTHER_DECISION_RECORD_ID },
        error: null,
      }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const res = await POST(postRequest({
      decision_record_id: DECISION_RECORD_ID,
      status: 'current',
      observed_at: '2026-08-28T00:00:00Z',
      superseded_outcome_id: PRIOR_OUTCOME_ID,
    }))

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error.message).toMatch(/different decision_record/)
  })

  it('accepts a valid correction referencing a prior outcome on the same decision_record', async () => {
    mockRequirePermission.mockResolvedValue(authOk())
    const tables: Record<string, ReturnType<typeof chain>> = {
      decision_records: chain({ data: { id: DECISION_RECORD_ID, organization_id: ORG_ID }, error: null }),
      outcomes: chain({
        data: { id: PRIOR_OUTCOME_ID, organization_id: ORG_ID, decision_record_id: DECISION_RECORD_ID },
        error: null,
      }),
    }
    mockFrom.mockImplementation((table: string) => tables[table])

    const res = await POST(postRequest({
      decision_record_id: DECISION_RECORD_ID,
      status: 'current',
      observed_at: '2026-08-28T00:00:00Z',
      superseded_outcome_id: PRIOR_OUTCOME_ID,
    }))

    expect(res.status).toBe(201)
    expect(tables.outcomes.insert).toHaveBeenCalledWith(
      expect.objectContaining({ superseded_outcome_id: PRIOR_OUTCOME_ID })
    )
  })
})

describe('GET /api/outcomes', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockRequirePermission.mockReset()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-project.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'fake-service-key'
  })

  it('rejects a missing/invalid decision_record_id query parameter', async () => {
    mockRequirePermission.mockResolvedValue(authOk())

    const res = await GET(getRequest('?decision_record_id=not-a-uuid'))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns the timeline scoped to organization + decision_record, ordered chronologically', async () => {
    mockRequirePermission.mockResolvedValue(authOk())
    const rows = [
      { id: 'o1', status: 'delinquent_30', observed_at: '2026-08-01T00:00:00Z' },
      { id: 'o2', status: 'current', observed_at: '2026-08-15T00:00:00Z', superseded_outcome_id: 'o1' },
    ]
    mockFrom.mockImplementation((table: string) => {
      if (table === 'outcomes') return chain({ data: rows, error: null })
      throw new Error(`unexpected table: ${table}`)
    })

    const res = await GET(getRequest(`?decision_record_id=${DECISION_RECORD_ID}`))
    expect(res.status).toBe(200)
    const json = await res.json()
    // both the original and the superseding row are present — history is
    // never collapsed into a single current status by this endpoint
    expect(json.data).toEqual(rows)
    expect(json.meta.count).toBe(2)
  })
})
