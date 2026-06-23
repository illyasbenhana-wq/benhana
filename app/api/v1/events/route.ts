import { NextRequest, NextResponse } from 'next/server'
import { requirePartnerAuth } from '../../../../lib/partner-auth'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(req: NextRequest) {
  const auth = await requirePartnerAuth(req, 'audit_events:read')
  if ('error' in auth) return auth.error

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }, { status: 503 })
  }

  const url = new URL(req.url)
  const entityType = url.searchParams.get('entity_type')
  const eventType = url.searchParams.get('event_type')
  const since = url.searchParams.get('since')
  const until = url.searchParams.get('until')
  const limitParam = parseInt(url.searchParams.get('limit') ?? '50', 10)
  const limit = Math.min(Math.max(limitParam, 1), 200)

  let query = supabase
    .from('workflow_events')
    .select('id, entity_type, entity_id, event_type, from_state, to_state, actor_id, metadata, created_at')
    .eq('organization_id', auth.context.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (entityType) query = query.eq('entity_type', entityType)
  if (eventType) query = query.eq('event_type', eventType)
  if (since) query = query.gte('created_at', since)
  if (until) query = query.lte('created_at', until)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: { code: 'QUERY_FAILED', message: error.message } }, { status: 500 })
  }

  return NextResponse.json({
    data: data ?? [],
    meta: { api_version: 'v1', count: data?.length ?? 0, limit },
  })
}
