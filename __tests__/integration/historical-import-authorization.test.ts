import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getTestSupabase, ORG_A_ID, ORG_B_ID } from './test-helpers'

// Architectural correction (Issue 1), real-database proof: only
// lib/api-guard's requirePermission is mocked (to inject a controlled
// org context without a real session/JWT) — getOrgById and
// ingestHistoricalCsv run for real against ethosfi-test, so this proves
// the actual authorization behavior, not a mocked approximation of it.

const { mockRequirePermission } = vi.hoisted(() => ({ mockRequirePermission: vi.fn() }))
vi.mock('../../lib/api-guard', () => ({ requirePermission: mockRequirePermission }))

import { POST } from '../../app/api/historical-import/route'

const supabase = getTestSupabase()

function authAsOrgA() {
  return { context: { userId: 'aaaaaaaa-0000-0000-0000-0000000000aa', orgId: ORG_A_ID, role: 'analyst' } }
}

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/historical-import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_MAPPING = { decision_date: 'date' }

describe('Historical Ingestion authorization — real ethosfi-test', () => {
  beforeEach(() => {
    mockRequirePermission.mockReset()
    mockRequirePermission.mockResolvedValue(authAsOrgA())
  })

  it('an authorized self-import (own org) succeeds and creates a real batch', async () => {
    const csv = 'date,status,amount\n2026-05-01,current,1000\n'
    const res = await POST(postRequest({ csv, mapping: VALID_MAPPING, source_lender_org_id: ORG_A_ID }))
    expect(res.status).toBe(201)
    const json = await res.json()
    const { data: batch } = await supabase.from('historical_import_batches').select('organization_id, source_lender_org_id').eq('id', json.data.batch_id).single()
    expect(batch!.organization_id).toBe(ORG_A_ID)
    expect(batch!.source_lender_org_id).toBe(ORG_A_ID)
  })

  it('citing a different real organization (ORG_B_ID) as source_lender_org_id is rejected with 403 and creates zero rows', async () => {
    const { count: batchesBefore } = await supabase.from('historical_import_batches').select('*', { count: 'exact', head: true })
    const { count: recordsBefore } = await supabase.from('historical_decision_records').select('*', { count: 'exact', head: true })

    const csv = 'date,status,amount\n2026-05-02,current,2000\n'
    const res = await POST(postRequest({ csv, mapping: VALID_MAPPING, source_lender_org_id: ORG_B_ID }))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error.code).toBe('FORBIDDEN')

    const { count: batchesAfter } = await supabase.from('historical_import_batches').select('*', { count: 'exact', head: true })
    const { count: recordsAfter } = await supabase.from('historical_decision_records').select('*', { count: 'exact', head: true })
    expect(batchesAfter).toBe(batchesBefore)
    expect(recordsAfter).toBe(recordsBefore)
  })

  it('no information about ORG_B beyond its own existing public organizations row is leaked by the 403 response', async () => {
    const csv = 'date,status,amount\n2026-05-03,current,2500\n'
    const res = await POST(postRequest({ csv, mapping: VALID_MAPPING, source_lender_org_id: ORG_B_ID }))
    const json = await res.json()
    // the error message names no org-specific data (name/slug/plan) —
    // just the generic authorization rule
    expect(JSON.stringify(json)).not.toMatch(/name|slug|plan/i)
  })

  it('existing self-import behavior (omitted source_lender_org_id) is unaffected by this correction', async () => {
    const csv = 'date,status,amount\n2026-05-04,current,3000\n'
    const res = await POST(postRequest({ csv, mapping: VALID_MAPPING }))
    expect(res.status).toBe(201)
  })
})
