import { describe, it, expect, beforeAll } from 'vitest'
import { getTestSupabase, createFixtureOrg } from './test-helpers'

// Self-contained fixture rewrite (integration fixture remediation pass).
// This file previously depended on the permanent, hand-seeded ORG_A_ID/
// ORG_B_ID fixture (exactly 3 Org A applications, 1 Org B application,
// etc.) and asserted exact counts/values against it. Other integration
// test files (now fixed separately) inserted additional applications/
// scores under that same shared organization_id over many runs across
// this project's history, permanently inflating those counts — and since
// this suite is never allowed to delete existing ethosfi-test data, the
// old exact-count assertions can never pass again by fixing the *sources*
// of contamination alone.
//
// The fix here is the one the remediation asked for: this file creates
// its own two fresh, uniquely-named organizations via createFixtureOrg()
// in beforeAll, inserts exactly the rows each assertion below needs, and
// verifies against fixture IDs it created itself — never against
// ORG_A_ID/ORG_B_ID. This makes every assertion in this file permanently
// correct regardless of any other test file's past or future behavior,
// without deleting or depending on the historical contamination, and
// without weakening any exact-count or exact-value assertion.
const supabase = getTestSupabase()

let fixtureOrgA: string
let fixtureOrgB: string
let appA: string[]
let appB: string
let scoreB: string
let caseA: string
let caseB: string

async function insertApplication(orgId: string, fullName: string) {
  const { data, error } = await supabase
    .from('applications')
    .insert({
      organization_id: orgId, status: 'scored', full_name: fullName,
      email: `${fullName.toLowerCase().replace(/\s+/g, '.')}@fixture.example.com`,
      monthly_income: 3000, employment_type: 'employed', employer_name: 'Fixture Corp', months_at_current_job: 24,
      rent_months_paid: 12, rent_monthly_amount: 800, gig_platforms: [], gig_monthly_avg: 0, savings_amount: 2000,
      loan_amount: 5000, loan_purpose: 'test', loan_term_months: 12, consent_data_use: true, consent_ai_decision: true,
    })
    .select('id')
    .single()
  if (error) throw error
  return data!.id as string
}

async function insertScore(orgId: string, applicationId: string, overrides: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('scores')
    .insert({
      organization_id: orgId, application_id: applicationId, etho_score: 70, risk_band: 'low',
      ai_summary: 'Fixture score.', factors: [{ name: 'Income', score: 70, weight: 30, rationale: 'fixture' }],
      recommendation: 'approve', model_version: 'fixture-v1', score_version: 'v1', score_pillars: null,
      ...overrides,
    })
    .select('id')
    .single()
  if (error) throw error
  return data!.id as string
}

async function insertCase(orgId: string, entityName: string, exposureAmount: number) {
  const { data, error } = await supabase
    .from('cases')
    .insert({
      organization_id: orgId, case_ref: `FIXTURE-${orgId.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      entity_name: entityName, case_type: 'Fixture Case', jurisdiction: 'UK', exposure_amount: exposureAmount,
      severity: 'medium', sla_hours: 24, sla_remaining_hours: 24, status: 'open', assigned_to: 'Fixture Analyst',
      opened_at: new Date().toISOString(), risk_score: 50, ai_summary: 'Fixture case.',
    })
    .select('id')
    .single()
  if (error) throw error
  return data!.id as string
}

async function insertSignal(orgId: string, caseId: string, name: string, score: number, rationale: string) {
  const { error } = await supabase.from('signals').insert({ organization_id: orgId, case_id: caseId, name, score, rationale })
  if (error) throw error
}

beforeAll(async () => {
  fixtureOrgA = await createFixtureOrg('multi-tenancy-A')
  fixtureOrgB = await createFixtureOrg('multi-tenancy-B')

  appA = [
    await insertApplication(fixtureOrgA, 'Alice Alpha Fixture'),
    await insertApplication(fixtureOrgA, 'Bob Alpha Fixture'),
    await insertApplication(fixtureOrgA, 'Carol Alpha Fixture'),
  ]
  appB = await insertApplication(fixtureOrgB, 'Dave Beta')

  // Org A: 3 v2 scores, average > 60 (mirrors the original fixture's
  // 72/58/81 shape and average).
  await insertScore(fixtureOrgA, appA[0], {
    etho_score: 72, score_version: 'v2', recommendation: 'approve',
    score_pillars: { trust: { score: 220, max: 300 }, track_record: { score: 195, max: 300 }, financial_health: { score: 140, max: 200 }, esg: { score: 100, max: 200 } },
  })
  await insertScore(fixtureOrgA, appA[1], {
    etho_score: 58, score_version: 'v2', risk_band: 'medium', recommendation: 'review',
    score_pillars: { trust: { score: 150, max: 300 }, track_record: { score: 160, max: 300 }, financial_health: { score: 100, max: 200 }, esg: { score: 80, max: 200 } },
  })
  await insertScore(fixtureOrgA, appA[2], {
    etho_score: 81, score_version: 'v2', recommendation: 'approve',
    score_pillars: { trust: { score: 250, max: 300 }, track_record: { score: 220, max: 300 }, financial_health: { score: 160, max: 200 }, esg: { score: 120, max: 200 } },
  })

  // Org B: 1 v1 score, etho_score exactly 45 (so avgB === 45 exactly, the
  // original assertion's exact value).
  scoreB = await insertScore(fixtureOrgB, appB, { etho_score: 45, risk_band: 'medium', recommendation: 'decline', score_version: 'v1', score_pillars: null })

  caseA = await insertCase(fixtureOrgA, 'Alpha Entity', 500000)
  caseB = await insertCase(fixtureOrgB, 'Beta Entity', 200000)

  await insertSignal(fixtureOrgA, caseA, 'Velocity Anomaly', 78, 'Volume spike detected.')
  await insertSignal(fixtureOrgA, caseA, 'Geographic Risk', 45, 'Within normal profile.')
}, 60000)

describe('Multi-tenancy isolation (service key, query-level)', () => {

  describe('applications table', () => {
    it('Org A query returns only Org A applications', async () => {
      const { data } = await supabase
        .from('applications')
        .select('id, full_name, organization_id')
        .eq('organization_id', fixtureOrgA)

      expect(data).not.toBeNull()
      expect(data!.length).toBe(3)
      expect(data!.every(a => a.organization_id === fixtureOrgA)).toBe(true)
      expect(data!.some(a => a.full_name === 'Dave Beta')).toBe(false)
    })

    it('Org B query returns only Org B applications', async () => {
      const { data } = await supabase
        .from('applications')
        .select('id, full_name, organization_id')
        .eq('organization_id', fixtureOrgB)

      expect(data).not.toBeNull()
      expect(data!.length).toBe(1)
      expect(data![0].full_name).toBe('Dave Beta')
      expect(data![0].organization_id).toBe(fixtureOrgB)
    })

    it('Org A cannot read Org B application by direct ID', async () => {
      const { data } = await supabase
        .from('applications')
        .select('id, full_name')
        .eq('id', appB)
        .eq('organization_id', fixtureOrgA)
        .maybeSingle()

      expect(data).toBeNull()
    })

    it('Org B cannot read Org A application by direct ID', async () => {
      const { data } = await supabase
        .from('applications')
        .select('id, full_name')
        .eq('id', appA[0])
        .eq('organization_id', fixtureOrgB)
        .maybeSingle()

      expect(data).toBeNull()
    })
  })

  describe('scores table', () => {
    it('Org A scores query returns only Org A scores', async () => {
      const { data } = await supabase
        .from('scores')
        .select('id, etho_score, organization_id')
        .eq('organization_id', fixtureOrgA)

      expect(data).not.toBeNull()
      expect(data!.length).toBe(3)
      expect(data!.every(s => s.organization_id === fixtureOrgA)).toBe(true)
    })

    it('Org A cannot read Org B score by direct ID', async () => {
      const { data } = await supabase
        .from('scores')
        .select('id, etho_score')
        .eq('id', scoreB)
        .eq('organization_id', fixtureOrgA)
        .maybeSingle()

      expect(data).toBeNull()
    })

    it('Org A v2 scores have score_pillars populated', async () => {
      const { data } = await supabase
        .from('scores')
        .select('score_version, score_pillars')
        .eq('organization_id', fixtureOrgA)
        .eq('score_version', 'v2')

      expect(data).not.toBeNull()
      expect(data!.length).toBe(3)
      for (const s of data!) {
        expect(s.score_pillars).not.toBeNull()
        expect(s.score_pillars).toHaveProperty('trust')
        expect(s.score_pillars).toHaveProperty('track_record')
        expect(s.score_pillars).toHaveProperty('financial_health')
        expect(s.score_pillars).toHaveProperty('esg')
      }
    })

    it('Org B v1 score has null score_pillars', async () => {
      const { data } = await supabase
        .from('scores')
        .select('score_version, score_pillars')
        .eq('organization_id', fixtureOrgB)

      expect(data).not.toBeNull()
      expect(data![0].score_version).toBe('v1')
      expect(data![0].score_pillars).toBeNull()
    })
  })

  describe('cases table', () => {
    it('Org A case query returns only Org A cases', async () => {
      const { data } = await supabase
        .from('cases')
        .select('id, case_ref, entity_name, organization_id')
        .eq('organization_id', fixtureOrgA)

      expect(data).not.toBeNull()
      expect(data!.length).toBe(1)
      expect(data![0].entity_name).toBe('Alpha Entity')
      expect(data![0].organization_id).toBe(fixtureOrgA)
    })

    it('Org A cannot read Org B case', async () => {
      const { data } = await supabase
        .from('cases')
        .select('id, entity_name')
        .eq('id', caseB)
        .eq('organization_id', fixtureOrgA)
        .maybeSingle()

      expect(data).toBeNull()
    })

    it('Org B case data does not appear in Org A case query', async () => {
      const { data } = await supabase
        .from('cases')
        .select('entity_name')
        .eq('organization_id', fixtureOrgA)

      const names = data!.map(c => c.entity_name)
      expect(names).not.toContain('Beta Entity')
    })
  })

  describe('signals table', () => {
    it('Org A signals are scoped to Org A', async () => {
      const { data } = await supabase
        .from('signals')
        .select('name, organization_id')
        .eq('organization_id', fixtureOrgA)

      expect(data).not.toBeNull()
      expect(data!.length).toBe(2)
      expect(data!.every(s => s.organization_id === fixtureOrgA)).toBe(true)
    })
  })

  describe('risk snapshot aggregation isolation', () => {
    it('Org A risk snapshot only includes Org A case exposure', async () => {
      const { data: cases } = await supabase
        .from('cases')
        .select('exposure_amount')
        .eq('organization_id', fixtureOrgA)
        .is('deleted_at', null)
        .neq('status', 'cleared')

      const totalExposure = (cases ?? []).reduce((s, c) => s + (c.exposure_amount ?? 0), 0)
      expect(totalExposure).toBe(500000)

      const { data: orgBCases } = await supabase
        .from('cases')
        .select('exposure_amount')
        .eq('organization_id', fixtureOrgB)

      const orgBExposure = (orgBCases ?? []).reduce((s, c) => s + (c.exposure_amount ?? 0), 0)
      expect(orgBExposure).toBe(200000)

      expect(totalExposure).not.toBe(totalExposure + orgBExposure)
    })

    it('Org A score aggregation excludes Org B scores', async () => {
      const { data: orgAScores } = await supabase
        .from('scores')
        .select('etho_score')
        .eq('organization_id', fixtureOrgA)

      const { data: orgBScores } = await supabase
        .from('scores')
        .select('etho_score')
        .eq('organization_id', fixtureOrgB)

      const avgA = orgAScores!.reduce((s, r) => s + r.etho_score, 0) / orgAScores!.length
      const avgB = orgBScores!.reduce((s, r) => s + r.etho_score, 0) / orgBScores!.length

      expect(avgA).toBeGreaterThan(60)
      expect(avgB).toBe(45)
      expect(avgA).not.toBe(avgB)
    })
  })

  describe('cross-org write prevention', () => {
    it('cannot update Org B case with Org A scope', async () => {
      const { data } = await supabase
        .from('cases')
        .update({ status: 'escalated' })
        .eq('id', caseB)
        .eq('organization_id', fixtureOrgA)
        .select()

      expect(data).toEqual([])
    })

    it('Org B case status remains unchanged after cross-org update attempt', async () => {
      const { data } = await supabase
        .from('cases')
        .select('status')
        .eq('id', caseB)
        .single()

      expect(data!.status).toBe('open')
    })
  })
})
