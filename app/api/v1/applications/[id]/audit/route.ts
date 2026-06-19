import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePartnerAuth } from '../../../../../../lib/partner-auth'

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
  const auth = await requirePartnerAuth(req, 'audit_events:read')
  if ('error' in auth) return auth.error

  const { id } = await params
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }, { status: 503 })
  }

  // Verify the application belongs to this org
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id')
    .eq('id', id)
    .eq('organization_id', auth.context.orgId)
    .single()

  if (appErr || !app) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Application not found' } }, { status: 404 })
  }

  // Fetch workflow events for this application
  const { data: events, error: eventsErr } = await supabase
    .from('workflow_events')
    .select('id, event_type, from_state, to_state, actor_id, metadata, created_at')
    .eq('entity_type', 'application')
    .eq('entity_id', id)
    .eq('organization_id', auth.context.orgId)
    .order('created_at', { ascending: true })

  if (eventsErr) {
    return NextResponse.json({ error: { code: 'QUERY_FAILED', message: eventsErr.message } }, { status: 500 })
  }

  // Fetch AI audit records (EU AI Act compliance)
  const { data: auditRecords, error: auditErr } = await supabase
    .from('audit_events')
    .select('id, action, description, severity, created_at')
    .eq('organization_id', auth.context.orgId)

  return NextResponse.json({
    data: {
      application_id: id,
      workflow_events: events ?? [],
      audit_records: auditRecords ?? [],
    },
    meta: { api_version: 'v1', eu_ai_act_article_22: true },
  })
}
