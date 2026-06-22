import { describe, it, expect } from 'vitest'
import { computeEthoScoreV2 } from '../lib/ethoscore-v2'
import { ApplicationForm } from '../types'

const BASE_FORM: ApplicationForm = {
  full_name: 'Test User',
  email: 'test@example.com',
  monthly_income: 3000,
  employment_type: 'employed',
  employer_name: 'Acme Corp',
  months_at_current_job: 24,
  rent_months_paid: 18,
  rent_monthly_amount: 900,
  gig_platforms: [],
  gig_monthly_avg: 0,
  savings_amount: 3000,
  loan_amount: 5000,
  loan_purpose: 'Home improvement',
  loan_term_months: 12,
  consent_data_use: true,
  consent_ai_decision: true,
}

describe('computeEthoScoreV2', () => {
  it('returns a total between 0 and 1000', () => {
    const result = computeEthoScoreV2(BASE_FORM)
    expect(result.total).toBeGreaterThanOrEqual(0)
    expect(result.total).toBeLessThanOrEqual(1000)
  })

  it('normalized equals Math.round(total / 10) clamped to 0-100', () => {
    const result = computeEthoScoreV2(BASE_FORM)
    expect(result.normalized).toBe(Math.min(100, Math.max(0, Math.round(result.total / 10))))
  })

  it('total equals sum of 4 pillar scores', () => {
    const result = computeEthoScoreV2(BASE_FORM)
    const sum = result.pillars.trust.score + result.pillars.track_record.score +
      result.pillars.financial_health.score + result.pillars.esg.score
    expect(result.total).toBe(sum)
  })

  it('each pillar score does not exceed its max', () => {
    const result = computeEthoScoreV2(BASE_FORM)
    expect(result.pillars.trust.score).toBeLessThanOrEqual(result.pillars.trust.max)
    expect(result.pillars.track_record.score).toBeLessThanOrEqual(result.pillars.track_record.max)
    expect(result.pillars.financial_health.score).toBeLessThanOrEqual(result.pillars.financial_health.max)
    expect(result.pillars.esg.score).toBeLessThanOrEqual(result.pillars.esg.max)
  })

  it('pillar maxes are Trust=300, TrackRecord=300, FinancialHealth=200, ESG=200', () => {
    const result = computeEthoScoreV2(BASE_FORM)
    expect(result.pillars.trust.max).toBe(300)
    expect(result.pillars.track_record.max).toBe(300)
    expect(result.pillars.financial_health.max).toBe(200)
    expect(result.pillars.esg.max).toBe(200)
  })
})

describe('Trust pillar', () => {
  it('scores higher with full identity + consents', () => {
    const full = computeEthoScoreV2(BASE_FORM).pillars.trust.score
    const noConsent = computeEthoScoreV2({ ...BASE_FORM, consent_data_use: false, consent_ai_decision: false }).pillars.trust.score
    expect(full).toBeGreaterThan(noConsent)
  })

  it('scores higher with longer tenure', () => {
    const long = computeEthoScoreV2({ ...BASE_FORM, months_at_current_job: 48 }).pillars.trust.score
    const short = computeEthoScoreV2({ ...BASE_FORM, months_at_current_job: 3 }).pillars.trust.score
    expect(long).toBeGreaterThan(short)
  })

  it('scores higher with more rent history (address stability)', () => {
    const many = computeEthoScoreV2({ ...BASE_FORM, rent_months_paid: 36 }).pillars.trust.score
    const few = computeEthoScoreV2({ ...BASE_FORM, rent_months_paid: 2 }).pillars.trust.score
    expect(many).toBeGreaterThan(few)
  })

  it('has 3 factors', () => {
    const result = computeEthoScoreV2(BASE_FORM)
    expect(result.pillars.trust.factors).toHaveLength(3)
  })
})

describe('Track Record pillar', () => {
  it('scores higher with more rent months', () => {
    const high = computeEthoScoreV2({ ...BASE_FORM, rent_months_paid: 24 }).pillars.track_record.score
    const low = computeEthoScoreV2({ ...BASE_FORM, rent_months_paid: 0 }).pillars.track_record.score
    expect(high).toBeGreaterThan(low)
  })

  it('scores higher with gig platforms + income', () => {
    const gig = computeEthoScoreV2({ ...BASE_FORM, gig_platforms: ['Uber', 'Fiverr', 'Upwork'], gig_monthly_avg: 800 }).pillars.track_record.score
    const noGig = computeEthoScoreV2({ ...BASE_FORM, gig_platforms: [], gig_monthly_avg: 0 }).pillars.track_record.score
    expect(gig).toBeGreaterThan(noGig)
  })

  it('has 3 factors', () => {
    expect(computeEthoScoreV2(BASE_FORM).pillars.track_record.factors).toHaveLength(3)
  })
})

describe('Financial Health pillar', () => {
  it('scores higher with low loan-to-income ratio', () => {
    const low = computeEthoScoreV2({ ...BASE_FORM, loan_amount: 1000, monthly_income: 5000 }).pillars.financial_health.score
    const high = computeEthoScoreV2({ ...BASE_FORM, loan_amount: 50000, monthly_income: 2000 }).pillars.financial_health.score
    expect(low).toBeGreaterThan(high)
  })

  it('scores higher with more savings', () => {
    const rich = computeEthoScoreV2({ ...BASE_FORM, savings_amount: 20000 }).pillars.financial_health.score
    const poor = computeEthoScoreV2({ ...BASE_FORM, savings_amount: 0 }).pillars.financial_health.score
    expect(rich).toBeGreaterThan(poor)
  })

  it('handles zero income without crashing', () => {
    const result = computeEthoScoreV2({ ...BASE_FORM, monthly_income: 0 })
    expect(result.pillars.financial_health.score).toBeGreaterThanOrEqual(0)
  })

  it('handles zero loan_term_months without crashing', () => {
    const result = computeEthoScoreV2({ ...BASE_FORM, loan_term_months: 0 })
    expect(result.pillars.financial_health.score).toBeGreaterThanOrEqual(0)
  })

  it('has 2 factors', () => {
    expect(computeEthoScoreV2(BASE_FORM).pillars.financial_health.factors).toHaveLength(2)
  })
})

describe('ESG pillar', () => {
  it('defaults to neutral baseline (50) without merchant profile', () => {
    const result = computeEthoScoreV2(BASE_FORM)
    const esgFactor = result.pillars.esg.factors.find(f => f.name === 'ESG Rating')
    expect(esgFactor?.score).toBe(50)
  })

  it('defaults to neutral baseline for geographic diversity without merchant profile', () => {
    const result = computeEthoScoreV2(BASE_FORM)
    const geoFactor = result.pillars.esg.factors.find(f => f.name === 'Geographic Corridor Diversity')
    expect(geoFactor?.score).toBe(50)
  })

  it('uses merchant ESG score when provided', () => {
    const merchant = {
      name: 'Test', country: 'UK',
      tradeCorridors: [{ region: 'UK', volume: 100000 }],
      paymentHistory: { onTimeRate: 0.9, avgDelayDays: 3 },
      esgScore: 85,
    }
    const result = computeEthoScoreV2(BASE_FORM, merchant)
    const esgFactor = result.pillars.esg.factors.find(f => f.name === 'ESG Rating')
    expect(esgFactor?.score).toBe(85)
  })

  it('scores higher geographic diversity with more corridors', () => {
    const diverse = {
      name: 'Test', country: 'UK',
      tradeCorridors: [{ region: 'UK', volume: 100000 }, { region: 'US', volume: 80000 }, { region: 'UAE', volume: 60000 }, { region: 'Ghana', volume: 40000 }],
      paymentHistory: { onTimeRate: 0.9, avgDelayDays: 3 },
    }
    const single = {
      name: 'Test', country: 'UK',
      tradeCorridors: [{ region: 'UK', volume: 100000 }],
      paymentHistory: { onTimeRate: 0.9, avgDelayDays: 3 },
    }
    const diverseScore = computeEthoScoreV2(BASE_FORM, diverse).pillars.esg.score
    const singleScore = computeEthoScoreV2(BASE_FORM, single).pillars.esg.score
    expect(diverseScore).toBeGreaterThan(singleScore)
  })

  it('has 2 factors', () => {
    expect(computeEthoScoreV2(BASE_FORM).pillars.esg.factors).toHaveLength(2)
  })
})

describe('Edge cases', () => {
  it('minimum possible score (all zeros/empty)', () => {
    const minimal: ApplicationForm = {
      full_name: '', email: '', monthly_income: 0, employment_type: 'unemployed',
      rent_months_paid: 0, rent_monthly_amount: 0, gig_platforms: [], gig_monthly_avg: 0,
      savings_amount: 0, loan_amount: 100000, loan_purpose: '', loan_term_months: 1,
      consent_data_use: false, consent_ai_decision: false,
    }
    const result = computeEthoScoreV2(minimal)
    expect(result.total).toBeGreaterThanOrEqual(0)
    expect(result.total).toBeLessThan(400)
    expect(result.normalized).toBeGreaterThanOrEqual(0)
  })

  it('maximum possible score (ideal applicant)', () => {
    const ideal: ApplicationForm = {
      full_name: 'Perfect Applicant', email: 'perfect@test.com',
      monthly_income: 10000, employment_type: 'employed', employer_name: 'Google',
      months_at_current_job: 120, rent_months_paid: 36, rent_monthly_amount: 1500,
      gig_platforms: ['A', 'B', 'C', 'D'], gig_monthly_avg: 2000,
      savings_amount: 50000, loan_amount: 5000, loan_purpose: 'Education',
      loan_term_months: 12, consent_data_use: true, consent_ai_decision: true,
    }
    const result = computeEthoScoreV2(ideal)
    expect(result.total).toBeGreaterThan(600)
    expect(result.normalized).toBeGreaterThan(60)
  })

  it('every factor has name, score, max, rationale', () => {
    const result = computeEthoScoreV2(BASE_FORM)
    for (const [, pillar] of Object.entries(result.pillars)) {
      for (const factor of pillar.factors) {
        expect(factor.name).toBeTruthy()
        expect(typeof factor.score).toBe('number')
        expect(typeof factor.max).toBe('number')
        expect(factor.rationale).toBeTruthy()
      }
    }
  })
})
