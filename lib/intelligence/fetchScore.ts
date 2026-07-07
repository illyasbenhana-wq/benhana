import { createClient } from '@supabase/supabase-js'

// Server-only. Uses the service role key directly and does NOT go through
// resolveApiContext()/getDefaultOrgId() (lib/api-guard.ts, lib/org-context.ts)
// — those resolve org from a consumer session or fall back to the public
// default org, which is correct for the applicant-facing /score/[id] page
// but wrong here: /intelligence/* is an internal institutional tool that
// needs to look up any application regardless of which org it belongs to.
//
// Scope: import this ONLY from /intelligence/* API routes. Do not import
// it from any consumer-facing or Partner API route — those must keep going
// through the existing org-scoped resolution.
//
// SECURITY NOTE (flagged, not resolved here): this file does not add any
// authentication/authorization of its own. As of this pass, nothing gates
// access to /intelligence/* — anyone with a URL and an application id can
// pull full applicant PII (name, email, income) plus the full AI
// assessment. That's fine for local/internal use today but must be gated
// (session + role check, partner-key equivalent, or an access token like
// the existing DEMO_ACCESS_TOKEN pattern in app/demo/page.tsx) before this
// is deployed anywhere reachable by non-staff.

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export interface IntelligenceApplication {
  id: string
  organization_id: string
  full_name: string
  email: string
  monthly_income: number
  employment_type: string
  loan_amount: number
  loan_purpose: string
  loan_term_months: number
  status: string
  created_at: string
}

export interface IntelligenceScore {
  id: string
  application_id: string
  organization_id: string
  etho_score: number
  risk_band: string
  ai_summary: string
  created_at: string
  score_pillars: unknown
  prompt_version: string | null
  model_requested: string | null
  model_responded: string | null
  confidence_overall: 'high' | 'medium' | 'low' | null
  raw_response: string | null
}

export interface IntelligenceScoreResult {
  application: IntelligenceApplication
  score: IntelligenceScore | null
}

// Looks up the application by id with no org filter, then scopes the score
// lookup to that application's own organization_id (not a session-derived
// one) — the application record is the source of truth for which org it
// belongs to, so there's no cross-org leak between application and score.
export async function fetchScoreForIntelligence(applicationId: string): Promise<IntelligenceScoreResult | null> {
  const supabase = getServiceSupabase()
  if (!supabase) return null

  const { data: application, error: appErr } = await supabase
    .from('applications')
    .select('id, organization_id, full_name, email, monthly_income, employment_type, loan_amount, loan_purpose, loan_term_months, status, created_at')
    .eq('id', applicationId)
    .single()

  if (appErr || !application) return null

  const { data: score } = await supabase
    .from('scores')
    .select('*')
    .eq('application_id', applicationId)
    .eq('organization_id', application.organization_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return { application: application as IntelligenceApplication, score: (score as IntelligenceScore) ?? null }
}
