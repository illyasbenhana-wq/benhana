import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  getTestSupabase,
  ORG_A_ID, ORG_B_ID,
  ORG_A_APP_IDS, ORG_B_APP_ID,
  ORG_A_CASE_ID, ORG_B_CASE_ID,
  createTestApiKey, cleanupTestApiKeys,
} from './test-helpers'

/**
 * These tests hit the REAL Next.js API routes via HTTP fetch,
 * authenticated with real API keys scoped to specific orgs.
 * The dev server must be running against the test database.
 *
 * To run: set TEST_BASE_URL=http://localhost:3847 in .env.test
 * and start the dev server with test env vars before running.
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3847'
const HTTP_TIMEOUT = 30000
const supabase = getTestSupabase()

let orgAKey: string
let orgBKey: string

let serverRunning: boolean | null = null

async function requireServer(): Promise<void> {
  if (serverRunning === null) {
    try {
      await fetch(`${BASE_URL}/api/demo-data`, { signal: AbortSignal.timeout(3000) })
      serverRunning = true
    } catch {
      serverRunning = false
    }
  }
  if (!serverRunning) {
    throw new Error(
      `Test server not running at ${BASE_URL}. Start it with: __tests__/start-test-server.cmd`
    )
  }
}

beforeAll(async () => {
  await cleanupTestApiKeys()
  orgAKey = await createTestApiKey(ORG_A_ID, [
    'applications:read', 'applications:write', 'scores:read', 'cases:read', 'cases:write', 'audit_events:read',
  ])
  orgBKey = await createTestApiKey(ORG_B_ID, [
    'applications:read', 'scores:read', 'cases:read',
  ])
})

afterAll(async () => {
  await cleanupTestApiKeys()
})

function authHeaders(apiKey: string) {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

describe('HTTP endpoint isolation: /api/v1/applications/[id]/benchmark', () => {
  it('POSITIVE: Org A key can access Org A application benchmark', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/applications/${ORG_A_APP_IDS[0]}/benchmark`,
      { headers: authHeaders(orgAKey) }
    )

    // May return 404 if insufficient cohort, but should NOT be 401/403
    expect([200, 404]).toContain(res.status)
    const body = await res.json()

    if (res.status === 200) {
      expect(body.data).toBeDefined()
      expect(body.data.basis).toBeDefined()
    }
  })

  it('NEGATIVE: Org A key cannot benchmark Org B application', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/applications/${ORG_B_APP_ID}/benchmark`,
      { headers: authHeaders(orgAKey) }
    )

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBeDefined()
    // Confirm no Org B data leaks in the response
    expect(JSON.stringify(body)).not.toContain('Dave Beta')
  })

  it('NEGATIVE: no API key returns 401', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/applications/${ORG_A_APP_IDS[0]}/benchmark`
    )

    expect(res.status).toBe(401)
  })
})

describe('HTTP endpoint isolation: /api/v1/risk/snapshot', () => {
  it('POSITIVE: Org A key gets risk snapshot with only Org A data', async () => {
    await requireServer()

    // Generate a snapshot first
    const postRes = await fetch(
      `${BASE_URL}/api/v1/risk/snapshot`,
      { method: 'POST', headers: authHeaders(orgAKey) }
    )

    // POST needs applications:write scope which orgAKey has
    expect([200, 201]).toContain(postRes.status)

    const getRes = await fetch(
      `${BASE_URL}/api/v1/risk/snapshot`,
      { headers: authHeaders(orgAKey) }
    )

    expect(getRes.status).toBe(200)
    const body = await getRes.json()
    expect(body.data).toBeDefined()

    // Confirm no Org B entity names leak into the snapshot
    const bodyStr = JSON.stringify(body)
    expect(bodyStr).not.toContain('Beta Entity')
    expect(bodyStr).not.toContain('Dave Beta')
    expect(bodyStr).not.toContain(ORG_B_ID)
  })

  it('NEGATIVE: Org B key sees only Org B data in snapshot', async () => {
    await requireServer()

    // Org B key only has read scope — can GET but not POST
    // First check if a snapshot exists for Org B
    const res = await fetch(
      `${BASE_URL}/api/v1/risk/snapshot`,
      { headers: authHeaders(orgBKey) }
    )

    // 404 (no snapshot generated yet) or 200 — either way, no Org A data
    expect([200, 404]).toContain(res.status)
    const body = await res.json()
    const bodyStr = JSON.stringify(body)
    expect(bodyStr).not.toContain('Alpha Entity')
    expect(bodyStr).not.toContain(ORG_A_ID)
  })
})

describe('HTTP endpoint isolation: /api/v1/cases/[id]/ai-review', () => {
  it('NEGATIVE: Org A key cannot trigger AI review on Org B case', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/cases/${ORG_B_CASE_ID}/ai-review`,
      { method: 'POST', headers: authHeaders(orgAKey) }
    )

    // Should be 404 (case not found for this org) or 500 (ANTHROPIC_API_KEY not set)
    // but NEVER 200 with Org B data
    expect(res.status).not.toBe(200)
    const body = await res.json()
    const bodyStr = JSON.stringify(body)
    expect(bodyStr).not.toContain('Beta Entity')
    expect(bodyStr).not.toContain('TEST-B-001')
  })

  it('NEGATIVE: Org B key cannot trigger AI review on Org A case', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/cases/${ORG_A_CASE_ID}/ai-review`,
      { method: 'POST', headers: authHeaders(orgBKey) }
    )

    // Org B key has cases:read but not cases:write — should be 403
    expect(res.status).toBe(403)
  })

  it('POSITIVE: Org A key can access its own case via GET', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/cases/${ORG_A_CASE_ID}`,
      { headers: authHeaders(orgAKey) }
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.data.case.entity_name).toBe('Alpha Entity')
    expect(body.data.case.organization_id).toBe(ORG_A_ID)
  })

  it('NEGATIVE: Org A key gets 404 for Org B case via GET', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/cases/${ORG_B_CASE_ID}`,
      { headers: authHeaders(orgAKey) }
    )

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('Beta Entity')
  })
})

describe('HTTP endpoint isolation: /api/v1/applications (POST)', () => {
  it('POSITIVE: Org A key can create an application scoped to Org A', async () => {
    await requireServer()

    const res = await fetch(`${BASE_URL}/api/v1/applications`, {
      method: 'POST',
      headers: authHeaders(orgAKey),
      body: JSON.stringify({
        full_name: 'Isolation Test Applicant',
        email: 'isolation-test@example.com',
        monthly_income: 4000,
        employment_type: 'employed',
        employer_name: 'Test Corp',
        months_at_current_job: 24,
        rent_months_paid: 12,
        rent_monthly_amount: 1200,
        savings_amount: 5000,
        loan_amount: 10000,
        loan_purpose: 'business',
        loan_term_months: 12,
        consent_data_use: true,
        consent_ai_decision: true,
      }),
    })

    expect([200, 201]).toContain(res.status)
    const body = await res.json()
    expect(body.data).toBeDefined()
    expect(body.data.application_id).toBeDefined()
  })

  it('NEGATIVE: Org B key (no write scope) cannot create applications', async () => {
    await requireServer()

    const res = await fetch(`${BASE_URL}/api/v1/applications`, {
      method: 'POST',
      headers: authHeaders(orgBKey),
      body: JSON.stringify({
        full_name: 'Should Fail',
        email: 'fail@example.com',
        monthly_income: 4000,
        employment_type: 'employed',
        employer_name: 'Test',
        months_at_current_job: 12,
        rent_months_paid: 6,
        rent_monthly_amount: 1000,
        savings_amount: 2000,
        loan_amount: 5000,
        loan_purpose: 'personal',
        loan_term_months: 6,
        consent_data_use: true,
        consent_ai_decision: true,
      }),
    })

    expect(res.status).toBe(403)
  })
})

describe('HTTP endpoint isolation: /api/v1/applications/[id]/predict', () => {
  it('POSITIVE: Org A key can predict on Org A application', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/applications/${ORG_A_APP_IDS[0]}/predict`,
      { headers: authHeaders(orgAKey) }
    )

    expect([200, 404]).toContain(res.status)
  })

  it('NEGATIVE: Org A key cannot predict on Org B application', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/applications/${ORG_B_APP_ID}/predict`,
      { headers: authHeaders(orgAKey) }
    )

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('Dave Beta')
  })
})

describe('HTTP endpoint isolation: /api/v1/applications/[id]/audit', () => {
  it('POSITIVE: Org A key can access Org A application audit trail', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/applications/${ORG_A_APP_IDS[0]}/audit`,
      { headers: authHeaders(orgAKey) }
    )

    expect([200, 404]).toContain(res.status)
    if (res.status === 200) {
      const body = await res.json()
      expect(JSON.stringify(body)).not.toContain(ORG_B_ID)
    }
  })

  it('NEGATIVE: Org A key cannot access Org B application audit trail', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/applications/${ORG_B_APP_ID}/audit`,
      { headers: authHeaders(orgAKey) }
    )

    expect(res.status).toBe(404)
  })

  it('NEGATIVE: Org B key (no audit_events:read scope) is denied', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/applications/${ORG_B_APP_ID}/audit`,
      { headers: authHeaders(orgBKey) }
    )

    expect(res.status).toBe(403)
  })
})

describe('HTTP endpoint isolation: /api/v1/cases/[id]/comments', () => {
  it('NEGATIVE: Org A key cannot comment on Org B case', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/cases/${ORG_B_CASE_ID}/comments`,
      {
        method: 'POST',
        headers: authHeaders(orgAKey),
        body: JSON.stringify({ body: 'Cross-org test comment' }),
      }
    )

    // addComment verifies org ownership — should fail
    expect(res.status).not.toBe(201)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('Beta Entity')
  })

  it('NEGATIVE: Org B key (no cases:write scope) cannot comment', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/cases/${ORG_B_CASE_ID}/comments`,
      {
        method: 'POST',
        headers: authHeaders(orgBKey),
        body: JSON.stringify({ body: 'Should be denied' }),
      }
    )

    expect(res.status).toBe(403)
  })
})

describe('HTTP endpoint isolation: /api/v1/cases/[id]/timeline', () => {
  it('POSITIVE: Org A key can access Org A case timeline', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/cases/${ORG_A_CASE_ID}/timeline`,
      { headers: authHeaders(orgAKey) }
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain(ORG_B_ID)
    expect(JSON.stringify(body)).not.toContain('Beta Entity')
  })

  it('NEGATIVE: Org A key gets 404 for Org B case timeline', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/cases/${ORG_B_CASE_ID}/timeline`,
      { headers: authHeaders(orgAKey) }
    )

    expect(res.status).toBe(404)
  })
})

describe('HTTP endpoint isolation: /api/v1/events', () => {
  it('POSITIVE: Org A key sees only Org A events', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/events`,
      { headers: authHeaders(orgAKey) }
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    const bodyStr = JSON.stringify(body)
    expect(bodyStr).not.toContain(ORG_B_ID)
  })

  it('NEGATIVE: Org B key sees only Org B events, no Org A data', async () => {
    await requireServer()

    const res = await fetch(
      `${BASE_URL}/api/v1/events`,
      { headers: authHeaders(orgBKey) }
    )

    // Org B key has no audit_events:read scope — should be 403
    expect(res.status).toBe(403)
  })

  it('NEGATIVE: no API key returns 401', async () => {
    await requireServer()

    const res = await fetch(`${BASE_URL}/api/v1/events`)
    expect(res.status).toBe(401)
  })
})
