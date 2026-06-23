import { describe, it, expect } from 'vitest'
import { computeRiskBand } from '../lib/scoring-engine'

describe('computeRiskBand', () => {
  // Boundary: high/medium at 39/40
  it('score 39 = high', () => {
    expect(computeRiskBand(39)).toBe('high')
  })

  it('score 40 = medium', () => {
    expect(computeRiskBand(40)).toBe('medium')
  })

  // Boundary: medium/low at 69/70
  it('score 69 = medium', () => {
    expect(computeRiskBand(69)).toBe('medium')
  })

  it('score 70 = low', () => {
    expect(computeRiskBand(70)).toBe('low')
  })

  // Extremes
  it('score 0 = high', () => {
    expect(computeRiskBand(0)).toBe('high')
  })

  it('score 100 = low', () => {
    expect(computeRiskBand(100)).toBe('low')
  })

  // Mid-range
  it('score 45 = medium', () => {
    expect(computeRiskBand(45)).toBe('medium')
  })

  it('score 85 = low', () => {
    expect(computeRiskBand(85)).toBe('low')
  })

  it('score 15 = high', () => {
    expect(computeRiskBand(15)).toBe('high')
  })
})
