import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  getTestSupabase,
  ORG_A_ID, ORG_B_ID,
  ORG_A_APP_IDS, ORG_B_APP_ID,
  ORG_A_CASE_ID, ORG_B_CASE_ID,
  ORG_A_SCORE_IDS, ORG_B_SCORE_ID,
} from './test-helpers'

const supabase = getTestSupabase()

describe('Multi-tenancy isolation (service key, query-level)', () => {

  describe('applications table', () => {
    it('Org A query returns only Org A applications', async () => {
      const { data } = await supabase
        .from('applications')
        .select('id, full_name, organization_id')
        .eq('organization_id', ORG_A_ID)

      expect(data).not.toBeNull()
      expect(data!.length).toBe(3)
      expect(data!.every(a => a.organization_id === ORG_A_ID)).toBe(true)
      expect(data!.some(a => a.full_name === 'Dave Beta')).toBe(false)
    })

    it('Org B query returns only Org B applications', async () => {
      const { data } = await supabase
        .from('applications')
        .select('id, full_name, organization_id')
        .eq('organization_id', ORG_B_ID)

      expect(data).not.toBeNull()
      expect(data!.length).toBe(1)
      expect(data![0].full_name).toBe('Dave Beta')
      expect(data![0].organization_id).toBe(ORG_B_ID)
    })

    it('Org A cannot read Org B application by direct ID', async () => {
      const { data } = await supabase
        .from('applications')
        .select('id, full_name')
        .eq('id', ORG_B_APP_ID)
        .eq('organization_id', ORG_A_ID)
        .maybeSingle()

      expect(data).toBeNull()
    })

    it('Org B cannot read Org A application by direct ID', async () => {
      const { data } = await supabase
        .from('applications')
        .select('id, full_name')
        .eq('id', ORG_A_APP_IDS[0])
        .eq('organization_id', ORG_B_ID)
        .maybeSingle()

      expect(data).toBeNull()
    })
  })

  describe('scores table', () => {
    it('Org A scores query returns only Org A scores', async () => {
      const { data } = await supabase
        .from('scores')
        .select('id, etho_score, organization_id')
        .eq('organization_id', ORG_A_ID)

      expect(data).not.toBeNull()
      expect(data!.length).toBe(3)
      expect(data!.every(s => s.organization_id === ORG_A_ID)).toBe(true)
    })

    it('Org A cannot read Org B score by direct ID', async () => {
      const { data } = await supabase
        .from('scores')
        .select('id, etho_score')
        .eq('id', ORG_B_SCORE_ID)
        .eq('organization_id', ORG_A_ID)
        .maybeSingle()

      expect(data).toBeNull()
    })

    it('Org A v2 scores have score_pillars populated', async () => {
      const { data } = await supabase
        .from('scores')
        .select('score_version, score_pillars')
        .eq('organization_id', ORG_A_ID)
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
        .eq('organization_id', ORG_B_ID)

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
        .eq('organization_id', ORG_A_ID)

      expect(data).not.toBeNull()
      expect(data!.length).toBe(1)
      expect(data![0].entity_name).toBe('Alpha Entity')
      expect(data![0].organization_id).toBe(ORG_A_ID)
    })

    it('Org A cannot read Org B case', async () => {
      const { data } = await supabase
        .from('cases')
        .select('id, entity_name')
        .eq('id', ORG_B_CASE_ID)
        .eq('organization_id', ORG_A_ID)
        .maybeSingle()

      expect(data).toBeNull()
    })

    it('Org B case data does not appear in Org A case query', async () => {
      const { data } = await supabase
        .from('cases')
        .select('entity_name')
        .eq('organization_id', ORG_A_ID)

      const names = data!.map(c => c.entity_name)
      expect(names).not.toContain('Beta Entity')
    })
  })

  describe('signals table', () => {
    it('Org A signals are scoped to Org A', async () => {
      const { data } = await supabase
        .from('signals')
        .select('name, organization_id')
        .eq('organization_id', ORG_A_ID)

      expect(data).not.toBeNull()
      expect(data!.length).toBe(2)
      expect(data!.every(s => s.organization_id === ORG_A_ID)).toBe(true)
    })
  })

  describe('risk snapshot aggregation isolation', () => {
    it('Org A risk snapshot only includes Org A case exposure', async () => {
      const { data: cases } = await supabase
        .from('cases')
        .select('exposure_amount')
        .eq('organization_id', ORG_A_ID)
        .is('deleted_at', null)
        .neq('status', 'cleared')

      const totalExposure = (cases ?? []).reduce((s, c) => s + (c.exposure_amount ?? 0), 0)
      expect(totalExposure).toBe(500000)

      const { data: orgBCases } = await supabase
        .from('cases')
        .select('exposure_amount')
        .eq('organization_id', ORG_B_ID)

      const orgBExposure = (orgBCases ?? []).reduce((s, c) => s + (c.exposure_amount ?? 0), 0)
      expect(orgBExposure).toBe(200000)

      expect(totalExposure).not.toBe(totalExposure + orgBExposure)
    })

    it('Org A score aggregation excludes Org B scores', async () => {
      const { data: orgAScores } = await supabase
        .from('scores')
        .select('etho_score')
        .eq('organization_id', ORG_A_ID)

      const { data: orgBScores } = await supabase
        .from('scores')
        .select('etho_score')
        .eq('organization_id', ORG_B_ID)

      const avgA = orgAScores!.reduce((s, r) => s + r.etho_score, 0) / orgAScores!.length
      const avgB = orgBScores!.reduce((s, r) => s + r.etho_score, 0) / orgBScores!.length

      expect(avgA).toBeGreaterThan(60)
      expect(avgB).toBe(45)
      expect(avgA).not.toBe(avgB)
    })
  })

  describe('cross-org write prevention', () => {
    it('cannot update Org B case with Org A scope', async () => {
      const { data, count } = await supabase
        .from('cases')
        .update({ status: 'escalated' })
        .eq('id', ORG_B_CASE_ID)
        .eq('organization_id', ORG_A_ID)
        .select()

      expect(data).toEqual([])
    })

    it('Org B case status remains unchanged after cross-org update attempt', async () => {
      const { data } = await supabase
        .from('cases')
        .select('status')
        .eq('id', ORG_B_CASE_ID)
        .single()

      expect(data!.status).toBe('open')
    })
  })
})
