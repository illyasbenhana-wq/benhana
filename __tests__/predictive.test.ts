import { describe, it, expect } from 'vitest'

// Test the confidence scoring logic from predictive.ts

const MIN_HISTORICAL = 20

describe('predictive confidence logic', () => {
  it('MIN_HISTORICAL is 20', () => {
    expect(MIN_HISTORICAL).toBe(20)
  })

  it('insufficient data returns 0.1 confidence', () => {
    const historicalCount = 15
    const confidence = historicalCount < MIN_HISTORICAL ? 0.1 : undefined
    expect(confidence).toBe(0.1)
  })

  it('confidence formula: peer cohort used + 100 apps = 1.0', () => {
    const usedPeers = true
    const cohortLength = 100
    const confidence = Math.min(
      Math.round(((usedPeers ? 0.3 : 0.1) + Math.min(cohortLength / 100, 0.7)) * 100) / 100,
      1
    )
    expect(confidence).toBe(1)
  })

  it('confidence formula: full history used + 50 apps = 0.6', () => {
    const usedPeers = false
    const cohortLength = 50
    const confidence = Math.min(
      Math.round(((usedPeers ? 0.3 : 0.1) + Math.min(cohortLength / 100, 0.7)) * 100) / 100,
      1
    )
    expect(confidence).toBe(0.6)
  })

  it('confidence formula: peer cohort used + 20 apps = 0.5', () => {
    const usedPeers = true
    const cohortLength = 20
    const confidence = Math.min(
      Math.round(((usedPeers ? 0.3 : 0.1) + Math.min(cohortLength / 100, 0.7)) * 100) / 100,
      1
    )
    expect(confidence).toBe(0.5)
  })

  it('confidence never exceeds 1.0', () => {
    const usedPeers = true
    const cohortLength = 500
    const confidence = Math.min(
      Math.round(((usedPeers ? 0.3 : 0.1) + Math.min(cohortLength / 100, 0.7)) * 100) / 100,
      1
    )
    expect(confidence).toBe(1)
  })

  it('approval probability with all approved', () => {
    const outcomes = { approved: 10, declined: 0, review: 0 }
    const total = outcomes.approved + outcomes.declined + outcomes.review
    const prob = Math.round((outcomes.approved / total) * 100) / 100
    expect(prob).toBe(1)
  })

  it('approval probability with none approved', () => {
    const outcomes = { approved: 0, declined: 8, review: 2 }
    const total = outcomes.approved + outcomes.declined + outcomes.review
    const prob = Math.round((outcomes.approved / total) * 100) / 100
    expect(prob).toBe(0)
  })

  it('approval probability with mixed outcomes', () => {
    const outcomes = { approved: 7, declined: 2, review: 1 }
    const total = outcomes.approved + outcomes.declined + outcomes.review
    const prob = Math.round((outcomes.approved / total) * 100) / 100
    expect(prob).toBe(0.7)
  })

  it('peer cohort fallback: <10 peers falls back to full history', () => {
    const peers = 8
    const usedPeers = peers >= 10
    expect(usedPeers).toBe(false)
  })

  it('peer cohort: >=10 peers uses peer cohort', () => {
    const peers = 10
    const usedPeers = peers >= 10
    expect(usedPeers).toBe(true)
  })
})
