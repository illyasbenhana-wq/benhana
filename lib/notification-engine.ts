import { createClient } from '@supabase/supabase-js'
import { registerHook } from './workflow-engine'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'case_escalated'
  | 'case_cleared'
  | 'case_assigned'
  | 'application_scored'
  | 'task_assigned'
  | 'comment_added'
  | 'sla_warning'
  | 'info_requested'

interface Recipient {
  userId: string
  email?: string
}

interface NotifyParams {
  orgId: string
  type: NotificationType
  title: string
  body: string
  entityType?: 'case' | 'application' | 'task'
  entityId?: string
  recipients: Recipient[]
}

interface ChannelPrefs {
  inApp: boolean
  email: boolean
}

// ─── Preferences ─────────────────────────────────────────────────────────────

async function getPrefs(
  userId: string,
  orgId: string,
  eventType: NotificationType,
  supabase: NonNullable<ReturnType<typeof getSupabase>>
): Promise<ChannelPrefs> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('channel_in_app, channel_email')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .eq('event_type', eventType)
    .single()

  if (!data) return { inApp: true, email: true }
  return { inApp: data.channel_in_app, email: data.channel_email }
}

// ─── Email Templates ─────────────────────────────────────────────────────────

function emailTemplate(type: NotificationType, title: string, body: string): { subject: string; html: string } {
  const subject = `[EthosFi] ${title}`
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px">
        <div style="width:28px;height:28px;border-radius:6px;background:#1a56db;display:flex;align-items:center;justify-content:center">
          <span style="color:#fff;font-size:14px;font-weight:700">E</span>
        </div>
        <span style="font-size:17px;font-weight:700;color:#111">EthosFi AI</span>
      </div>
      <h2 style="font-size:18px;color:#111;margin:0 0 8px">${title}</h2>
      <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.6">${body}</p>
      <div style="margin-top:24px;padding:12px 16px;background:#e8f4fd;border-left:3px solid #1a56db;border-radius:4px;font-size:13px;color:#1a56db">
        Log in to your EthosFi dashboard to take action.
      </div>
      <p style="margin-top:24px;font-size:12px;color:#aaa">EthosFi AI Compliance Platform · This is an automated notification.</p>
    </div>
  `
  return { subject, html }
}

async function sendEmail(to: string, type: NotificationType, title: string, body: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[notifications] RESEND_API_KEY not set — skipping email')
    return
  }

  const { subject, html } = emailTemplate(type, title, body)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'EthosFi Compliance <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend API error ${res.status}: ${err}`)
  }

  console.log('[notifications] email sent to', to, 'type:', type)
}

// ─── Core Dispatch ───────────────────────────────────────────────────────────

export async function notify(params: NotifyParams): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) {
    console.warn('[notifications] no Supabase client — skipping')
    return
  }

  for (const recipient of params.recipients) {
    const prefs = await getPrefs(recipient.userId, params.orgId, params.type, supabase)

    if (prefs.inApp) {
      const { error } = await supabase
        .from('notifications')
        .insert({
          organization_id: params.orgId,
          user_id: recipient.userId,
          type: params.type,
          title: params.title,
          body: params.body,
          entity_type: params.entityType ?? null,
          entity_id: params.entityId ?? null,
        })
      if (error) {
        console.error('[notifications] in-app insert failed:', error.message)
      }
    }

    if (prefs.email && recipient.email) {
      sendEmail(recipient.email, params.type, params.title, params.body).catch(err =>
        console.error('[notifications] email failed:', err)
      )
    }
  }
}

// ─── Read / Unread ───────────────────────────────────────────────────────────

export async function markAsRead(
  notificationId: string,
  userId: string,
  orgId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, error: 'Database not configured' }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', userId)
    .eq('organization_id', orgId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function markAllRead(
  userId: string,
  orgId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, error: 'Database not configured' }

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .is('read_at', null)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function getUnreadCount(
  userId: string,
  orgId: string
): Promise<number> {
  const supabase = getSupabase()
  if (!supabase) return 0

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .is('read_at', null)
    .is('deleted_at', null)

  if (error) return 0
  return count ?? 0
}

// ─── Recipient Resolution ────────────────────────────────────────────────────

async function getOrgUsersByRole(
  orgId: string,
  roles: string[],
  supabase: NonNullable<ReturnType<typeof getSupabase>>
): Promise<Recipient[]> {
  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .in('role', roles)
    .is('deleted_at', null)

  if (!members || members.length === 0) return []

  const recipients: Recipient[] = []
  for (const m of members) {
    const { data: user } = await supabase.auth.admin.getUserById(m.user_id)
    recipients.push({
      userId: m.user_id,
      email: user?.user?.email ?? undefined,
    })
  }
  return recipients
}

// ─── Workflow Hooks ──────────────────────────────────────────────────────────

registerHook('case', 'escalated', async (event) => {
  const supabase = getSupabase()
  if (!supabase) return

  const meta = event.metadata as Record<string, any>
  const caseRef = meta.caseRef ?? 'Unknown'
  const entityName = meta.entityName ?? 'Unknown'
  const riskScore = meta.riskScore ?? null

  const recipients = await getOrgUsersByRole(event.organization_id, ['admin', 'owner'], supabase)

  await notify({
    orgId: event.organization_id,
    type: 'case_escalated',
    title: `Case Escalated: ${caseRef}`,
    body: `${entityName} (risk score: ${riskScore ?? 'N/A'}) has been escalated to senior compliance. Immediate review required.`,
    entityType: 'case',
    entityId: event.entity_id,
    recipients,
  })
})

registerHook('case', 'cleared', async (event) => {
  const supabase = getSupabase()
  if (!supabase) return

  const meta = event.metadata as Record<string, any>
  const caseRef = meta.caseRef ?? 'Unknown'

  const { data: caseRow } = await supabase
    .from('cases')
    .select('assigned_user_id')
    .eq('id', event.entity_id)
    .single()

  if (!caseRow?.assigned_user_id) return

  const { data: user } = await supabase.auth.admin.getUserById(caseRow.assigned_user_id)

  await notify({
    orgId: event.organization_id,
    type: 'case_cleared',
    title: `Case Cleared: ${caseRef}`,
    body: `Case ${caseRef} has been cleared. No further action required.`,
    entityType: 'case',
    entityId: event.entity_id,
    recipients: [{ userId: caseRow.assigned_user_id, email: user?.user?.email ?? undefined }],
  })
})

registerHook('case', 'pending_info', async (event) => {
  const supabase = getSupabase()
  if (!supabase) return

  const meta = event.metadata as Record<string, any>
  const caseRef = meta.caseRef ?? 'Unknown'

  const { data: caseRow } = await supabase
    .from('cases')
    .select('assigned_user_id')
    .eq('id', event.entity_id)
    .single()

  if (!caseRow?.assigned_user_id) return

  const { data: user } = await supabase.auth.admin.getUserById(caseRow.assigned_user_id)

  await notify({
    orgId: event.organization_id,
    type: 'info_requested',
    title: `Information Requested: ${caseRef}`,
    body: `An information request has been sent for case ${caseRef}. Awaiting response.`,
    entityType: 'case',
    entityId: event.entity_id,
    recipients: [{ userId: caseRow.assigned_user_id, email: user?.user?.email ?? undefined }],
  })
})

registerHook('application', 'scored', async (event) => {
  const supabase = getSupabase()
  if (!supabase) return

  const meta = event.metadata as Record<string, any>
  const ethoScore = meta.ethoScore ?? 'N/A'
  const riskBand = meta.riskBand ?? 'unknown'

  const recipients = await getOrgUsersByRole(event.organization_id, ['admin', 'owner', 'analyst'], supabase)

  await notify({
    orgId: event.organization_id,
    type: 'application_scored',
    title: `Application Scored: EthoScore ${ethoScore}`,
    body: `A new application has been scored. EthoScore: ${ethoScore}, Risk band: ${riskBand}.`,
    entityType: 'application',
    entityId: event.entity_id,
    recipients,
  })
})
