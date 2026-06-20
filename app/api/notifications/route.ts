import { NextRequest, NextResponse } from 'next/server'
import { resolveApiContext } from '../../../lib/api-guard'
import { markAsRead, markAllRead, getUnreadCount } from '../../../lib/notification-engine'
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

  const url = new URL(req.url)
  const unreadOnly = url.searchParams.get('unread') === 'true'

  let query = supabase
    .from('notifications')
    .select('id, type, title, body, entity_type, entity_id, read_at, created_at')
    .eq('user_id', context.userId)
    .eq('organization_id', context.orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (unreadOnly) {
    query = query.is('read_at', null)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json(
      { error: { code: 'QUERY_FAILED', message: error.message } },
      { status: 500 }
    )
  }

  const unreadCount = await getUnreadCount(context.userId, context.orgId)

  return NextResponse.json({
    data: data ?? [],
    meta: { unread_count: unreadCount },
  })
}

export async function PATCH(req: NextRequest) {
  const context = await resolveApiContext(req)
  if (!context) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  let body: { id?: string; all?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  if (body.all === true) {
    const result = await markAllRead(context.userId, context.orgId)
    if (result.success === false) {
      return NextResponse.json(
        { error: { code: 'UPDATE_FAILED', message: result.error } },
        { status: 500 }
      )
    }
    return NextResponse.json({ data: { marked: 'all' } })
  }

  if (body.id) {
    const result = await markAsRead(body.id, context.userId, context.orgId)
    if (result.success === false) {
      return NextResponse.json(
        { error: { code: 'UPDATE_FAILED', message: result.error } },
        { status: 500 }
      )
    }
    return NextResponse.json({ data: { marked: body.id } })
  }

  return NextResponse.json(
    { error: { code: 'VALIDATION_ERROR', message: 'Provide { id: "uuid" } or { all: true }' } },
    { status: 400 }
  )
}
