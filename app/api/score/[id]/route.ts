import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveApiContext } from '../../../../lib/api-guard'
import { getDefaultOrgId } from '../../../../lib/org-context'

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
  const { id } = await params

  if (!id || id === 'demo') {
    return NextResponse.json({ error: 'Score not found' }, { status: 404 })
  }

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  // Resolve org: authenticated → their org, public → default
  const authContext = await resolveApiContext(req)
  const orgId = authContext?.orgId ?? getDefaultOrgId()

  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('id, full_name, email, monthly_income, employment_type, loan_amount, loan_purpose, loan_term_months, status, created_at')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()

  if (appError || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  const { data: score, error: scoreError } = await supabase
    .from('scores')
    .select('*')
    .eq('application_id', id)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (scoreError || !score) {
    return NextResponse.json({ error: 'Score not found' }, { status: 404 })
  }

  return NextResponse.json({ application, score })
}
