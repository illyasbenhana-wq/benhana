import { createClient } from '@supabase/supabase-js'
import {
  addDays, applicableStatusAtCutoff, WINDOW_DAYS, MIN_SAMPLE_SIZE,
  type WindowDays, type OutcomeStatus, type OutcomeRow,
} from './performance-windows'
import type { RiskBand } from '@/types'

// Model Performance Observatory — a READ-ONLY presentation/aggregation
// layer answering "is EthoFi actually performing well?" It writes NOTHING
// to any table. It computes NOTHING that couldn't in principle be derived
// from decision_records + outcomes + performance_windows + model_versions
// — all already-immutable or already-derived data. It never touches
// scoring, decisioning, or historical_decision_records.
//
// Two of its three views reuse lib/performance-windows.ts directly rather
// than duplicating its logic:
//   - "by model version" reads the already-computed, already-tested
//     performance_windows table verbatim (no recalculation).
//   - "by score band" and "over time" are NEW groupings performance_windows
//     doesn't provide (it only groups by model_version_id), but reuse its
//     exact exported point-in-time helpers (addDays, applicableStatusAtCutoff,
//     WINDOW_DAYS, MIN_SAMPLE_SIZE) so the leakage-prevention/maturity
//     logic is never reimplemented, only regrouped.
//
// "Score bands" = this app's existing computeRiskBand() output
// (low/medium/high, lib/risk-band.ts) — not invented numeric buckets. No
// other scoring scale exists in this codebase to bucket by.

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── Shared metric shape ────────────────────────────────────────────────────

export interface ObservedMetrics {
  decision_volume: number                 // denominator for "of decisions in scope"
  decisions_with_outcome: number           // numerator for outcome_coverage
  decisions_without_outcome: number
  outcome_coverage: number | null          // decisions_with_outcome / decision_volume, null if decision_volume = 0
  status_counts: Partial<Record<OutcomeStatus, number>>
  observed_bad_rate: number | null         // (default+write_off+delinquent_90) / decisions_with_outcome, null if decisions_with_outcome = 0
  is_statistically_meaningful: boolean     // decision_volume >= MIN_SAMPLE_SIZE (same threshold as performance_windows)
}

// "Bad" is deliberately narrow and documented, not invented per-report:
// default, write_off, and delinquent_90 are the three outcome statuses in
// the existing controlled vocabulary that represent a materially adverse
// result. current/repaid_full/repaid_early/restructured/delinquent_30/
// delinquent_60/withdrawn are not counted as "bad" — delinquent_30/60 are
// early-stage and often self-cure, restructured is a managed outcome, and
// withdrawn means no lending relationship occurred at all.
const BAD_STATUSES = new Set<OutcomeStatus>(['default', 'write_off', 'delinquent_90'])

function emptyMetrics(): ObservedMetrics {
  return {
    decision_volume: 0, decisions_with_outcome: 0, decisions_without_outcome: 0,
    outcome_coverage: null, status_counts: {}, observed_bad_rate: null, is_statistically_meaningful: false,
  }
}

function finalizeMetrics(decisionVolume: number, withOutcome: number, withoutOutcome: number, statusCounts: Partial<Record<OutcomeStatus, number>>): ObservedMetrics {
  let bad = 0
  for (const status of BAD_STATUSES) bad += statusCounts[status] ?? 0
  return {
    decision_volume: decisionVolume,
    decisions_with_outcome: withOutcome,
    decisions_without_outcome: withoutOutcome,
    outcome_coverage: decisionVolume > 0 ? withOutcome / decisionVolume : null,
    status_counts: statusCounts,
    observed_bad_rate: withOutcome > 0 ? bad / withOutcome : null,
    is_statistically_meaningful: decisionVolume >= MIN_SAMPLE_SIZE,
  }
}

// ─── 1. By model version — reuses performance_windows verbatim ─────────────

export interface ModelVersionPerformance {
  model_version_id: string
  score_version: string
  prompt_version: string
  model_requested: string | null
  model_responded: string | null
  first_seen_at: string
  window_days: WindowDays
  metrics: ObservedMetrics
  calculated_at: string
}

export interface GetModelVersionPerformanceResult {
  success: boolean
  rows: ModelVersionPerformance[]
  error?: string
}

// Reads the already-computed performance_windows table for one org/window
// — does NOT recalculate anything. If performance_windows is stale
// relative to new outcomes, that's an existing, separate concern (see
// calculateAndPersistPerformanceWindows in lib/performance-windows.ts) —
// this function is a read-only view over whatever is currently stored.
export async function getModelVersionPerformance(organizationId: string, windowDays: WindowDays): Promise<GetModelVersionPerformanceResult> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, rows: [], error: 'Database not configured' }

  const { data: windows, error: pwError } = await supabase
    .from('performance_windows')
    .select('model_version_id, window_days, sample_size, is_statistically_meaningful, metrics, calculated_at')
    .eq('organization_id', organizationId)
    .eq('window_days', windowDays)

  if (pwError) return { success: false, rows: [], error: pwError.message }
  if (!windows || windows.length === 0) return { success: true, rows: [] }

  const modelVersionIds = windows.map(w => w.model_version_id)
  const { data: modelVersions, error: mvError } = await supabase
    .from('model_versions')
    .select('id, score_version, prompt_version, model_requested, model_responded, first_seen_at')
    .in('id', modelVersionIds)

  if (mvError) return { success: false, rows: [], error: mvError.message }
  const modelVersionById = new Map((modelVersions ?? []).map(mv => [mv.id, mv]))

  const rows: ModelVersionPerformance[] = windows
    .filter(w => modelVersionById.has(w.model_version_id))
    .map(w => {
      const mv = modelVersionById.get(w.model_version_id)!
      const m = w.metrics as { total_decisions: number; decisions_with_outcome: number; decisions_without_outcome: number; status_counts: Partial<Record<OutcomeStatus, number>> }
      return {
        model_version_id: w.model_version_id,
        score_version: mv.score_version, prompt_version: mv.prompt_version,
        model_requested: mv.model_requested, model_responded: mv.model_responded, first_seen_at: mv.first_seen_at,
        window_days: w.window_days,
        metrics: finalizeMetrics(m.total_decisions, m.decisions_with_outcome, m.decisions_without_outcome, m.status_counts),
        calculated_at: w.calculated_at,
      }
    })

  return { success: true, rows }
}

// ─── 2. By score band — NEW grouping, reuses point-in-time helpers ─────────

const RISK_BANDS: RiskBand[] = ['low', 'medium', 'high']

export interface ScoreBandPerformance {
  risk_band: RiskBand
  window_days: WindowDays
  metrics: ObservedMetrics
}

interface NativeDecisionRow {
  id: string
  risk_band: string
  decided_at: string
}

export interface GetScoreBandPerformanceResult {
  success: boolean
  rows: ScoreBandPerformance[]
  error?: string
}

export async function getScoreBandPerformance(
  organizationId: string, windowDays: WindowDays, now: Date = new Date()
): Promise<GetScoreBandPerformanceResult> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, rows: [], error: 'Database not configured' }

  // Native decision_records only — never historical_decision_records
  // (a completely separate, unrelated table this function never queries).
  const { data: decisions, error: drError } = await supabase
    .from('decision_records')
    .select('id, risk_band, decided_at')
    .eq('organization_id', organizationId)

  if (drError) return { success: false, rows: [], error: drError.message }
  if (!decisions || decisions.length === 0) return { success: true, rows: RISK_BANDS.map(b => ({ risk_band: b, window_days: windowDays, metrics: emptyMetrics() })) }

  const decisionIds = decisions.map(d => d.id)
  const { data: outcomes, error: outError } = await supabase
    .from('outcomes')
    .select('decision_record_id, status, observed_at, created_at')
    .eq('organization_id', organizationId)
    .in('decision_record_id', decisionIds)

  if (outError) return { success: false, rows: [], error: outError.message }

  const rows = computeScoreBandPerformance({
    decisions: decisions as NativeDecisionRow[],
    outcomes: (outcomes ?? []) as OutcomeRow[],
    windowDays, now,
  })

  return { success: true, rows }
}

// Pure core, independently testable without a database — mirrors the
// structure of computePerformanceWindows() in lib/performance-windows.ts
// but groups by risk_band instead of model_version_id, using the exact
// same maturity gate and outcome-selection rule.
export function computeScoreBandPerformance(params: {
  decisions: NativeDecisionRow[]
  outcomes: OutcomeRow[]
  windowDays: WindowDays
  now: Date
}): ScoreBandPerformance[] {
  const { decisions, outcomes, windowDays, now } = params
  const nowMs = now.getTime()

  const outcomesByDecisionRecordId = new Map<string, OutcomeRow[]>()
  for (const o of outcomes) {
    const list = outcomesByDecisionRecordId.get(o.decision_record_id)
    if (list) list.push(o)
    else outcomesByDecisionRecordId.set(o.decision_record_id, [o])
  }

  const decisionsByBand = new Map<string, NativeDecisionRow[]>()
  for (const d of decisions) {
    const list = decisionsByBand.get(d.risk_band)
    if (list) list.push(d)
    else decisionsByBand.set(d.risk_band, [d])
  }

  return RISK_BANDS.map(band => {
    const bandDecisions = decisionsByBand.get(band) ?? []
    // Same maturity gate as computePerformanceWindows(): a decision whose
    // window hasn't elapsed yet is excluded, not counted as "no outcome."
    const eligible = bandDecisions.filter(d => addDays(d.decided_at, windowDays) <= nowMs)

    const statusCounts: Partial<Record<OutcomeStatus, number>> = {}
    let withOutcome = 0
    let withoutOutcome = 0

    for (const d of eligible) {
      const cutoffMs = addDays(d.decided_at, windowDays)
      const status = applicableStatusAtCutoff(outcomesByDecisionRecordId.get(d.id) ?? [], cutoffMs)
      if (status === null) withoutOutcome += 1
      else { withOutcome += 1; statusCounts[status] = (statusCounts[status] ?? 0) + 1 }
    }

    return { risk_band: band, window_days: windowDays, metrics: finalizeMetrics(eligible.length, withOutcome, withoutOutcome, statusCounts) }
  })
}

// ─── 3. Over time — NEW grouping by decided_at month, same reuse pattern ───

export interface TimeBucketPerformance {
  month: string // 'YYYY-MM', bucketed by decided_at (decision date, never outcome/observation date)
  window_days: WindowDays
  metrics: ObservedMetrics
}

export interface GetPerformanceOverTimeResult {
  success: boolean
  rows: TimeBucketPerformance[]
  error?: string
}

export async function getPerformanceOverTime(
  organizationId: string, windowDays: WindowDays, now: Date = new Date(), modelVersionId?: string
): Promise<GetPerformanceOverTimeResult> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, rows: [], error: 'Database not configured' }

  let query = supabase.from('decision_records').select('id, decided_at').eq('organization_id', organizationId)
  if (modelVersionId) query = query.eq('model_version_id', modelVersionId)
  const { data: decisions, error: drError } = await query

  if (drError) return { success: false, rows: [], error: drError.message }
  if (!decisions || decisions.length === 0) return { success: true, rows: [] }

  const decisionIds = decisions.map(d => d.id)
  const { data: outcomes, error: outError } = await supabase
    .from('outcomes')
    .select('decision_record_id, status, observed_at, created_at')
    .eq('organization_id', organizationId)
    .in('decision_record_id', decisionIds)

  if (outError) return { success: false, rows: [], error: outError.message }

  const rows = computePerformanceOverTime({
    decisions: decisions as { id: string; decided_at: string }[],
    outcomes: (outcomes ?? []) as OutcomeRow[],
    windowDays, now,
  })

  return { success: true, rows }
}

export function computePerformanceOverTime(params: {
  decisions: { id: string; decided_at: string }[]
  outcomes: OutcomeRow[]
  windowDays: WindowDays
  now: Date
}): TimeBucketPerformance[] {
  const { decisions, outcomes, windowDays, now } = params
  const nowMs = now.getTime()

  const outcomesByDecisionRecordId = new Map<string, OutcomeRow[]>()
  for (const o of outcomes) {
    const list = outcomesByDecisionRecordId.get(o.decision_record_id)
    if (list) list.push(o)
    else outcomesByDecisionRecordId.set(o.decision_record_id, [o])
  }

  // Bucketed by decided_at (decision date) — never by observed_at (outcome
  // observation date) and never by "today": using outcome-observation date
  // to bucket would let later-observed outcomes retroactively inflate an
  // earlier month's apparent completeness, exactly the leakage this
  // architecture exists to prevent.
  const decisionsByMonth = new Map<string, { id: string; decided_at: string }[]>()
  for (const d of decisions) {
    const month = d.decided_at.slice(0, 7)
    const list = decisionsByMonth.get(month)
    if (list) list.push(d)
    else decisionsByMonth.set(month, [d])
  }

  const months = [...decisionsByMonth.keys()].sort()

  return months.map(month => {
    const monthDecisions = decisionsByMonth.get(month)!
    const eligible = monthDecisions.filter(d => addDays(d.decided_at, windowDays) <= nowMs)

    const statusCounts: Partial<Record<OutcomeStatus, number>> = {}
    let withOutcome = 0
    let withoutOutcome = 0

    for (const d of eligible) {
      const cutoffMs = addDays(d.decided_at, windowDays)
      const status = applicableStatusAtCutoff(outcomesByDecisionRecordId.get(d.id) ?? [], cutoffMs)
      if (status === null) withoutOutcome += 1
      else { withOutcome += 1; statusCounts[status] = (statusCounts[status] ?? 0) + 1 }
    }

    return { month, window_days: windowDays, metrics: finalizeMetrics(eligible.length, withOutcome, withoutOutcome, statusCounts) }
  })
}

// ─── Combined summary ───────────────────────────────────────────────────────

export interface ObservatorySummary {
  organization_id: string
  window_days: WindowDays
  by_model_version: ModelVersionPerformance[]
  by_score_band: ScoreBandPerformance[]
  over_time: TimeBucketPerformance[]
  // True only if at least one group anywhere has is_statistically_meaningful
  // = true. This is the honesty gate described in the spec: the UI/caller
  // must not present numbers as real-world performance when this is false.
  real_performance_measurable: boolean
  generated_at: string
}

export type ObservatoryOutcome = { success: true; summary: ObservatorySummary } | { success: false; error: string }

export async function getObservatorySummary(organizationId: string, windowDays: WindowDays, now: Date = new Date()): Promise<ObservatoryOutcome> {
  const [byModelVersion, byScoreBand, overTime] = await Promise.all([
    getModelVersionPerformance(organizationId, windowDays),
    getScoreBandPerformance(organizationId, windowDays, now),
    getPerformanceOverTime(organizationId, windowDays, now),
  ])

  if (byModelVersion.success === false) return { success: false, error: byModelVersion.error ?? 'model-version query failed' }
  if (byScoreBand.success === false) return { success: false, error: byScoreBand.error ?? 'score-band query failed' }
  if (overTime.success === false) return { success: false, error: overTime.error ?? 'time-series query failed' }

  const realPerformanceMeasurable =
    byModelVersion.rows.some(r => r.metrics.is_statistically_meaningful) ||
    byScoreBand.rows.some(r => r.metrics.is_statistically_meaningful) ||
    overTime.rows.some(r => r.metrics.is_statistically_meaningful)

  return {
    success: true,
    summary: {
      organization_id: organizationId,
      window_days: windowDays,
      by_model_version: byModelVersion.rows,
      by_score_band: byScoreBand.rows,
      over_time: overTime.rows,
      real_performance_measurable: realPerformanceMeasurable,
      generated_at: now.toISOString(),
    },
  }
}
