import { describe, it, expect } from 'vitest'
import { getTestSupabase, ORG_A_ID, ORG_A_APP_IDS, ORG_B_ID } from './test-helpers'

const supabase = getTestSupabase()

describe('Scoring pipeline integration', () => {

  describe('score_version and score_pillars persistence', () => {
    it('Org A scores have score_version = v2', async () => {
      const { data } = await supabase
        .from('scores')
        .select('id, score_version')
        .eq('organization_id', ORG_A_ID)

      expect(data).not.toBeNull()
      for (const s of data!) {
        expect(s.score_version).toBe('v2')
      }
    })

    it('Org A v2 scores have all 4 pillar keys in score_pillars', async () => {
      const { data } = await supabase
        .from('scores')
        .select('score_pillars')
        .eq('organization_id', ORG_A_ID)
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
        .eq('organization_id', ORG_B_ID)
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
        .eq('organization_id', ORG_A_ID)

      for (const s of scores!) {
        const { data: app } = await supabase
          .from('applications')
          .select('id, organization_id')
          .eq('id', s.application_id)
          .single()

        expect(app).not.toBeNull()
        expect(app!.organization_id).toBe(ORG_A_ID)
      }
    })

    it('Org B score references Org B application only', async () => {
      const { data: score } = await supabase
        .from('scores')
        .select('application_id')
        .eq('organization_id', ORG_B_ID)
        .single()

      const { data: app } = await supabase
        .from('applications')
        .select('organization_id')
        .eq('id', score!.application_id)
        .single()

      expect(app!.organization_id).toBe(ORG_B_ID)
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
