import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'crypto'
import { log } from './logger'

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
        log.error('workflow hook failed', { entityType: event.entity_type, toState: event.to_state, error: err instanceof Error ? err.message : String(err) })
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

let hooksLoaded = false
async function ensureHooks() {
  if (hooksLoaded) return
  hooksLoaded = true
  await import('./notification-engine')
}

export async function transition(params: TransitionParams): Promise<TransitionResult> {
  await ensureHooks()

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
    log.error('entity status update failed', { table, entityId, orgId, error: updateErr.message })
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
    log.error('workflow_events insert failed', { entityType, entityId, orgId, error: eventErr?.message })
    return { success: false, error: `Failed to log workflow event: ${eventErr?.message}` }
  }

  // Step 3: Fire hooks (async, non-blocking — never fails the transition)
  fireHooks(event as WorkflowEvent)

  // Step 4: Deliver webhooks (async, non-blocking)
  deliverWebhooks(event as WorkflowEvent, supabase)

  return { success: true, event: event as WorkflowEvent }
}

// ─── Webhook Delivery ────────────────────────────────────────────────────────

function toWebhookEventName(entityType: EntityType, toState: string): string {
  return `${entityType}.${toState}`
}

function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

async function deliverToEndpoint(
  url: string,
  secret: string,
  payload: Record<string, unknown>
): Promise<void> {
  const body = JSON.stringify(payload)
  const signature = signPayload(secret, body)

  const attempt = async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EthosFi-Signature': `sha256=${signature}`,
        'User-Agent': 'EthosFi-Webhooks/1.0',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      throw new Error(`Webhook delivery failed: ${res.status} ${res.statusText}`)
    }
  }

  try {
    await attempt()
  } catch (firstErr) {
    // Single retry after 2 seconds
    log.warn('webhook first attempt failed', { url, error: firstErr instanceof Error ? firstErr.message : String(firstErr) })
    try {
      await new Promise(r => setTimeout(r, 2000))
      await attempt()
    } catch (retryErr) {
      log.error('webhook retry failed', { url, error: retryErr instanceof Error ? retryErr.message : String(retryErr) })
    }
  }
}

function deliverWebhooks(event: WorkflowEvent, supabase: ReturnType<typeof getSupabase>) {
  if (!supabase) return

  const eventName = toWebhookEventName(event.entity_type as EntityType, event.to_state)

  supabase
    .from('webhook_endpoints')
    .select('id, url, secret, events')
    .eq('organization_id', event.organization_id)
    .eq('active', true)
    .is('deleted_at', null)
    .then(({ data: endpoints, error }) => {
      if (error || !endpoints) {
        if (error) log.error('webhook endpoints query failed', { orgId: event.organization_id, error: error.message })
        return
      }

      const payload = {
        event: eventName,
        timestamp: event.created_at,
        data: {
          entity_type: event.entity_type,
          entity_id: event.entity_id,
          from_state: event.from_state,
          to_state: event.to_state,
          actor_id: event.actor_id,
          metadata: event.metadata,
        },
      }

      for (const ep of endpoints) {
        const subscribedEvents = ep.events as string[]
        if (subscribedEvents.includes(eventName)) {
          deliverToEndpoint(ep.url, ep.secret, payload).catch(err =>
            log.error('webhook delivery failed', { endpointId: ep.id, url: ep.url, orgId: event.organization_id, error: err instanceof Error ? err.message : String(err) })
          )
        }
      }
    })
}
