import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Anomaly {
  type: 'velocity_spike' | 'score_drift' | 'concentration_risk' | 'threshold_clustering' | 'sla_breach_rate'
  severity: 'high' | 'medium' | 'low'
  description: string
  detected_at: string
  metadata: Record<string, unknown>
}

// ─── Thresholds ─────────────────────────────────────────────────────────────
//
// Velocity spike:      2× prior 24h volume → medium, 3× → high
//   Rationale: 2× is a common anomaly detection baseline for volume spikes.
//   A 3× spike is almost always non-organic (bulk submission, API abuse, or data import).
//
// Score drift:         >10 point avg shift over 7 days → medium, >20 → high
//   Rationale: EthoScore range is 0–100. A 10-point weekly shift (10% of range)
//   signals a meaningful change in applicant quality or model behavior. 20+ is alarming.
//
// Concentration risk:  >70% of 30-day apps from one employment_type → medium, >85% → high
//   Rationale: A healthy portfolio has diversified exposure. 70%+ concentration in one
//   segment (e.g. all gig workers) creates correlated default risk. 85%+ is critical.
//   Minimum 5 applications required to avoid false positives on small samples.
//
// Threshold clustering: >30% of scores within ±2 of decision boundaries (50, 70) → medium, >50% → high
//   Rationale: Decision thresholds at 50 (review) and 70 (approve) are fixed in
//   decision-engine.ts. Scores clustering just above/below suggest applicants gaming
//   inputs or model calibration drift. ±2 band is tight enough to flag real clustering.
//   Minimum 10 scores required.
//
// SLA breach rate:     >20% of active cases breached → medium, >40% → high
//   Rationale: Industry standard SLA compliance target is >90% (i.e. <10% breach).
//   20% breach rate means the team is consistently missing deadlines. 40%+ suggests
//   structural understaffing or process failure. Minimum 3 active cases required.

// ─── Detection Functions ─────────────────────────────────────────────────────

async function detectVelocitySpike(
  orgId: string,
  supabase: NonNullable<ReturnType<typeof getSupabase>>
): Promise<Anomaly | null> {
  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 3600_000).toISOString()
  const prev24h = new Date(now.getTime() - 48 * 3600_000).toISOString()

  const { count: recent } = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('created_at', last24h)

  const { count: previous } = await supabase
    .from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('created_at', prev24h)
    .lt('created_at', last24h)

  const recentCount = recent ?? 0
  const previousCount = previous ?? 0

  if (previousCount > 0 && recentCount > previousCount * 2) {
    return {
      type: 'velocity_spike',
      severity: recentCount > previousCount * 3 ? 'high' : 'medium',
      description: `Application volume spiked ${Math.round((recentCount / previousCount) * 100)}% vs prior 24h (${recentCount} vs ${previousCount}).`,
      detected_at: now.toISOString(),
      metadata: { recent_count: recentCount, previous_count: previousCount },
    }
  }
  return null
}

async function detectScoreDrift(
  orgId: string,
  supabase: NonNullable<ReturnType<typeof getSupabase>>
): Promise<Anomaly | null> {
  const now = new Date()
  const last7d = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString()
  const prev7d = new Date(now.getTime() - 14 * 24 * 3600_000).toISOString()

  const { data: recentScores } = await supabase
    .from('scores')
    .select('etho_score')
    .eq('organization_id', orgId)
    .gte('created_at', last7d)

  const { data: previousScores } = await supabase
    .from('scores')
    .select('etho_score')
    .eq('organization_id', orgId)
    .gte('created_at', prev7d)
    .lt('created_at', last7d)

  if (!recentScores?.length || !previousScores?.length) return null

  const recentAvg = recentScores.reduce((s, r) => s + r.etho_score, 0) / recentScores.length
  const prevAvg = previousScores.reduce((s, r) => s + r.etho_score, 0) / previousScores.length
  const drift = recentAvg - prevAvg

  if (Math.abs(drift) > 10) {
    return {
      type: 'score_drift',
      severity: Math.abs(drift) > 20 ? 'high' : 'medium',
      description: `Average EthoScore ${drift < 0 ? 'dropped' : 'rose'} by ${Math.abs(drift).toFixed(1)} points (${prevAvg.toFixed(1)} → ${recentAvg.toFixed(1)}) over the past 7 days.`,
      detected_at: now.toISOString(),
      metadata: { recent_avg: recentAvg, previous_avg: prevAvg, drift },
    }
  }
  return null
}

async function detectConcentrationRisk(
  orgId: string,
  supabase: NonNullable<ReturnType<typeof getSupabase>>
): Promise<Anomaly | null> {
  const last30d = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()

  const { data: apps } = await supabase
    .from('applications')
    .select('employment_type, loan_purpose')
    .eq('organization_id', orgId)
    .gte('created_at', last30d)

  if (!apps || apps.length < 5) return null

  const typeCounts: Record<string, number> = {}
  for (const a of apps) {
    typeCounts[a.employment_type] = (typeCounts[a.employment_type] ?? 0) + 1
  }

  for (const [type, count] of Object.entries(typeCounts)) {
    const pct = count / apps.length
    if (pct > 0.7) {
      return {
        type: 'concentration_risk',
        severity: pct > 0.85 ? 'high' : 'medium',
        description: `${Math.round(pct * 100)}% of applications in the past 30 days are from "${type}" employment type (${count}/${apps.length}).`,
        detected_at: new Date().toISOString(),
        metadata: { employment_type: type, count, total: apps.length, percentage: pct },
      }
    }
  }
  return null
}

async function detectThresholdClustering(
  orgId: string,
  supabase: NonNullable<ReturnType<typeof getSupabase>>
): Promise<Anomaly | null> {
  const last30d = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()

  const { data: scores } = await supabase
    .from('scores')
    .select('etho_score')
    .eq('organization_id', orgId)
    .gte('created_at', last30d)

  if (!scores || scores.length < 10) return null

  // Check clustering around decision thresholds (50 and 70)
  const nearThreshold = scores.filter(
    s => (s.etho_score >= 48 && s.etho_score <= 52) || (s.etho_score >= 68 && s.etho_score <= 72)
  )

  const clusterPct = nearThreshold.length / scores.length
  if (clusterPct > 0.3) {
    return {
      type: 'threshold_clustering',
      severity: clusterPct > 0.5 ? 'high' : 'medium',
      description: `${Math.round(clusterPct * 100)}% of scores cluster within ±2 points of decision thresholds (${nearThreshold.length}/${scores.length}). Potential gaming or calibration issue.`,
      detected_at: new Date().toISOString(),
      metadata: { near_threshold: nearThreshold.length, total: scores.length, percentage: clusterPct },
    }
  }
  return null
}

async function detectSlaBreach(
  orgId: string,
  supabase: NonNullable<ReturnType<typeof getSupabase>>
): Promise<Anomaly | null> {
  const { data: cases } = await supabase
    .from('cases')
    .select('id, sla_deadline, sla_remaining_hours, sla_hours, status')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .neq('status', 'cleared')

  if (!cases || cases.length < 3) return null

  let breached = 0
  const now = Date.now()
  for (const c of cases) {
    if (c.sla_deadline) {
      if (new Date(c.sla_deadline).getTime() < now) breached++
    } else if (c.sla_remaining_hours <= 0) {
      breached++
    }
  }

  const breachRate = breached / cases.length
  if (breachRate > 0.2) {
    return {
      type: 'sla_breach_rate',
      severity: breachRate > 0.4 ? 'high' : 'medium',
      description: `${Math.round(breachRate * 100)}% of active cases have breached SLA (${breached}/${cases.length}).`,
      detected_at: new Date().toISOString(),
      metadata: { breached, total: cases.length, breach_rate: breachRate },
    }
  }
  return null
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export async function detectAnomalies(orgId: string): Promise<Anomaly[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const detectors = [
    detectVelocitySpike(orgId, supabase),
    detectScoreDrift(orgId, supabase),
    detectConcentrationRisk(orgId, supabase),
    detectThresholdClustering(orgId, supabase),
    detectSlaBreach(orgId, supabase),
  ]

  const results = await Promise.all(detectors)
  return results.filter((a): a is Anomaly => a !== null)
}
