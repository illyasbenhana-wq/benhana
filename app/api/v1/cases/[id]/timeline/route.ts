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
  const auth = await requirePartnerAuth(req, 'cases:read')
  if ('error' in auth) return auth.error

  const { id } = await params
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }, { status: 503 })
  }

  // Verify the case belongs to this org
  const { data: caseRow, error: caseErr } = await supabase
    .from('cases')
    .select('id, case_ref, entity_name, status, severity')
    .eq('id', id)
    .eq('organization_id', auth.context.orgId)
    .single()

  if (caseErr || !caseRow) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Case not found' } }, { status: 404 })
  }

  // Workflow events
  const { data: events, error: eventsErr } = await supabase
    .from('workflow_events')
    .select('id, event_type, from_state, to_state, actor_id, metadata, created_at')
    .eq('entity_type', 'case')
    .eq('entity_id', id)
    .eq('organization_id', auth.context.orgId)
    .order('created_at', { ascending: true })

  if (eventsErr) {
    return NextResponse.json({ error: { code: 'QUERY_FAILED', message: eventsErr.message } }, { status: 500 })
  }

  // Case actions (analyst-facing log)
  const { data: actions, error: actionsErr } = await supabase
    .from('case_actions')
    .select('id, action, acted_by, previous_status, new_status, notes, created_at')
    .eq('case_id', id)
    .eq('organization_id', auth.context.orgId)
    .order('created_at', { ascending: true })

  if (actionsErr) {
    return NextResponse.json({ error: { code: 'QUERY_FAILED', message: actionsErr.message } }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      case: caseRow,
      workflow_events: events ?? [],
      case_actions: actions ?? [],
    },
    meta: { api_version: 'v1' },
  })
}
