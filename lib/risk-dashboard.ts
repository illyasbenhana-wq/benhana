import { createClient } from '@supabase/supabase-js'
import { detectAnomalies, Anomaly } from './anomaly-detector'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RiskSnapshot {
  id: string
  organization_id: string
  snapshot_at: string
  total_exposure: number
  avg_etho_score: number | null
  risk_distribution: { low: number; medium: number; high: number }
  top_risks: Array<{ entity_name: string; risk_score: number; case_ref: string }>
  anomalies: Anomaly[]
}

// ─── Snapshot Generation ─────────────────────────────────────────────────────

export async function generateRiskSnapshot(
  orgId: string
): Promise<{ success: true; snapshot: RiskSnapshot } | { success: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, error: 'Database not configured' }

  // Total exposure from active cases
  const { data: cases } = await supabase
    .from('cases')
    .select('entity_name, risk_score, case_ref, exposure_amount')
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .neq('status', 'cleared')

  const totalExposure = (cases ?? []).reduce((sum, c) => sum + (c.exposure_amount ?? 0), 0)

  // Top risks: highest risk_score cases
  const topRisks = (cases ?? [])
    .filter(c => c.risk_score != null)
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
    .slice(0, 5)
    .map(c => ({
      entity_name: c.entity_name,
      risk_score: c.risk_score ?? 0,
      case_ref: c.case_ref,
    }))

  // Average EthoScore + risk distribution from scores
  const { data: scores } = await supabase
    .from('scores')
    .select('etho_score, risk_band')
    .eq('organization_id', orgId)

  let avgEthoScore: number | null = null
  const distribution = { low: 0, medium: 0, high: 0 }

  if (scores && scores.length > 0) {
    avgEthoScore = scores.reduce((sum, s) => sum + s.etho_score, 0) / scores.length
    avgEthoScore = Math.round(avgEthoScore * 10) / 10
    for (const s of scores) {
      if (s.risk_band === 'low') distribution.low++
      else if (s.risk_band === 'medium') distribution.medium++
      else if (s.risk_band === 'high') distribution.high++
    }
  }

  // Anomalies
  const anomalies = await detectAnomalies(orgId)

  // Persist snapshot
  const { data: row, error } = await supabase
    .from('risk_snapshots')
    .insert({
      organization_id: orgId,
      snapshot_at: new Date().toISOString(),
      total_exposure: totalExposure,
      avg_etho_score: avgEthoScore,
      risk_distribution: distribution,
      top_risks: topRisks,
      anomalies,
    })
    .select()
    .single()

  if (error || !row) {
    return { success: false, error: error?.message ?? 'Failed to save snapshot' }
  }

  return {
    success: true,
    snapshot: {
      id: row.id,
      organization_id: row.organization_id,
      snapshot_at: row.snapshot_at,
      total_exposure: row.total_exposure,
      avg_etho_score: row.avg_etho_score,
      risk_distribution: row.risk_distribution as RiskSnapshot['risk_distribution'],
      top_risks: row.top_risks as RiskSnapshot['top_risks'],
      anomalies: row.anomalies as Anomaly[],
    },
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getLatestSnapshot(
  orgId: string
): Promise<RiskSnapshot | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('risk_snapshots')
    .select('*')
    .eq('organization_id', orgId)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return {
    id: data.id,
    organization_id: data.organization_id,
    snapshot_at: data.snapshot_at,
    total_exposure: data.total_exposure,
    avg_etho_score: data.avg_etho_score,
    risk_distribution: data.risk_distribution as RiskSnapshot['risk_distribution'],
    top_risks: data.top_risks as RiskSnapshot['top_risks'],
    anomalies: data.anomalies as Anomaly[],
  }
}

export async function getSnapshotHistory(
  orgId: string,
  days: number = 30
): Promise<RiskSnapshot[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString()

  const { data, error } = await supabase
    .from('risk_snapshots')
    .select('*')
    .eq('organization_id', orgId)
    .gte('snapshot_at', since)
    .order('snapshot_at', { ascending: true })

  if (error || !data) return []

  return data.map(row => ({
    id: row.id,
    organization_id: row.organization_id,
    snapshot_at: row.snapshot_at,
    total_exposure: row.total_exposure,
    avg_etho_score: row.avg_etho_score,
    risk_distribution: row.risk_distribution as RiskSnapshot['risk_distribution'],
    top_risks: row.top_risks as RiskSnapshot['top_risks'],
    anomalies: row.anomalies as Anomaly[],
  }))
}
