import { describe, it, expect } from 'vitest'
import { computeScoreBandPerformance, computePerformanceOverTime } from '../lib/model-performance-observatory'

const FAR_FUTURE = new Date('2030-01-01T00:00:00Z')

function decision(id: string, riskBand: string, decidedAt: string) {
  return { id, risk_band: riskBand, decided_at: decidedAt }
}
function outcome(decisionRecordId: string, status: string, observedAt: string, createdAt = observedAt) {
  return { decision_record_id: decisionRecordId, status, observed_at: observedAt, created_at: createdAt }
}

describe('computeScoreBandPerformance', () => {
  it('always returns exactly the three established risk bands, even with zero decisions', () => {
    const rows = computeScoreBandPerformance({ decisions: [], outcomes: [], windowDays: 90, now: FAR_FUTURE })
    expect(rows.map(r => r.risk_band).sort()).toEqual(['high', 'low', 'medium'])
    for (const r of rows) {
      expect(r.metrics.decision_volume).toBe(0)
      expect(r.metrics.outcome_coverage).toBeNull()
      expect(r.metrics.is_statistically_meaningful).toBe(false)
    }
  })

  it('groups decisions by risk_band and computes observed_bad_rate only from default/write_off/delinquent_90', () => {
    const rows = computeScoreBandPerformance({
      decisions: [
        decision('d1', 'low', '2026-01-01T00:00:00Z'),
        decision('d2', 'low', '2026-01-01T00:00:00Z'),
        decision('d3', 'high', '2026-01-01T00:00:00Z'),
      ],
      outcomes: [
        outcome('d1', 'repaid_full', '2026-02-01T00:00:00Z'),
        outcome('d2', 'default', '2026-02-01T00:00:00Z'),
        outcome('d3', 'delinquent_30', '2026-02-01T00:00:00Z'), // not counted as "bad"
      ],
      windowDays: 90, now: FAR_FUTURE,
    })
    const low = rows.find(r => r.risk_band === 'low')!
    expect(low.metrics.decision_volume).toBe(2)
    expect(low.metrics.decisions_with_outcome).toBe(2)
    expect(low.metrics.observed_bad_rate).toBe(0.5) // 1 default of 2 observed

    const high = rows.find(r => r.risk_band === 'high')!
    expect(high.metrics.observed_bad_rate).toBe(0) // delinquent_30 is not "bad"
  })

  it('excludes immature decisions from the band entirely (not counted as "no outcome")', () => {
    const now = new Date('2026-01-11T00:00:00Z')
    const rows = computeScoreBandPerformance({
      decisions: [decision('d1', 'low', '2026-01-01T00:00:00Z')], // only 10 days old
      outcomes: [],
      windowDays: 90, now,
    })
    const low = rows.find(r => r.risk_band === 'low')!
    expect(low.metrics.decision_volume).toBe(0)
  })

  it('point-in-time correctness: an outcome observed after the window cutoff is not counted', () => {
    const rows = computeScoreBandPerformance({
      decisions: [decision('d1', 'medium', '2026-01-01T00:00:00Z')],
      outcomes: [outcome('d1', 'default', '2026-06-01T00:00:00Z')], // long after a 30-day cutoff
      windowDays: 30, now: FAR_FUTURE,
    })
    const medium = rows.find(r => r.risk_band === 'medium')!
    expect(medium.metrics.decisions_with_outcome).toBe(0)
    expect(medium.metrics.decisions_without_outcome).toBe(1)
  })

  it('is_statistically_meaningful flips at the same 30-decision threshold used by performance_windows', () => {
    const decisions29 = Array.from({ length: 29 }, (_, i) => decision(`d${i}`, 'low', '2026-01-01T00:00:00Z'))
    const rows29 = computeScoreBandPerformance({ decisions: decisions29, outcomes: [], windowDays: 90, now: FAR_FUTURE })
    expect(rows29.find(r => r.risk_band === 'low')!.metrics.is_statistically_meaningful).toBe(false)

    const decisions30 = Array.from({ length: 30 }, (_, i) => decision(`d${i}`, 'low', '2026-01-01T00:00:00Z'))
    const rows30 = computeScoreBandPerformance({ decisions: decisions30, outcomes: [], windowDays: 90, now: FAR_FUTURE })
    expect(rows30.find(r => r.risk_band === 'low')!.metrics.is_statistically_meaningful).toBe(true)
  })
})

describe('computePerformanceOverTime', () => {
  it('buckets by decided_at month, not by outcome observation date', () => {
    const rows = computePerformanceOverTime({
      decisions: [decision('d1', 'low', '2026-01-15T00:00:00Z') as any],
      outcomes: [outcome('d1', 'current', '2026-04-01T00:00:00Z')], // observed in April
      windowDays: 30, now: FAR_FUTURE,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].month).toBe('2026-01') // bucketed by decision month, not observation month
  })

  it('returns months in chronological order', () => {
    const rows = computePerformanceOverTime({
      decisions: [
        decision('d1', 'low', '2026-03-01T00:00:00Z') as any,
        decision('d2', 'low', '2026-01-01T00:00:00Z') as any,
        decision('d3', 'low', '2026-02-01T00:00:00Z') as any,
      ],
      outcomes: [],
      windowDays: 30, now: FAR_FUTURE,
    })
    expect(rows.map(r => r.month)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('deterministic: identical input produces identical output', () => {
    const input = {
      decisions: [decision('d1', 'low', '2026-01-01T00:00:00Z') as any],
      outcomes: [outcome('d1', 'current', '2026-01-10T00:00:00Z')],
      windowDays: 30 as const, now: FAR_FUTURE,
    }
    expect(computePerformanceOverTime(input)).toEqual(computePerformanceOverTime(input))
  })
})
