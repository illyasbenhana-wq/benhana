import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Architectural correction (Issue 1): source_lender_org_id must equal the
// authenticated organization — this is the route-level authorization
// check itself, so it's tested at the route level (mocking only the
// collaborators, not the check under test), mirroring
// __tests__/outcomes-route.test.ts's pattern.

const { mockRequirePermission } = vi.hoisted(() => ({ mockRequirePermission: vi.fn() }))
vi.mock('../lib/api-guard', () => ({ requirePermission: mockRequirePermission }))

const { mockGetOrgById } = vi.hoisted(() => ({ mockGetOrgById: vi.fn() }))
vi.mock('../lib/org-context', () => ({ getOrgById: mockGetOrgById }))

const { mockIngestHistoricalCsv } = vi.hoisted(() => ({ mockIngestHistoricalCsv: vi.fn() }))
vi.mock('../lib/historical-ingestion', () => ({ ingestHistoricalCsv: mockIngestHistoricalCsv }))

import { POST } from '../app/api/historical-import/route'

const ORG_A_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const ORG_B_ID = 'bbbbbbbb-0000-0000-0000-000000000002'
const NONEXISTENT_ORG_ID = '99999999-9999-9999-9999-999999999999'

function authOk() {
  return { context: { userId: 'user-1', orgId: ORG_A_ID, role: 'analyst' } }
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/historical-import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_MAPPING = { decision_date: 'date' }

describe('POST /api/historical-import — source_lender_org_id authorization', () => {
  beforeEach(() => {
    mockRequirePermission.mockReset()
    mockGetOrgById.mockReset()
    mockIngestHistoricalCsv.mockReset()
    mockRequirePermission.mockResolvedValue(authOk())
    mockIngestHistoricalCsv.mockResolvedValue({ success: true, batchId: 'batch-1', rowCount: 1, acceptedCount: 1, rejectedCount: 0, duplicateCount: 0 })
  })

  it('omitted source_lender_org_id succeeds as a self-import (defaults to the caller\'s own org)', async () => {
    const res = await POST(postRequest({ csv: 'date\n2026-01-01\n', mapping: VALID_MAPPING }))
    expect(res.status).toBe(201)
    expect(mockGetOrgById).not.toHaveBeenCalled()
    expect(mockIngestHistoricalCsv).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG_A_ID, sourceLenderOrgId: ORG_A_ID }))
  })

  it('source_lender_org_id equal to the caller\'s own org succeeds', async () => {
    mockGetOrgById.mockResolvedValue({ id: ORG_A_ID, name: 'Org A', slug: 'org-a', plan: 'starter', settings: {} })
    const res = await POST(postRequest({ csv: 'date\n2026-01-01\n', mapping: VALID_MAPPING, source_lender_org_id: ORG_A_ID }))
    expect(res.status).toBe(201)
    expect(mockIngestHistoricalCsv).toHaveBeenCalledWith(expect.objectContaining({ sourceLenderOrgId: ORG_A_ID }))
  })

  it('source_lender_org_id referencing a different, real organization is rejected with 403 FORBIDDEN', async () => {
    mockGetOrgById.mockResolvedValue({ id: ORG_B_ID, name: 'Org B', slug: 'org-b', plan: 'starter', settings: {} })
    const res = await POST(postRequest({ csv: 'date\n2026-01-01\n', mapping: VALID_MAPPING, source_lender_org_id: ORG_B_ID }))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error.code).toBe('FORBIDDEN')
    // zero writes: ingestHistoricalCsv is never reached
    expect(mockIngestHistoricalCsv).not.toHaveBeenCalled()
  })

  it('a nonexistent source_lender_org_id preserves the original 400 VALIDATION_ERROR behavior (not 403)', async () => {
    mockGetOrgById.mockResolvedValue(null)
    const res = await POST(postRequest({ csv: 'date\n2026-01-01\n', mapping: VALID_MAPPING, source_lender_org_id: NONEXISTENT_ORG_ID }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error.code).toBe('VALIDATION_ERROR')
    expect(mockIngestHistoricalCsv).not.toHaveBeenCalled()
  })
})
