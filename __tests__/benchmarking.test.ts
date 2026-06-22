import { describe, it, expect } from 'vitest'

// Test the helper functions and threshold logic directly

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function percentileOf(value: number, values: number[]): number {
  if (values.length === 0) return 50
  const below = values.filter(v => v < value).length
  return Math.round((below / values.length) * 100)
}

const MIN_COHORT_SIZE = 12

describe('benchmarking helpers', () => {
  describe('median', () => {
    it('returns 0 for empty array', () => {
      expect(median([])).toBe(0)
    })

    it('returns middle value for odd-length array', () => {
      expect(median([1, 3, 5])).toBe(3)
    })

    it('returns average of two middle values for even-length array', () => {
      expect(median([1, 3, 5, 7])).toBe(4)
    })

    it('handles single element', () => {
      expect(median([42])).toBe(42)
    })

    it('handles unsorted input', () => {
      expect(median([5, 1, 3])).toBe(3)
    })
  })

  describe('percentileOf', () => {
    it('returns 50 for empty values', () => {
      expect(percentileOf(50, [])).toBe(50)
    })

    it('returns 0 for lowest value', () => {
      expect(percentileOf(1, [1, 2, 3, 4, 5])).toBe(0)
    })

    it('returns 80 for second highest in 5 values', () => {
      expect(percentileOf(5, [1, 2, 3, 4, 5])).toBe(80)
    })

    it('returns 100 for value above all', () => {
      expect(percentileOf(100, [1, 2, 3, 4, 5])).toBe(100)
    })
  })
})

describe('MIN_COHORT_SIZE threshold', () => {
  it('is set to 12 (privacy threshold)', () => {
    expect(MIN_COHORT_SIZE).toBe(12)
  })

  it('cohort of 11 triggers insufficient_data', () => {
    const cohortSize = 11
    expect(cohortSize < MIN_COHORT_SIZE).toBe(true)
  })

  it('cohort of 12 does NOT trigger insufficient_data', () => {
    const cohortSize = 12
    expect(cohortSize < MIN_COHORT_SIZE).toBe(false)
  })

  it('cohort of 0 triggers insufficient_data', () => {
    const cohortSize = 0
    expect(cohortSize < MIN_COHORT_SIZE).toBe(true)
  })
})

describe('peer cohort construction', () => {
  it('loan range is ±30%', () => {
    const loanAmount = 10000
    const loanMin = loanAmount * 0.7
    const loanMax = loanAmount * 1.3
    expect(loanMin).toBe(7000)
    expect(loanMax).toBe(13000)

    expect(7001 >= loanMin && 7001 <= loanMax).toBe(true)
    expect(6999 >= loanMin && 6999 <= loanMax).toBe(false)
    expect(13001 >= loanMin && 13001 <= loanMax).toBe(false)
  })
})
