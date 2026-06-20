import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FactorComparison {
  factor: string
  applicant: number
  cohort_avg: number
  percentile: number
}

export interface BenchmarkResult {
  percentile: number
  peer_cohort: {
    size: number
    avg_score: number
    median_score: number
  }
  comparisons: FactorComparison[]
  basis: 'sufficient_data' | 'insufficient_data'
}

const MIN_COHORT_SIZE = 5

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function benchmark(
  applicationId: string,
  orgId: string
): Promise<{ success: true; data: BenchmarkResult } | { success: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, error: 'Database not configured' }

  // Fetch the target application + its score
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, employment_type, loan_amount')
    .eq('id', applicationId)
    .eq('organization_id', orgId)
    .single()

  if (appErr || !app) return { success: false, error: 'Application not found' }

  const { data: appScore, error: scoreErr } = await supabase
    .from('scores')
    .select('etho_score, factors')
    .eq('application_id', applicationId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (scoreErr || !appScore) return { success: false, error: 'Score not found for this application' }

  // Build peer cohort: same employment_type + loan_amount within ±30%
  const loanMin = app.loan_amount * 0.7
  const loanMax = app.loan_amount * 1.3

  const { data: peers } = await supabase
    .from('applications')
    .select('id, loan_amount')
    .eq('organization_id', orgId)
    .eq('employment_type', app.employment_type)
    .gte('loan_amount', loanMin)
    .lte('loan_amount', loanMax)
    .neq('id', applicationId)
    .is('deleted_at', null)

  const peerIds = (peers ?? []).map(p => p.id)

  // Insufficient data fallback
  if (peerIds.length < MIN_COHORT_SIZE) {
    return {
      success: true,
      data: {
        percentile: 50,
        peer_cohort: { size: peerIds.length, avg_score: 0, median_score: 0 },
        comparisons: [],
        basis: 'insufficient_data',
      },
    }
  }

  // Fetch peer scores
  const { data: peerScores } = await supabase
    .from('scores')
    .select('application_id, etho_score, factors')
    .in('application_id', peerIds)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (!peerScores || peerScores.length < MIN_COHORT_SIZE) {
    return {
      success: true,
      data: {
        percentile: 50,
        peer_cohort: { size: peerScores?.length ?? 0, avg_score: 0, median_score: 0 },
        comparisons: [],
        basis: 'insufficient_data',
      },
    }
  }

  // Deduplicate: one score per application (most recent, already ordered desc)
  const seenApps = new Set<string>()
  const uniquePeerScores = peerScores.filter(s => {
    if (seenApps.has(s.application_id)) return false
    seenApps.add(s.application_id)
    return true
  })

  const peerEthoScores = uniquePeerScores.map(s => s.etho_score)
  const avgScore = Math.round((peerEthoScores.reduce((s, v) => s + v, 0) / peerEthoScores.length) * 10) / 10
  const medianScore = median(peerEthoScores)
  const appPercentile = percentileOf(appScore.etho_score, peerEthoScores)

  // Factor-level comparisons
  const appFactors = (appScore.factors ?? []) as Array<{ name: string; score: number }>
  const comparisons: FactorComparison[] = []

  for (const af of appFactors) {
    const peerFactorScores: number[] = []
    for (const ps of uniquePeerScores) {
      const factors = (ps.factors ?? []) as Array<{ name: string; score: number }>
      const match = factors.find(f => f.name === af.name)
      if (match) peerFactorScores.push(match.score)
    }

    if (peerFactorScores.length > 0) {
      const cohortAvg = Math.round((peerFactorScores.reduce((s, v) => s + v, 0) / peerFactorScores.length) * 10) / 10
      comparisons.push({
        factor: af.name,
        applicant: af.score,
        cohort_avg: cohortAvg,
        percentile: percentileOf(af.score, peerFactorScores),
      })
    }
  }

  return {
    success: true,
    data: {
      percentile: appPercentile,
      peer_cohort: {
        size: uniquePeerScores.length,
        avg_score: avgScore,
        median_score: medianScore,
      },
      comparisons,
      basis: 'sufficient_data',
    },
  }
}
