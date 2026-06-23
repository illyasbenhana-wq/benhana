import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '../../../lib/api-guard'
import { transition } from '../../../lib/workflow-engine'
import { log } from '../../../lib/logger'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  const route = 'case-action'

  const auth = await requirePermission(req, 'write', 'cases')
  if ('error' in auth) return auth.error
  const orgId = auth.context.orgId

  const supabase = getSupabase()
  if (!supabase) {
    log.error('supabase not configured', { route })
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    log.warn('invalid request body', { route, orgId })
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { caseId, caseRef, entityName, riskScore, analystName, act, previousStatus, newStatus, severity } = body

  if (!caseId || !act || !newStatus) {
    log.warn('missing required fields', { route, orgId, caseId, act, newStatus })
    return NextResponse.json({ error: 'Missing required fields: caseId, act, newStatus' }, { status: 400 })
  }

  const actionLabel =
    act === 'escalate' ? 'Escalated to Senior Compliance' :
    act === 'clear'    ? 'Case cleared' :
                         'Information request sent'

  const description =
    act === 'escalate' ? `Case ${caseRef} escalated to Senior Compliance. Previous status: ${previousStatus}.` :
    act === 'clear'    ? `Case ${caseRef} cleared. No further action required.` :
                         `Information request sent for case ${caseRef}.`

  const txResult = await transition({
    entityType: 'case',
    entityId: caseId,
    fromState: previousStatus,
    toState: newStatus,
    actorId: auth.context.userId,
    orgId,
    metadata: { act, caseRef, entityName, riskScore, analystName, severity },
  })

  if (txResult.success === false) {
    log.warn('workflow transition failed', { route, orgId, caseId, from: previousStatus, to: newStatus, error: txResult.error })
    return NextResponse.json({ error: { code: 'INVALID_TRANSITION', message: txResult.error } }, { status: 400 })
  }

  const { data: insertedAction, error: actionErr } = await supabase
    .from('case_actions')
    .insert({
      organization_id: orgId,
      case_id: caseId,
      action: act,
      acted_by: auth.context.userId,
      previous_status: previousStatus,
      new_status: newStatus,
    })
    .select()

  if (actionErr) {
    log.error('case_actions insert failed', { route, orgId, caseId, error: actionErr.message })
    return NextResponse.json({ error: actionErr.message }, { status: 500 })
  }

  const { data: insertedAudit, error: auditErr } = await supabase
    .from('audit_events')
    .insert({
      organization_id: orgId,
      case_id: caseId,
      case_ref: caseRef ?? '',
      analyst: auth.context.userId,
      action: actionLabel,
      description,
      severity: act === 'escalate' ? (severity ?? null) : null,
    })
    .select()

  if (auditErr) {
    log.error('audit_events insert failed', { route, orgId, caseId, error: auditErr.message })
    return NextResponse.json({ error: auditErr.message }, { status: 500 })
  }

  log.info('case action completed', { route, orgId, caseId, act, newStatus, eventId: txResult.event.id })
  return NextResponse.json({ ok: true, action: insertedAction, audit: insertedAudit, workflowEvent: txResult.event })
}
