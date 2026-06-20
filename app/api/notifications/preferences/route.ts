import { NextRequest, NextResponse } from 'next/server'
import { resolveApiContext } from '../../../../lib/api-guard'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(req: NextRequest) {
  const context = await resolveApiContext(req)
  if (!context) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } },
      { status: 503 }
    )
  }

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('event_type, channel_in_app, channel_email')
    .eq('user_id', context.userId)
    .eq('organization_id', context.orgId)

  if (error) {
    return NextResponse.json(
      { error: { code: 'QUERY_FAILED', message: error.message } },
      { status: 500 }
    )
  }

  return NextResponse.json({ data: data ?? [] })
}

export async function PUT(req: NextRequest) {
  const context = await resolveApiContext(req)
  if (!context) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  let body: { event_type: string; channel_in_app: boolean; channel_email: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  const VALID_EVENTS = new Set([
    'case_escalated', 'case_cleared', 'case_assigned', 'application_scored',
    'task_assigned', 'comment_added', 'sla_warning', 'info_requested',
  ])

  if (!body.event_type || !VALID_EVENTS.has(body.event_type) || typeof body.channel_in_app !== 'boolean' || typeof body.channel_email !== 'boolean') {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Required: event_type (string), channel_in_app (boolean), channel_email (boolean)' } },
      { status: 400 }
    )
  }

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } },
      { status: 503 }
    )
  }

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: context.userId,
        organization_id: context.orgId,
        event_type: body.event_type,
        channel_in_app: body.channel_in_app,
        channel_email: body.channel_email,
      },
      { onConflict: 'user_id,organization_id,event_type' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      { error: { code: 'UPSERT_FAILED', message: error.message } },
      { status: 500 }
    )
  }

  return NextResponse.json({ data })
}
