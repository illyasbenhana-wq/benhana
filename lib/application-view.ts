import { createClient } from '@supabase/supabase-js'
import { toPartnerModelVersion } from './partner-redaction'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// The current authoritative decision for an application: the most recent
// decision_records row (a bank-verified re-score supersedes the first,
// self-reported decision). Same shape as POST /api/v1/applications'
// ethosfi_decision. null when none exists or the lineage tables are absent.
export async function getLatestPartnerDecision(applicationId: string, orgId: string) {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('decision_records')
    .select('decision, decision_reason, confidence, requires_human_review, decided_at, decision_rules(version)')
    .eq('application_id', applicationId)
    .eq('organization_id', orgId)
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const rule = (data as any).decision_rules
  return {
    is_authoritative: true,
    decision_rule_version: (Array.isArray(rule) ? rule[0]?.version : rule?.version) ?? null,
    approved: data.decision === 'approved',
    confidence: Number(data.confidence),
    requires_human_review: data.requires_human_review,
    reason_codes: Array.isArray(data.decision_reason) ? data.decision_reason : [],
    decided_at: data.decided_at,
  }
}

export async function getLatestPartnerScore(applicationId: string, orgId: string) {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data: score } = await supabase
    .from('scores')
    .select('id, etho_score, risk_band, recommendation, ai_summary, factors, model_version, created_at')
    .eq('application_id', applicationId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return score ? { ...score, model_version: toPartnerModelVersion(score.model_version) } : null
}
