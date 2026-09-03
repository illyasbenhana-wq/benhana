import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getTestSupabase, createFixtureOrg } from './test-helpers'

// Architectural correction (Issue 2), real-database proof: exercises the
// actual POST /api/score route (not mocked, aside from injecting a
// controlled org context) against ethosfi-test, in this environment's
// real, unmodified condition -- no ANTHROPIC_API_KEY, so the route takes
// its real mock-score/v1-prompt fallback path exactly as it does in
// every other real request this session. Confirms the real, persisted
// scores.score_version is 'v1', not 'v2' -- the exact regression this
// correction fixes, proven against the real database rather than a mock.

const { mockResolveApiContext } = vi.hoisted(() => ({ mockResolveApiContext: vi.fn() }))
vi.mock('../../lib/api-guard', () => ({ resolveApiContext: mockResolveApiContext }))

import { POST } from '../../app/api/score/route'

const supabase = getTestSupabase()

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/score', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_FORM = {
  full_name: 'Pillar Lineage Correction Test', email: 'pillar-lineage-test@example.com', monthly_income: 4200,
  employment_type: 'employed', employer_name: 'Acme', months_at_current_job: 24,
  rent_months_paid: 18, rent_monthly_amount: 1000, gig_platforms: [], gig_monthly_avg: 0,
  savings_amount: 3000, loan_amount: 8000, loan_purpose: 'debt_consolidation', loan_term_months: 24,
  consent_data_use: true, consent_ai_decision: true,
}

describe('score_version pillar-lineage correction — real ethosfi-test', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY

  beforeEach(async () => {
    mockResolveApiContext.mockReset()
    // Dedicated fixture org per test, not ORG_A_ID — this route call
    // really inserts a new applications row + scores row, and ORG_A_ID's
    // application/score counts are asserted exactly elsewhere
    // (multi-tenancy.test.ts, scoring-pipeline.test.ts).
    const fixtureOrgId = await createFixtureOrg('score-route-pillar-lineage')
    mockResolveApiContext.mockResolvedValue({ userId: 'aaaaaaaa-0000-0000-0000-0000000000aa', orgId: fixtureOrgId, role: 'analyst' })
    delete process.env.ANTHROPIC_API_KEY // this environment's real, standing condition
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = originalKey
  })

  it('a real mock-fallback (v1-prompt) scoring request persists score_version = \'v1\', with deterministic score_pillars still present but honestly labeled', async () => {
    const res = await POST(postRequest(VALID_FORM))
    expect(res.status).toBe(200)
    const json = await res.json()

    const { data: score } = await supabase
      .from('scores')
      .select('score_version, score_pillars, prompt_version')
      .eq('id', json.score_id)
      .single()

    expect(score!.score_version).toBe('v1')
    expect(score!.prompt_version).toBe('v1')
    // the deterministic engine's pillars are still stored (unchanged
    // contract) -- they're just no longer mislabeled as 'v2'
    expect(score!.score_pillars).toBeTruthy()

    const { data: modelVersion } = await supabase
      .from('model_versions')
      .select('score_version, prompt_version')
      .eq('score_version', 'v1')
      .eq('prompt_version', 'v1')
      .limit(1)
      .maybeSingle()
    expect(modelVersion).not.toBeNull()
  })
})
