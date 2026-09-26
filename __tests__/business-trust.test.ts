import { describe, it, expect } from 'vitest'
import { computeBusinessTrustFactor, injectBusinessTrustFactor } from '../lib/business-trust'
import { BusinessProfile, ScoreFactor } from '../types'
import { makeDecision } from '../lib/decision-engine'
import { computeRiskBand } from '../lib/risk-band'

// Mirrors the Fable5-path factor set in lib/scoring-engine.ts (weights
// 30/30/20/20 = 100) — the shape most likely to hit rounding edge cases
// since 100 doesn't divide evenly by 3 once a factor is dropped/rebalanced.
const FOUR_FACTORS: ScoreFactor[] = [
  { name: 'Trust', weight: 30, score: 70, rationale: 'r' },
  { name: 'Track Record', weight: 30, score: 65, rationale: 'r' },
  { name: 'Financial Health', weight: 20, score: 60, rationale: 'r' },
  { name: 'ESG Alignment', weight: 20, score: 55, rationale: 'r' },
]

const THREE_FACTORS: ScoreFactor[] = [
  { name: 'A', weight: 34, score: 50, rationale: 'r' },
  { name: 'B', weight: 33, score: 50, rationale: 'r' },
  { name: 'C', weight: 33, score: 50, rationale: 'r' },
]

const FIVE_FACTORS: ScoreFactor[] = [
  { name: 'Income Stability', weight: 25, score: 65, rationale: 'r' },
  { name: 'Rent Payment History', weight: 30, score: 70, rationale: 'r' },
  { name: 'Loan-to-Income Ratio', weight: 25, score: 60, rationale: 'r' },
  { name: 'Savings Buffer', weight: 15, score: 55, rationale: 'r' },
  { name: 'Gig Income Stability', weight: 5, score: 50, rationale: 'r' },
]

const STRONG_BUSINESS: BusinessProfile = {
  legal_name: 'Osei Catering Ltd',
  registration_number: '09123456',
  jurisdiction: 'England & Wales',
  trading_since_months: 60,
  annual_revenue: 120_000,
  sector: 'Hospitality',
}

const WEAK_BUSINESS: BusinessProfile = {
  legal_name: 'Fresh Start Trading',
}

function sumWeights(factors: ScoreFactor[]): number {
  return factors.reduce((s, f) => s + f.weight, 0)
}

describe('computeBusinessTrustFactor', () => {
  it('scores a fully-documented, long-trading business highly', () => {
    const factor = computeBusinessTrustFactor(STRONG_BUSINESS)
    expect(factor.score).toBeGreaterThan(70)
  })

  it('scores a business with no registration/history/revenue near zero', () => {
    const factor = computeBusinessTrustFactor(WEAK_BUSINESS)
    expect(factor.score).toBeLessThan(20)
  })

  it('score is always within 0-100', () => {
    for (const b of [STRONG_BUSINESS, WEAK_BUSINESS]) {
      const { score } = computeBusinessTrustFactor(b)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })
})

describe('injectBusinessTrustFactor', () => {
  it('is a no-op when business is undefined (backward compatibility)', () => {
    const result = injectBusinessTrustFactor(FOUR_FACTORS, undefined)
    expect(result).toBe(FOUR_FACTORS) // same reference, not just equal
  })

  it.each([
    ['4 factors (30/30/20/20)', FOUR_FACTORS],
    ['3 factors (34/33/33)', THREE_FACTORS],
    ['5 factors (25/30/25/15/5)', FIVE_FACTORS],
  ])('weights sum to exactly 100 after injection — %s', (_label, factors) => {
    const result = injectBusinessTrustFactor(factors, STRONG_BUSINESS)
    expect(sumWeights(result)).toBe(100)
  })

  it('appends exactly one Business Trust factor', () => {
    const result = injectBusinessTrustFactor(FOUR_FACTORS, STRONG_BUSINESS)
    expect(result).toHaveLength(FOUR_FACTORS.length + 1)
    const businessFactors = result.filter(f => f.name === 'Business Trust')
    expect(businessFactors).toHaveLength(1)
  })

  it('preserves the original factors array (does not mutate input)', () => {
    const before = JSON.parse(JSON.stringify(FOUR_FACTORS))
    injectBusinessTrustFactor(FOUR_FACTORS, STRONG_BUSINESS)
    expect(FOUR_FACTORS).toEqual(before)
  })

  it('rescales existing factors proportionally down from their original weights', () => {
    const result = injectBusinessTrustFactor(FOUR_FACTORS, STRONG_BUSINESS, 20)
    const trust = result.find(f => f.name === 'Trust')!
    const trackRecord = result.find(f => f.name === 'Track Record')!
    // Original ratio (30:30) should still hold post-rescale.
    expect(trust.weight).toBe(trackRecord.weight)
    // Budget is 80 across the original 4 factors (100 - 20 business weight).
    expect(trust.weight).toBeLessThan(30)
  })

  it('handles an empty factor list without dividing by zero', () => {
    const result = injectBusinessTrustFactor([], STRONG_BUSINESS)
    expect(result).toHaveLength(1)
    expect(sumWeights(result)).toBe(100)
  })

  it('moves the score meaningfully: a strong vs weak business profile changes the weighted outcome', () => {
    const withStrong = injectBusinessTrustFactor(FOUR_FACTORS, STRONG_BUSINESS)
    const withWeak = injectBusinessTrustFactor(FOUR_FACTORS, WEAK_BUSINESS)

    const weightedScore = (factors: ScoreFactor[]) =>
      factors.reduce((sum, f) => sum + f.weight * f.score, 0) / 100

    const strongScore = weightedScore(withStrong)
    const weakScore = weightedScore(withWeak)

    expect(strongScore - weakScore).toBeGreaterThan(15)
  })

  it('a strong business profile can flip the decision to approved where a weak one would not', () => {
    // Base factors alone sit right at the review/decline boundary.
    const borderlineFactors: ScoreFactor[] = [
      { name: 'Trust', weight: 50, score: 68, rationale: 'r' },
      { name: 'Track Record', weight: 50, score: 68, rationale: 'r' },
    ]

    const scoreFrom = (factors: ScoreFactor[]) =>
      Math.round(factors.reduce((sum, f) => sum + f.weight * f.score, 0) / 100)

    const strongFactors = injectBusinessTrustFactor(borderlineFactors, STRONG_BUSINESS)
    const weakFactors = injectBusinessTrustFactor(borderlineFactors, WEAK_BUSINESS)

    const strongEthoScore = scoreFrom(strongFactors)
    const weakEthoScore = scoreFrom(weakFactors)

    expect(strongEthoScore - weakEthoScore).toBeGreaterThanOrEqual(20)

    const strongDecision = makeDecision({
      ethoScore: strongEthoScore,
      riskBand: computeRiskBand(strongEthoScore),
      riskFactors: strongFactors,
    })
    const weakDecision = makeDecision({
      ethoScore: weakEthoScore,
      riskBand: computeRiskBand(weakEthoScore),
      riskFactors: weakFactors,
    })

    expect(strongDecision.approved).toBe(true)
    expect(weakDecision.approved).toBe(false)
  })
})
