import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '../../../lib/api-guard'
import { transition, registerHook } from '../../../lib/workflow-engine'

async function sendEscalationEmail({
  caseRef, entityName, riskScore, analystName,
}: {
  caseRef: string
  entityName: string
  riskScore: number | null
  analystName: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[case-action] RESEND_API_KEY not set — skipping email')
    return
  }

  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px">
        <div style="width:28px;height:28px;border-radius:6px;background:#1a56db;display:flex;align-items:center;justify-content:center">
          <span style="color:#fff;font-size:14px;font-weight:700">E</span>
        </div>
        <span style="font-size:17px;font-weight:700;color:#111">EthosFi AI</span>
      </div>
      <h2 style="font-size:18px;color:#111;margin:0 0 8px">Case Escalated to Senior Compliance</h2>
      <p style="font-size:14px;color:#555;margin:0 0 24px">The following case has been escalated and requires senior review.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #eee;width:40%">Case Reference</td><td style="padding:10px 0;font-weight:600;color:#111;border-bottom:1px solid #eee">${caseRef}</td></tr>
        <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #eee">Entity</td><td style="padding:10px 0;font-weight:600;color:#111;border-bottom:1px solid #eee">${entityName}</td></tr>
        <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #eee">Risk Score</td><td style="padding:10px 0;font-weight:600;color:${(riskScore ?? 0) >= 70 ? '#c0392b' : '#e67e22'};border-bottom:1px solid #eee">${riskScore ?? 'N/A'} / 100</td></tr>
        <tr><td style="padding:10px 0;color:#888">Assigned Analyst</td><td style="padding:10px 0;font-weight:600;color:#111">${analystName}</td></tr>
      </table>
      <div style="margin-top:24px;padding:12px 16px;background:#fff3cd;border-left:3px solid #e67e22;border-radius:4px;font-size:13px;color:#856404">
        Action required: Please review this case and respond within your SLA window.
      </div>
      <p style="margin-top:24px;font-size:12px;color:#aaa">EthosFi AI Compliance Platform · This is an automated notification.</p>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'EthosFi Compliance <onboarding@resend.dev>',
      to:   ['compliance@ethosfi.com'],
      subject: `[ESCALATED] ${caseRef} — ${entityName}`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend API error ${res.status}: ${err}`)
  }

  console.log('[case-action] escalation email sent for', caseRef)
}

// Hook: send escalation email when a case transitions to 'escalated'
registerHook('case', 'escalated', async (event) => {
  const meta = event.metadata as Record<string, any>
  await sendEscalationEmail({
    caseRef: meta.caseRef ?? '',
    entityName: meta.entityName ?? '',
    riskScore: meta.riskScore ?? null,
    analystName: meta.analystName ?? 'Unknown',
  })
})

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

  // Email hook fires automatically via workflow engine when toState === 'escalated'

  console.log('[case-action] all writes succeeded')
  return NextResponse.json({ ok: true, action: insertedAction, audit: insertedAudit, workflowEvent: txResult.event })
}
