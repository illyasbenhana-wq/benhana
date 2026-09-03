import { describe, it, expect, beforeAll } from 'vitest'
import { getTestSupabase, createFixtureOrg } from './test-helpers'

// Self-contained fixture rewrite (integration fixture remediation pass) —
// see the header comment in multi-tenancy.test.ts for the full root-cause
// explanation. This file previously asserted "every Org A score has
// score_version = 'v2'" against the permanent ORG_A_ID fixture, which
// other (now-fixed) test files had inserted v1-scored rows into over many
// runs, permanently invalidating that exact assertion without deleting
// data. This file now creates its own two fresh organizations with
// exactly the score/application rows each assertion needs.
//
// The "etho_score values" describe block below queries the `scores`
// table with no organization filter at all — it was never coupled to
// ORG_A_ID/ORG_B_ID and is left unchanged, per "do not assume every test
// needs rewriting."
const supabase = getTestSupabase()

let fixtureOrgA: string
let fixtureOrgB: string
let appB: string

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

beforeAll(async () => {
  fixtureOrgA = await createFixtureOrg('scoring-pipeline-A')
  fixtureOrgB = await createFixtureOrg('scoring-pipeline-B')

  const appA = [
    await insertApplication(fixtureOrgA, 'Alice Alpha Fixture'),
    await insertApplication(fixtureOrgA, 'Bob Alpha Fixture'),
    await insertApplication(fixtureOrgA, 'Carol Alpha Fixture'),
  ]
  appB = await insertApplication(fixtureOrgB, 'Dave Beta')

  // All three Org A scores: v2, with the full 4-key pillar shape.
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

  // Org B: single v1 score, null pillars.
  await insertScore(fixtureOrgB, appB, { etho_score: 45, risk_band: 'medium', recommendation: 'decline', score_version: 'v1', score_pillars: null })
}, 60000)

describe('Scoring pipeline integration', () => {

  describe('score_version and score_pillars persistence', () => {
    it('Org A scores have score_version = v2', async () => {
      const { data } = await supabase
        .from('scores')
        .select('id, score_version')
        .eq('organization_id', fixtureOrgA)

      expect(data).not.toBeNull()
      for (const s of data!) {
        expect(s.score_version).toBe('v2')
      }
    })

    it('Org A v2 scores have all 4 pillar keys in score_pillars', async () => {
      const { data } = await supabase
        .from('scores')
        .select('score_pillars')
        .eq('organization_id', fixtureOrgA)
        .eq('score_version', 'v2')

      for (const s of data!) {
        const pillars = s.score_pillars as Record<string, any>
        expect(pillars).toHaveProperty('trust')
        expect(pillars).toHaveProperty('track_record')
        expect(pillars).toHaveProperty('financial_health')
        expect(pillars).toHaveProperty('esg')

        expect(pillars.trust).toHaveProperty('score')
        expect(pillars.trust).toHaveProperty('max')
        expect(pillars.trust.max).toBe(300)
        expect(pillars.track_record.max).toBe(300)
        expect(pillars.financial_health.max).toBe(200)
        expect(pillars.esg.max).toBe(200)
      }
    })

    it('Org B v1 score has score_version = v1 and null pillars', async () => {
      const { data } = await supabase
        .from('scores')
        .select('score_version, score_pillars')
        .eq('organization_id', fixtureOrgB)
        .single()

      expect(data!.score_version).toBe('v1')
      expect(data!.score_pillars).toBeNull()
    })
  })

  describe('score-application relationship', () => {
    it('every score has a valid application_id in the same org', async () => {
      const { data: scores } = await supabase
        .from('scores')
        .select('application_id, organization_id')
        .eq('organization_id', fixtureOrgA)

      for (const s of scores!) {
        const { data: app } = await supabase
          .from('applications')
          .select('id, organization_id')
          .eq('id', s.application_id)
          .single()

        expect(app).not.toBeNull()
        expect(app!.organization_id).toBe(fixtureOrgA)
      }
    })

    it('Org B score references Org B application only', async () => {
      const { data: score } = await supabase
        .from('scores')
        .select('application_id')
        .eq('organization_id', fixtureOrgB)
        .single()

      const { data: app } = await supabase
        .from('applications')
        .select('organization_id')
        .eq('id', score!.application_id)
        .single()

      expect(app!.organization_id).toBe(fixtureOrgB)
    })
  })

  describe('etho_score values', () => {
    it('all etho_scores are between 0 and 100', async () => {
      const { data } = await supabase
        .from('scores')
        .select('etho_score')

      for (const s of data!) {
        expect(s.etho_score).toBeGreaterThanOrEqual(0)
        expect(s.etho_score).toBeLessThanOrEqual(100)
      }
    })

    it('risk_band is one of low/medium/high for every score', async () => {
      const { data } = await supabase
        .from('scores')
        .select('etho_score, risk_band')

      for (const s of data!) {
        expect(['low', 'medium', 'high']).toContain(s.risk_band)
      }
    })

    it('risk_band matches AI prompt thresholds (low=70-100, medium=40-69, high=0-39)', async () => {
      const { data } = await supabase
        .from('scores')
        .select('etho_score, risk_band')

      for (const s of data!) {
        if (s.etho_score >= 70) expect(s.risk_band).toBe('low')
        else if (s.etho_score >= 40) expect(s.risk_band).toBe('medium')
        else expect(s.risk_band).toBe('high')
      }
    })
  })
})
