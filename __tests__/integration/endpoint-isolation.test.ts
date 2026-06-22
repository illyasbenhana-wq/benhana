import { describe, it, expect } from 'vitest'
import {
  getTestSupabase,
  ORG_A_ID, ORG_B_ID,
  ORG_A_APP_IDS, ORG_B_APP_ID,
  ORG_A_CASE_ID, ORG_B_CASE_ID,
} from './test-helpers'

const supabase = getTestSupabase()

/**
 * These tests simulate the exact query patterns used by the 3 endpoints
 * flagged in the integration test plan:
 * - /api/v1/applications/[id]/benchmark
 * - /api/v1/risk/snapshot
 * - /api/v1/cases/[id]/ai-review
 *
 * Each endpoint resolves orgId from the API key, then scopes every query
 * by .eq('organization_id', orgId). These tests prove the data layer
 * isolation holds for each endpoint's exact query pattern.
 */

describe('Endpoint isolation: /api/v1/applications/[id]/benchmark', () => {
  // Simulates benchmarking.ts query pattern: fetch app, fetch peers, fetch peer scores

  it('POSITIVE: Org A can benchmark its own application', async () => {
    const orgId = ORG_A_ID
    const appId = ORG_A_APP_IDS[0]

    // Step 1: fetch target app (same as benchmarking.ts line 59-66)
    const { data: app } = await supabase
      .from('applications')
      .select('id, employment_type, loan_amount')
      .eq('id', appId)
      .eq('organization_id', orgId)
      .single()

    expect(app).not.toBeNull()
    expect(app!.id).toBe(appId)

    // Step 2: fetch peer cohort (same as benchmarking.ts line 83-91)
    const loanMin = app!.loan_amount * 0.7
    const loanMax = app!.loan_amount * 1.3
    const { data: peers } = await supabase
      .from('applications')
      .select('id')
      .eq('organization_id', orgId)
      .eq('employment_type', app!.employment_type)
      .gte('loan_amount', loanMin)
      .lte('loan_amount', loanMax)
      .neq('id', appId)

    expect(peers).not.toBeNull()
    // All peers belong to Org A
    for (const p of peers!) {
      const { data: check } = await supabase
        .from('applications')
        .select('organization_id')
        .eq('id', p.id)
        .single()
      expect(check!.organization_id).toBe(ORG_A_ID)
    }
  })

  it('NEGATIVE: Org A cannot benchmark Org B application', async () => {
    const orgId = ORG_A_ID
    const appId = ORG_B_APP_ID

    const { data: app } = await supabase
      .from('applications')
      .select('id, employment_type, loan_amount')
      .eq('id', appId)
      .eq('organization_id', orgId)
      .maybeSingle()

    // App not found — benchmark would return 404
    expect(app).toBeNull()
  })
})

describe('Endpoint isolation: /api/v1/risk/snapshot', () => {
  // Simulates risk-dashboard.ts generateRiskSnapshot query pattern

  it('POSITIVE: Org A snapshot only contains Org A data', async () => {
    const orgId = ORG_A_ID

    // Cases query (same as risk-dashboard.ts line 33-38)
    const { data: cases } = await supabase
      .from('cases')
      .select('entity_name, risk_score, case_ref, exposure_amount')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .neq('status', 'cleared')

    expect(cases).not.toBeNull()
    expect(cases!.length).toBeGreaterThan(0)

    // No Org B entity names leak into the response
    const entityNames = cases!.map(c => c.entity_name)
    expect(entityNames).not.toContain('Beta Entity')
    expect(entityNames).toContain('Alpha Entity')

    // Scores query (same as risk-dashboard.ts line 54-57)
    const { data: scores } = await supabase
      .from('scores')
      .select('etho_score, risk_band')
      .eq('organization_id', orgId)

    expect(scores).not.toBeNull()
    // All scores should be Org A's (72, 58, 81) — not 45 (Org B)
    const scoreValues = scores!.map(s => s.etho_score)
    expect(scoreValues).not.toContain(45)
  })

  it('NEGATIVE: Org B snapshot does not contain Org A data', async () => {
    const orgId = ORG_B_ID

    const { data: cases } = await supabase
      .from('cases')
      .select('entity_name, exposure_amount')
      .eq('organization_id', orgId)
      .is('deleted_at', null)

    const entityNames = (cases ?? []).map(c => c.entity_name)
    expect(entityNames).not.toContain('Alpha Entity')

    const { data: scores } = await supabase
      .from('scores')
      .select('etho_score')
      .eq('organization_id', orgId)

    const scoreValues = (scores ?? []).map(s => s.etho_score)
    expect(scoreValues).not.toContain(72)
    expect(scoreValues).not.toContain(81)
  })
})

describe('Endpoint isolation: /api/v1/cases/[id]/ai-review', () => {
  // Simulates ai-review.ts → getCaseContext query pattern

  it('POSITIVE: Org A can load its own case context', async () => {
    const orgId = ORG_A_ID
    const caseId = ORG_A_CASE_ID

    // Case query (same as case-manager.ts getCaseContext line ~185)
    const { data: caseRow } = await supabase
      .from('cases')
      .select('*, signals(*)')
      .eq('id', caseId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .single()

    expect(caseRow).not.toBeNull()
    expect(caseRow!.entity_name).toBe('Alpha Entity')
    expect(caseRow!.organization_id).toBe(ORG_A_ID)

    // Signals are loaded via nested select
    const signals = caseRow!.signals as any[]
    expect(signals.length).toBe(2)
  })

  it('NEGATIVE: Org A cannot load Org B case context', async () => {
    const orgId = ORG_A_ID
    const caseId = ORG_B_CASE_ID

    const { data: caseRow } = await supabase
      .from('cases')
      .select('*, signals(*)')
      .eq('id', caseId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle()

    // Case not found — ai-review would return "Case not found"
    expect(caseRow).toBeNull()
  })

  it('NEGATIVE: Org B case context does not contain Org A signals', async () => {
    const orgId = ORG_B_ID
    const caseId = ORG_B_CASE_ID

    const { data: caseRow } = await supabase
      .from('cases')
      .select('*, signals(*)')
      .eq('id', caseId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .single()

    expect(caseRow).not.toBeNull()
    expect(caseRow!.entity_name).toBe('Beta Entity')

    // Org B case has no signals in the seed data
    const signals = caseRow!.signals as any[]
    // Confirm no Org A signal names leak
    const signalNames = signals.map((s: any) => s.name)
    expect(signalNames).not.toContain('Velocity Anomaly')
    expect(signalNames).not.toContain('Geographic Risk')
  })
})
