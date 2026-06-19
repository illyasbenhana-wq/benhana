import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePartnerAuth } from '../../../../../lib/partner-auth'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePartnerAuth(req, 'applications:read')
  if ('error' in auth) return auth.error

  const { id } = await params
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }, { status: 503 })
  }

  const { data: application, error: appErr } = await supabase
    .from('applications')
    .select('id, full_name, email, monthly_income, employment_type, loan_amount, loan_purpose, loan_term_months, status, created_at')
    .eq('id', id)
    .eq('organization_id', auth.context.orgId)
    .single()

  if (appErr || !application) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Application not found' } }, { status: 404 })
  }

  const { data: score } = await supabase
    .from('scores')
    .select('id, etho_score, risk_band, recommendation, ai_summary, factors, model_version, created_at')
    .eq('application_id', id)
    .eq('organization_id', auth.context.orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    data: { application, score: score ?? null },
    meta: { api_version: 'v1' },
  })
}
