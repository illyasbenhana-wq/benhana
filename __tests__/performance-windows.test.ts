import { describe, it, expect } from 'vitest'
import { computePerformanceWindows } from '../lib/performance-windows'

// Pure, database-free tests of the calculation core. now is always fixed
// and injected, so every scenario is deterministic and doesn't depend on
// wall-clock time.

const ORG_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const MODEL_A = '11111111-1111-1111-1111-111111111111'
const MODEL_B = '22222222-2222-2222-2222-222222222222'

const FAR_FUTURE = new Date('2030-01-01T00:00:00Z') // ensures every window in these tests is "mature"

function decision(id: string, modelVersionId: string, decidedAt: string) {
  return { id, model_version_id: modelVersionId, decided_at: decidedAt }
}

function outcome(decisionRecordId: string, status: string, observedAt: string, createdAt = observedAt) {
  return { decision_record_id: decisionRecordId, status, observed_at: observedAt, created_at: createdAt }
}

function windowFor(results: ReturnType<typeof computePerformanceWindows>, modelVersionId: string, windowDays: number) {
  return results.find(r => r.model_version_id === modelVersionId && r.window_days === windowDays)!
}

describe('computePerformanceWindows — point-in-time correctness', () => {
  it('A. 30-day cutoff uses only the outcome observed by day 30, per the spec example', () => {
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [decision('d1', MODEL_A, '2026-01-01T00:00:00Z')],
      outcomes: [
        outcome('d1', 'delinquent_30', '2026-01-15T00:00:00Z'),
        outcome('d1', 'current', '2026-02-10T00:00:00Z'),
        outcome('d1', 'repaid_full', '2026-03-01T00:00:00Z'),
      ],
      now: FAR_FUTURE,
    })
    const w30 = windowFor(results, MODEL_A, 30)
    expect(w30.metrics.status_counts).toEqual({ delinquent_30: 1 })
    expect(w30.metrics.decisions_with_outcome).toBe(1)
    expect(w30.metrics.decisions_without_outcome).toBe(0)
  })

  it('B. 60-day cutoff picks up the outcome observed by day 60', () => {
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [decision('d1', MODEL_A, '2026-01-01T00:00:00Z')],
      outcomes: [
        outcome('d1', 'delinquent_30', '2026-01-15T00:00:00Z'),
        outcome('d1', 'current', '2026-02-10T00:00:00Z'), // day 40 — within 60
        outcome('d1', 'repaid_full', '2026-03-01T00:00:00Z'), // day 59 — within 60 too, later
      ],
      now: FAR_FUTURE,
    })
    const w60 = windowFor(results, MODEL_A, 60)
    // 2026-01-01 + 60 days = 2026-03-02, so repaid_full (03-01) is the most recent applicable
    expect(w60.metrics.status_counts).toEqual({ repaid_full: 1 })
  })

  it('C. 90-day cutoff excludes an outcome observed after day 90', () => {
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [decision('d1', MODEL_A, '2026-01-01T00:00:00Z')],
      outcomes: [
        outcome('d1', 'delinquent_60', '2026-03-01T00:00:00Z'), // day 59
        outcome('d1', 'default', '2026-06-01T00:00:00Z'), // day ~151 — after 90-day cutoff
      ],
      now: FAR_FUTURE,
    })
    const w90 = windowFor(results, MODEL_A, 90)
    expect(w90.metrics.status_counts).toEqual({ delinquent_60: 1 })
  })

  it('D. an immature window (cutoff not yet reached) excludes the decision from that window entirely', () => {
    const now = new Date('2026-01-11T00:00:00Z') // only 10 days after decided_at
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [decision('d1', MODEL_A, '2026-01-01T00:00:00Z')],
      outcomes: [outcome('d1', 'current', '2026-01-05T00:00:00Z')],
      now,
    })
    const w30 = windowFor(results, MODEL_A, 30)
    // Not "no outcome" (sample_size 1, without_outcome 1) — excluded entirely (sample_size 0).
    expect(w30.sample_size).toBe(0)
    expect(w30.metrics.total_decisions).toBe(0)
  })

  it('E. an outcome observed after the cutoff is ignored, not just deprioritized', () => {
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [decision('d1', MODEL_A, '2026-01-01T00:00:00Z')],
      outcomes: [outcome('d1', 'default', '2026-02-15T00:00:00Z')], // day 45, after 30-day cutoff
      now: FAR_FUTURE,
    })
    const w30 = windowFor(results, MODEL_A, 30)
    expect(w30.metrics.decisions_with_outcome).toBe(0)
    expect(w30.metrics.decisions_without_outcome).toBe(1)
    expect(w30.metrics.status_counts).toEqual({})
  })

  it('F. multiple outcomes over time: each window picks the correct point-in-time state', () => {
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [decision('d1', MODEL_A, '2026-01-01T00:00:00Z')],
      outcomes: [
        outcome('d1', 'delinquent_30', '2026-01-20T00:00:00Z'), // day 19
        outcome('d1', 'current', '2026-02-05T00:00:00Z'),        // day 35
        outcome('d1', 'delinquent_60', '2026-03-10T00:00:00Z'),  // day 68
        outcome('d1', 'repaid_full', '2026-12-01T00:00:00Z'),    // day ~334
      ],
      now: FAR_FUTURE,
    })
    expect(windowFor(results, MODEL_A, 30).metrics.status_counts).toEqual({ delinquent_30: 1 })
    expect(windowFor(results, MODEL_A, 60).metrics.status_counts).toEqual({ current: 1 })
    expect(windowFor(results, MODEL_A, 90).metrics.status_counts).toEqual({ delinquent_60: 1 })
    expect(windowFor(results, MODEL_A, 365).metrics.status_counts).toEqual({ repaid_full: 1 })
  })

  it('G. a correction observed after the cutoff does not contaminate the earlier window — exact spec example', () => {
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [decision('d1', MODEL_A, '2026-01-01T00:00:00Z')],
      outcomes: [
        outcome('d1', 'delinquent_30', '2026-01-20T00:00:00Z'), // original
        outcome('d1', 'current', '2026-02-20T00:00:00Z'),        // correction, observed after the 30-day cutoff
      ],
      now: FAR_FUTURE,
    })
    const w30 = windowFor(results, MODEL_A, 30)
    expect(w30.metrics.status_counts).toEqual({ delinquent_30: 1 })
    expect(w30.metrics.status_counts).not.toHaveProperty('current')
  })

  it('H. a decision with no observable outcome by the cutoff is counted separately, not skipped', () => {
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [decision('d1', MODEL_A, '2026-01-01T00:00:00Z')],
      outcomes: [],
      now: FAR_FUTURE,
    })
    const w30 = windowFor(results, MODEL_A, 30)
    expect(w30.sample_size).toBe(1)
    expect(w30.metrics.decisions_without_outcome).toBe(1)
    expect(w30.metrics.decisions_with_outcome).toBe(0)
  })

  it('I. outcome status counts aggregate correctly across multiple decisions', () => {
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [
        decision('d1', MODEL_A, '2026-01-01T00:00:00Z'),
        decision('d2', MODEL_A, '2026-01-01T00:00:00Z'),
        decision('d3', MODEL_A, '2026-01-01T00:00:00Z'),
      ],
      outcomes: [
        outcome('d1', 'current', '2026-01-10T00:00:00Z'),
        outcome('d2', 'current', '2026-01-10T00:00:00Z'),
        outcome('d3', 'delinquent_30', '2026-01-10T00:00:00Z'),
      ],
      now: FAR_FUTURE,
    })
    const w30 = windowFor(results, MODEL_A, 30)
    expect(w30.metrics.status_counts).toEqual({ current: 2, delinquent_30: 1 })
    expect(w30.sample_size).toBe(3)
  })

  it('J. minimum sample threshold: 29 decisions is not meaningful, 30 is', () => {
    const decisions29 = Array.from({ length: 29 }, (_, i) => decision(`d${i}`, MODEL_A, '2026-01-01T00:00:00Z'))
    const results29 = computePerformanceWindows({ organizationId: ORG_ID, decisionRecords: decisions29, outcomes: [], now: FAR_FUTURE })
    expect(windowFor(results29, MODEL_A, 30).sample_size).toBe(29)
    expect(windowFor(results29, MODEL_A, 30).is_statistically_meaningful).toBe(false)

    const decisions30 = Array.from({ length: 30 }, (_, i) => decision(`d${i}`, MODEL_A, '2026-01-01T00:00:00Z'))
    const results30 = computePerformanceWindows({ organizationId: ORG_ID, decisionRecords: decisions30, outcomes: [], now: FAR_FUTURE })
    expect(windowFor(results30, MODEL_A, 30).sample_size).toBe(30)
    expect(windowFor(results30, MODEL_A, 30).is_statistically_meaningful).toBe(true)
  })

  it('K. decisions are aggregated separately per model_version_id', () => {
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [
        decision('d1', MODEL_A, '2026-01-01T00:00:00Z'),
        decision('d2', MODEL_B, '2026-01-01T00:00:00Z'),
      ],
      outcomes: [
        outcome('d1', 'current', '2026-01-10T00:00:00Z'),
        outcome('d2', 'default', '2026-01-10T00:00:00Z'),
      ],
      now: FAR_FUTURE,
    })
    expect(windowFor(results, MODEL_A, 30).metrics.status_counts).toEqual({ current: 1 })
    expect(windowFor(results, MODEL_B, 30).metrics.status_counts).toEqual({ default: 1 })
    // every model_version_id present gets all 5 windows
    expect(results.filter(r => r.model_version_id === MODEL_A)).toHaveLength(5)
    expect(results.filter(r => r.model_version_id === MODEL_B)).toHaveLength(5)
  })

  it('produces exactly the five required windows: 30/60/90/180/365', () => {
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [decision('d1', MODEL_A, '2026-01-01T00:00:00Z')],
      outcomes: [],
      now: FAR_FUTURE,
    })
    expect(results.map(r => r.window_days).sort((a, b) => a - b)).toEqual([30, 60, 90, 180, 365])
  })

  it('uses created_at as a deterministic tiebreak when two outcomes share the same observed_at', () => {
    const results = computePerformanceWindows({
      organizationId: ORG_ID,
      decisionRecords: [decision('d1', MODEL_A, '2026-01-01T00:00:00Z')],
      outcomes: [
        outcome('d1', 'delinquent_30', '2026-01-10T00:00:00Z', '2026-01-10T00:00:00Z'),
        outcome('d1', 'current', '2026-01-10T00:00:00Z', '2026-01-10T00:00:01Z'), // same observed_at, created 1s later
      ],
      now: FAR_FUTURE,
    })
    expect(windowFor(results, MODEL_A, 30).metrics.status_counts).toEqual({ current: 1 })
  })

  it('running the calculation twice on identical input produces an identical result (determinism)', () => {
    const input = {
      organizationId: ORG_ID,
      decisionRecords: [decision('d1', MODEL_A, '2026-01-01T00:00:00Z')],
      outcomes: [outcome('d1', 'current', '2026-01-10T00:00:00Z')],
      now: FAR_FUTURE,
    }
    expect(computePerformanceWindows(input)).toEqual(computePerformanceWindows(input))
  })
})
