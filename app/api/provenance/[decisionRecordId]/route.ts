import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '../../../../lib/api-guard'
import { getProvenanceForDecision } from '../../../../lib/provenance'

// Data Provenance — minimal, internal, read-only endpoint. Mirrors
// app/api/decision-replay/[id]/route.ts's shape and safety pattern
// exactly: validate the id, verify decision_record ownership against the
// authenticated organization BEFORE returning anything, never accept
// organization_id from the client.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ decisionRecordId: string }> }
) {
  const auth = await requirePermission(req, 'read', 'provenance')
  if ('error' in auth) return auth.error
  const { context } = auth

  const { decisionRecordId } = await params
  if (!UUID_RE.test(decisionRecordId)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'decisionRecordId must be a valid UUID' } }, { status: 400 })
  }

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }, { status: 503 })
  }

  // decision_record_id on provenance_records carries no FK (see the
  // migration's design note) — ownership is verified here, against
  // decision_records directly, before any provenance row is returned.
  const { data: decisionRecord, error: decisionRecordErr } = await supabase
    .from('decision_records')
    .select('id')
    .eq('id', decisionRecordId)
    .eq('organization_id', context.orgId)
    .maybeSingle()

  if (decisionRecordErr) {
    return NextResponse.json({ error: { code: 'QUERY_FAILED', message: decisionRecordErr.message } }, { status: 500 })
  }
  if (!decisionRecord) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'decision_record not found for this organization' } }, { status: 404 })
  }

  const result = await getProvenanceForDecision(decisionRecordId, context.orgId)
  if (!result.success) {
    return NextResponse.json({ error: { code: 'QUERY_FAILED', message: result.error ?? 'Provenance query failed' } }, { status: 500 })
  }

  return NextResponse.json({
    data: result.records,
    meta: { decision_record_id: decisionRecordId, count: result.records.length },
  })
}
