import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── SLA Derivation (single source of truth) ────────────────────────────────

function deriveSlaRemaining(row: { sla_deadline: string | null; sla_remaining_hours: number }): number {
  if (row.sla_deadline) {
    const hoursLeft = (new Date(row.sla_deadline).getTime() - Date.now()) / 3_600_000
    return Math.max(0, hoursLeft)
  }
  return row.sla_remaining_hours
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CaseComment {
  id: string
  case_id: string
  author_id: string
  body: string
  internal: boolean
  created_at: string
}

export interface CaseTask {
  id: string
  case_id: string
  title: string
  description: string | null
  assigned_to: string
  assigned_user_id: string | null
  status: 'open' | 'in_progress' | 'done'
  due_at: string | null
  created_at: string
}

export interface CaseContext {
  case: Record<string, unknown> & { sla_remaining_hours_live: number }
  signals: Record<string, unknown>[]
  comments: CaseComment[]
  tasks: CaseTask[]
  workflow_events: Record<string, unknown>[]
  application: Record<string, unknown> | null
}

// ─── Link Case ↔ Application ────────────────────────────────────────────────

export async function linkCaseToApplication(
  caseId: string,
  applicationId: string,
  orgId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, error: 'Database not configured' }

  const { error } = await supabase
    .from('cases')
    .update({ application_id: applicationId })
    .eq('id', caseId)
    .eq('organization_id', orgId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ─── Assign Case ─────────────────────────────────────────────────────────────

export async function assignCase(
  caseId: string,
  userId: string,
  displayName: string,
  orgId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, error: 'Database not configured' }

  const { error } = await supabase
    .from('cases')
    .update({ assigned_user_id: userId, assigned_to: displayName })
    .eq('id', caseId)
    .eq('organization_id', orgId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function addComment(
  caseId: string,
  authorId: string,
  body: string,
  orgId: string,
  internal: boolean = true
): Promise<{ success: true; comment: CaseComment } | { success: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, error: 'Database not configured' }

  const { data, error } = await supabase
    .from('case_comments')
    .insert({
      organization_id: orgId,
      case_id: caseId,
      author_id: authorId,
      body,
      internal,
    })
    .select()
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }
  return { success: true, comment: data as CaseComment }
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function addTask(
  caseId: string,
  task: { title: string; description?: string; assignedTo: string; assignedUserId?: string; dueAt?: string },
  orgId: string
): Promise<{ success: true; task: CaseTask } | { success: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, error: 'Database not configured' }

  const { data, error } = await supabase
    .from('case_tasks')
    .insert({
      organization_id: orgId,
      case_id: caseId,
      title: task.title,
      description: task.description ?? null,
      assigned_to: task.assignedTo,
      assigned_user_id: task.assignedUserId ?? null,
      due_at: task.dueAt ?? null,
    })
    .select()
    .single()

  if (error || !data) return { success: false, error: error?.message ?? 'Insert failed' }
  return { success: true, task: data as CaseTask }
}

export async function updateTask(
  taskId: string,
  updates: { status?: string; assignedTo?: string; assignedUserId?: string },
  orgId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, error: 'Database not configured' }

  const patch: Record<string, unknown> = {}
  if (updates.status) patch.status = updates.status
  if (updates.assignedTo) patch.assigned_to = updates.assignedTo
  if (updates.assignedUserId !== undefined) patch.assigned_user_id = updates.assignedUserId

  if (Object.keys(patch).length === 0) return { success: false, error: 'No fields to update' }

  const { error } = await supabase
    .from('case_tasks')
    .update(patch)
    .eq('id', taskId)
    .eq('organization_id', orgId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ─── Full Case Context ───────────────────────────────────────────────────────

export async function getCaseContext(
  caseId: string,
  orgId: string
): Promise<{ success: true; data: CaseContext } | { success: false; error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { success: false, error: 'Database not configured' }

  // Case + signals
  const { data: caseRow, error: caseErr } = await supabase
    .from('cases')
    .select('*, signals(*)')
    .eq('id', caseId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .single()

  if (caseErr || !caseRow) return { success: false, error: 'Case not found' }

  const signals = (caseRow.signals ?? []) as Record<string, unknown>[]
  const slaRemainingLive = deriveSlaRemaining(caseRow as { sla_deadline: string | null; sla_remaining_hours: number })

  // Linked application (if any)
  let application: Record<string, unknown> | null = null
  if (caseRow.application_id) {
    const { data: app } = await supabase
      .from('applications')
      .select('id, full_name, email, loan_amount, loan_purpose, status, created_at')
      .eq('id', caseRow.application_id)
      .eq('organization_id', orgId)
      .single()
    application = app ?? null
  }

  // Comments
  const { data: comments } = await supabase
    .from('case_comments')
    .select('id, case_id, author_id, body, internal, created_at')
    .eq('case_id', caseId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  // Tasks
  const { data: tasks } = await supabase
    .from('case_tasks')
    .select('id, case_id, title, description, assigned_to, assigned_user_id, status, due_at, created_at')
    .eq('case_id', caseId)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  // Workflow events
  const { data: events } = await supabase
    .from('workflow_events')
    .select('id, event_type, from_state, to_state, actor_id, metadata, created_at')
    .eq('entity_type', 'case')
    .eq('entity_id', caseId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  const { signals: _s, ...caseFields } = caseRow

  return {
    success: true,
    data: {
      case: { ...caseFields, sla_remaining_hours_live: slaRemainingLive },
      signals,
      comments: (comments ?? []) as CaseComment[],
      tasks: (tasks ?? []) as CaseTask[],
      workflow_events: (events ?? []) as Record<string, unknown>[],
      application,
    },
  }
}
