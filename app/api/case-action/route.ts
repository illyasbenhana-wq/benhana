import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '../../../lib/api-guard'
import { transition } from '../../../lib/workflow-engine'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  console.log('[case-action] NEXT_PUBLIC_SUPABASE_URL present:', !!url)
  console.log('[case-action] SUPABASE_SERVICE_KEY present:', !!key)
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  console.log('[case-action] POST received')

  // RBAC: require write permission on cases
  const auth = await requirePermission(req, 'write', 'cases')
  if ('error' in auth) return auth.error

  const supabase = getSupabase()
  if (!supabase) {
    console.error('[case-action] No Supabase client — env vars missing')
    return NextResponse.json({ error: 'Supabase not configured — check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY' }, { status: 503 })
  }

  let body: any
  try {
    body = await req.json()
  } catch (e) {
    console.error('[case-action] Failed to parse request body:', e)
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { caseId, caseRef, entityName, riskScore, analystName, act, previousStatus, newStatus, severity } = body
  console.log('[case-action] payload:', { caseId, caseRef, act, previousStatus, newStatus, severity })

  if (!caseId || !act || !newStatus) {
    console.error('[case-action] Missing fields:', { caseId, act, newStatus })
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

  // 1. Workflow transition (validates, updates status, logs event, fires hooks)
  console.log('[case-action] step 1: workflow transition', { caseId, from: previousStatus, to: newStatus })
  const txResult = await transition({
    entityType: 'case',
    entityId: caseId,
    fromState: previousStatus,
    toState: newStatus,
    actorId: auth.context.userId,
    orgId: auth.context.orgId,
    metadata: { act, caseRef, entityName, riskScore, analystName, severity },
  })

  if (txResult.success === false) {
    console.error('[case-action] workflow transition failed:', txResult.error)
    return NextResponse.json({ error: { code: 'INVALID_TRANSITION', message: txResult.error } }, { status: 400 })
  }
  console.log('[case-action] workflow transition succeeded, event:', txResult.event.id)

  // 2. Insert case_action record (analyst-facing action log — separate from workflow events)
  console.log('[case-action] step 2: inserting into case_actions')
  const { data: insertedAction, error: actionErr } = await supabase
    .from('case_actions')
    .insert({
      organization_id: auth.context.orgId,
      case_id: caseId,
      action: act,
      acted_by: auth.context.userId,
      previous_status: previousStatus,
      new_status: newStatus,
    })
    .select()

  if (actionErr) {
    console.error('[case-action] case_actions insert failed:', JSON.stringify(actionErr))
    return NextResponse.json({ error: actionErr.message, detail: actionErr }, { status: 500 })
  }
  console.log('[case-action] case_actions inserted:', JSON.stringify(insertedAction))

  // 3. Insert audit event
  console.log('[case-action] step 3: inserting into audit_events')
  const { data: insertedAudit, error: auditErr } = await supabase
    .from('audit_events')
    .insert({
      organization_id: auth.context.orgId,
      case_id: caseId,
      case_ref: caseRef ?? '',
      analyst: auth.context.userId,
      action: actionLabel,
      description,
      severity: act === 'escalate' ? (severity ?? null) : null,
    })
    .select()

  if (auditErr) {
    console.error('[case-action] audit_events insert failed:', JSON.stringify(auditErr))
    return NextResponse.json({ error: auditErr.message, detail: auditErr }, { status: 500 })
  }
  console.log('[case-action] audit_events inserted:', JSON.stringify(insertedAudit))

  // Notifications (in-app + email) fire automatically via notification-engine hooks

  console.log('[case-action] all writes succeeded')
  return NextResponse.json({ ok: true, action: insertedAction, audit: insertedAudit, workflowEvent: txResult.event })
}
