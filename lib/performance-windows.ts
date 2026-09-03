import { createClient } from '@supabase/supabase-js'

// Phase 2, Step 3 — Performance Windows.
//
// Computes point-in-time-correct performance aggregates from native
// decision_records + outcomes (Step 1/Step 2 of the Decision Intelligence
// layer). This module is READ from decision_records/model_versions/
// outcomes, WRITE only to performance_windows. It is deliberately never
// imported by lib/scoring-engine.ts, lib/ethoscore-v2.ts, or
// lib/decision-engine.ts — see __tests__/decision-intelligence-governance.test.ts,
// which statically enforces that boundary. Performance results are
// downstream analytical output only; there is no path back into scoring.
//
// performance_windows is derived/computed data (Step 1's migration
// deliberately gives it no immutability trigger, unlike outcomes/
// decision_records) — recalculating and upserting an existing row here is
// correct behavior, not a violation of any append-only guarantee.

// Exported (additive only — no behavior change) so the Model Performance
// Observatory (lib/model-performance-observatory.ts) can reuse the exact
// same point-in-time cutoff/maturity/leakage-prevention logic for its own
// groupings (score band, time bucket) instead of reimplementing it. Every
// existing function below is unchanged.
export const WINDOW_DAYS = [30, 60, 90, 180, 365] as const
export type WindowDays = (typeof WINDOW_DAYS)[number]

export const MIN_SAMPLE_SIZE = 30

const OUTCOME_STATUSES = [
  'current', 'delinquent_30', 'delinquent_60', 'delinquent_90',
  'default', 'write_off', 'repaid_full', 'repaid_early',
  'restructured', 'withdrawn',
] as const
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number]

interface DecisionRecordRow {
  id: string
  model_version_id: string
  decided_at: string
}

export interface OutcomeRow {
  decision_record_id: string
  status: string
  observed_at: string
  created_at: string
}

export interface PerformanceWindowMetrics {
  total_decisions: number
  decisions_with_outcome: number
  decisions_without_outcome: number
  status_counts: Partial<Record<OutcomeStatus, number>>
}

export interface PerformanceWindowResult {
  organization_id: string
  model_version_id: string
  window_days: WindowDays
  sample_size: number
  is_statistically_meaningful: boolean
  metrics: PerformanceWindowMetrics
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export function addDays(iso: string, days: number): number {
  return new Date(iso).getTime() + days * 24 * 60 * 60 * 1000
}

// For one decision, given all of that decision's outcomes and a cutoff:
// the applicable status is the most recent observation with
// observed_at <= cutoff (observed_at DESC, then created_at DESC as the
// deterministic tiebreak) — never an observation after the cutoff. This
// is the sole leakage-prevention mechanism: a later correction (however
// its superseded_outcome_id chains back) simply has an observed_at that
// fails the <= cutoff filter for an earlier window, so it can never be
// selected for that window regardless of what it corrects.
export function applicableStatusAtCutoff(outcomes: OutcomeRow[], cutoffMs: number): OutcomeStatus | null {
  let best: OutcomeRow | null = null
  for (const o of outcomes) {
    const observedMs = new Date(o.observed_at).getTime()
    if (observedMs > cutoffMs) continue
    if (!best) { best = o; continue }
    const bestObservedMs = new Date(best.observed_at).getTime()
    if (observedMs > bestObservedMs) { best = o; continue }
    if (observedMs === bestObservedMs && new Date(o.created_at).getTime() > new Date(best.created_at).getTime()) {
      best = o
    }
  }
  return best ? (best.status as OutcomeStatus) : null
}

// Pure calculation core — takes already-fetched rows and a fixed `now`, so
// it is deterministic and independently testable without a database.
// Exported for tests; calculateAndPersistPerformanceWindows() below is the
// actual read+write entry point.
export function computePerformanceWindows(params: {
  organizationId: string
  decisionRecords: DecisionRecordRow[]
  outcomes: OutcomeRow[]
  now: Date
}): PerformanceWindowResult[] {
  const { organizationId, decisionRecords, outcomes, now } = params
  const nowMs = now.getTime()

  const outcomesByDecisionRecordId = new Map<string, OutcomeRow[]>()
  for (const o of outcomes) {
    const list = outcomesByDecisionRecordId.get(o.decision_record_id)
    if (list) list.push(o)
    else outcomesByDecisionRecordId.set(o.decision_record_id, [o])
  }

  const decisionsByModelVersion = new Map<string, DecisionRecordRow[]>()
  for (const d of decisionRecords) {
    const list = decisionsByModelVersion.get(d.model_version_id)
    if (list) list.push(d)
    else decisionsByModelVersion.set(d.model_version_id, [d])
  }

  const results: PerformanceWindowResult[] = []

  for (const [modelVersionId, decisions] of decisionsByModelVersion) {
    for (const windowDays of WINDOW_DAYS) {
      // A window is only "complete" once its own cutoff has actually
      // passed — a decision made 10 days ago has no completed 30-day
      // window yet, and is excluded, not counted as "no outcome."
      const eligible = decisions.filter(d => addDays(d.decided_at, windowDays) <= nowMs)

      const statusCounts: Partial<Record<OutcomeStatus, number>> = {}
      let withOutcome = 0
      let withoutOutcome = 0

      for (const d of eligible) {
        const cutoffMs = addDays(d.decided_at, windowDays)
        const decisionOutcomes = outcomesByDecisionRecordId.get(d.id) ?? []
        const status = applicableStatusAtCutoff(decisionOutcomes, cutoffMs)
        if (status === null) {
          withoutOutcome += 1
        } else {
          withOutcome += 1
          statusCounts[status] = (statusCounts[status] ?? 0) + 1
        }
      }

      const sampleSize = eligible.length

      results.push({
        organization_id: organizationId,
        model_version_id: modelVersionId,
        window_days: windowDays,
        sample_size: sampleSize,
        is_statistically_meaningful: sampleSize >= MIN_SAMPLE_SIZE,
        metrics: {
          total_decisions: sampleSize,
          decisions_with_outcome: withOutcome,
          decisions_without_outcome: withoutOutcome,
          status_counts: statusCounts,
        },
      })
    }
  }

  return results
}

export interface CalculateAndPersistResult {
  success: boolean
  windowsWritten: number
  error?: string
}

// Read+write entry point: fetches native decision_records + outcomes for
// one organization (never historical_decision_records, never another
// org's rows), computes every (model_version, window) combination present
// in that org's decisions, and upserts each into performance_windows on
// the existing (organization_id, model_version_id, window_days) unique
// constraint — so rerunning this against the same underlying data is
// idempotent and never creates duplicate rows.
export async function calculateAndPersistPerformanceWindows(
  organizationId: string,
  now: Date = new Date()
): Promise<CalculateAndPersistResult> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, windowsWritten: 0, error: 'Database not configured' }
  }

  const { data: decisionRecords, error: drError } = await supabase
    .from('decision_records')
    .select('id, model_version_id, decided_at')
    .eq('organization_id', organizationId)

  if (drError) {
    return { success: false, windowsWritten: 0, error: drError.message }
  }
  if (!decisionRecords || decisionRecords.length === 0) {
    return { success: true, windowsWritten: 0 }
  }

  const decisionRecordIds = decisionRecords.map(d => d.id)
  const { data: outcomes, error: outcomesError } = await supabase
    .from('outcomes')
    .select('decision_record_id, status, observed_at, created_at')
    .eq('organization_id', organizationId)
    .in('decision_record_id', decisionRecordIds)

  if (outcomesError) {
    return { success: false, windowsWritten: 0, error: outcomesError.message }
  }

  const results = computePerformanceWindows({
    organizationId,
    decisionRecords: decisionRecords as DecisionRecordRow[],
    outcomes: (outcomes ?? []) as OutcomeRow[],
    now,
  })

  if (results.length === 0) {
    return { success: true, windowsWritten: 0 }
  }

  const rows = results.map(r => ({
    organization_id: r.organization_id,
    model_version_id: r.model_version_id,
    window_days: r.window_days,
    sample_size: r.sample_size,
    is_statistically_meaningful: r.is_statistically_meaningful,
    metrics: r.metrics,
    calculated_at: now.toISOString(),
  }))

  const { error: upsertError } = await supabase
    .from('performance_windows')
    .upsert(rows, { onConflict: 'organization_id,model_version_id,window_days' })

  if (upsertError) {
    return { success: false, windowsWritten: 0, error: upsertError.message }
  }

  return { success: true, windowsWritten: rows.length }
}
