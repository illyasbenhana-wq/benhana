import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── Transition Maps ─────────────────────────────────────────────────────────

type EntityType = 'application' | 'case'

const APPLICATION_TRANSITIONS: Record<string, Set<string>> = {
  pending:   new Set(['scored', 'declined']),
  scored:    new Set(['approved', 'declined', 'more_info']),
  more_info: new Set(['scored', 'declined']),
  approved:  new Set(),
  declined:  new Set(),
}

const CASE_TRANSITIONS: Record<string, Set<string>> = {
  open:         new Set(['escalated', 'pending_info', 'cleared']),
  escalated:    new Set(['open', 'pending_info', 'cleared']),
  pending_info: new Set(['open', 'escalated', 'cleared']),
  cleared:      new Set(),
}

const TRANSITION_MAPS: Record<EntityType, Record<string, Set<string>>> = {
  application: APPLICATION_TRANSITIONS,
  case: CASE_TRANSITIONS,
}

const TABLE_NAMES: Record<EntityType, string> = {
  application: 'applications',
  case: 'cases',
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TransitionParams {
  entityType: EntityType
  entityId: string
  fromState: string
  toState: string
  actorId: string
  orgId: string
  metadata?: Record<string, unknown>
}

export interface WorkflowEvent {
  id: string
  organization_id: string
  entity_type: EntityType
  entity_id: string
  event_type: string
  from_state: string | null
  to_state: string
  actor_id: string
  metadata: Record<string, unknown>
  created_at: string
}

export type TransitionResult =
  | { success: true; event: WorkflowEvent }
  | { success: false; error: string }

// ─── Hooks ───────────────────────────────────────────────────────────────────

type WorkflowHook = (event: WorkflowEvent) => Promise<void>

const hooks: Array<{
  entityType: EntityType
  toState: string
  handler: WorkflowHook
}> = []

export function registerHook(entityType: EntityType, toState: string, handler: WorkflowHook) {
  hooks.push({ entityType, toState, handler })
}

function fireHooks(event: WorkflowEvent) {
  for (const hook of hooks) {
    if (hook.entityType === event.entity_type && hook.toState === event.to_state) {
      hook.handler(event).catch(err =>
        console.error(`[workflow] hook failed for ${event.entity_type}→${event.to_state}:`, err)
      )
    }
  }
}

// ─── Core ────────────────────────────────────────────────────────────────────

export function isValidTransition(entityType: EntityType, fromState: string, toState: string): boolean {
  const map = TRANSITION_MAPS[entityType]
  if (!map) return false
  const allowed = map[fromState]
  if (!allowed) return false
  return allowed.has(toState)
}

export async function transition(params: TransitionParams): Promise<TransitionResult> {
  const { entityType, entityId, fromState, toState, actorId, orgId, metadata } = params

  if (!isValidTransition(entityType, fromState, toState)) {
    return {
      success: false,
      error: `Invalid transition: ${entityType} cannot go from "${fromState}" to "${toState}"`,
    }
  }

  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database not configured' }
  }

  const table = TABLE_NAMES[entityType]

  // Step 1: Update entity status (scoped by org to prevent cross-tenant writes)
  const { error: updateErr } = await supabase
    .from(table)
    .update({ status: toState })
    .eq('id', entityId)
    .eq('organization_id', orgId)

  if (updateErr) {
    console.error(`[workflow] ${table} update failed:`, updateErr.message)
    return { success: false, error: `Failed to update ${entityType} status: ${updateErr.message}` }
  }

  // Step 2: Insert immutable workflow event
  const { data: event, error: eventErr } = await supabase
    .from('workflow_events')
    .insert({
      organization_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      event_type: 'status_change',
      from_state: fromState,
      to_state: toState,
      actor_id: actorId,
      metadata: metadata ?? {},
    })
    .select()
    .single()

  if (eventErr || !event) {
    console.error('[workflow] workflow_events insert failed:', eventErr?.message)
    return { success: false, error: `Failed to log workflow event: ${eventErr?.message}` }
  }

  // Step 3: Fire hooks (async, non-blocking — never fails the transition)
  fireHooks(event as WorkflowEvent)

  return { success: true, event: event as WorkflowEvent }
}
