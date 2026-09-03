import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '../../../lib/api-guard'
import { recordEvent } from '../../../lib/workflow-engine'
import { log } from '../../../lib/logger'

// Phase 2, Step 1's storage foundation (supabase/migrations/
// 20260828000000_add_outcomes_performance_historical_foundation.sql) for
// context: this route is Step 2 — the application-layer mechanism for
// recording real-world outcome events against a decision_record. An
// outcome is an observation ("what actually happened"), never a
// prediction, re-score, or model output, and this route never touches
// lib/scoring-engine.ts / lib/ethoscore-v2.ts / lib/decision-engine.ts.
//
// outcomes.decision_record_id is a deliberately unconstrained uuid (no
// FK — see the migration's own comments and the Phase 1 FK correction
// this mirrors). Referential integrity for it is enforced here, at the
// application layer, not by the database.

const OUTCOME_STATUSES = new Set([
  'current', 'delinquent_30', 'delinquent_60', 'delinquent_90',
  'default', 'write_off', 'repaid_full', 'repaid_early',
  'restructured', 'withdrawn',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false
  return !Number.isNaN(new Date(value).getTime())
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── POST /api/outcomes — create an outcome event (insert-only) ───────────
//
// A "correction" is just a normal creation with superseded_outcome_id set —
// there is no separate correction endpoint, and there is deliberately no
// PATCH/PUT/DELETE handler exported from this file: mutating or removing an
// outcome is not a capability this API exposes, on top of the database
// itself rejecting UPDATE/DELETE via trg_outcomes_immutable.
export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'write', 'outcomes')
  if ('error' in auth) return auth.error
  const { context } = auth

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }, { status: 503 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 })
  }

  const { decision_record_id, status, observed_at, superseded_outcome_id } = body as {
    decision_record_id?: unknown
    status?: unknown
    observed_at?: unknown
    superseded_outcome_id?: unknown
  }

  if (!isValidUuid(decision_record_id)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'decision_record_id must be a valid UUID' } }, { status: 400 })
  }
  if (typeof status !== 'string' || !OUTCOME_STATUSES.has(status)) {
    return NextResponse.json({
      error: { code: 'VALIDATION_ERROR', message: `status must be one of: ${Array.from(OUTCOME_STATUSES).join(', ')}` },
    }, { status: 400 })
  }
  if (!isValidTimestamp(observed_at)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'observed_at must be a valid timestamp' } }, { status: 400 })
  }
  if (superseded_outcome_id !== undefined && superseded_outcome_id !== null && !isValidUuid(superseded_outcome_id)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'superseded_outcome_id must be a valid UUID' } }, { status: 400 })
  }

  // decision_record_id carries no FK — confirm existence + tenant
  // ownership here, at the application layer, against decision_records
  // directly (never via the live applications/scores tables: the
  // authoritative parent for an outcome is the decision_record, not the
  // application it happened to originate from).
  const { data: decisionRecord, error: decisionRecordErr } = await supabase
    .from('decision_records')
    .select('id, organization_id')
    .eq('id', decision_record_id)
    .eq('organization_id', context.orgId)
    .maybeSingle()

  if (decisionRecordErr) {
    return NextResponse.json({ error: { code: 'QUERY_FAILED', message: decisionRecordErr.message } }, { status: 500 })
  }
  if (!decisionRecord) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'decision_record not found for this organization' } }, { status: 404 })
  }

  if (superseded_outcome_id) {
    const { data: priorOutcome, error: priorOutcomeErr } = await supabase
      .from('outcomes')
      .select('id, organization_id, decision_record_id')
      .eq('id', superseded_outcome_id)
      .eq('organization_id', context.orgId)
      .maybeSingle()

    if (priorOutcomeErr) {
      return NextResponse.json({ error: { code: 'QUERY_FAILED', message: priorOutcomeErr.message } }, { status: 500 })
    }
    if (!priorOutcome) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'superseded_outcome_id not found for this organization' } }, { status: 404 })
    }
    // Reject a correction chain that would silently jump to a different
    // decision_record than the one this new outcome is attached to.
    if (priorOutcome.decision_record_id !== decision_record_id) {
      return NextResponse.json({
        error: { code: 'VALIDATION_ERROR', message: 'superseded_outcome_id belongs to a different decision_record' },
      }, { status: 400 })
    }
  }

  const { data: outcome, error: insertErr } = await supabase
    .from('outcomes')
    .insert({
      organization_id: context.orgId,
      decision_record_id,
      status,
      observed_at,
      superseded_outcome_id: superseded_outcome_id ?? null,
    })
    .select('id, organization_id, decision_record_id, status, observed_at, superseded_outcome_id, created_at')
    .single()

  if (insertErr || !outcome) {
    return NextResponse.json({ error: { code: 'INSERT_FAILED', message: insertErr?.message ?? 'Failed to create outcome' } }, { status: 500 })
  }

  // Complementary, best-effort audit trail via the same append-only event
  // log used elsewhere (workflow_events) — this never replaces the
  // outcomes row itself, which is the durable record; recordEvent() never
  // throws, so a failure here can never lose the outcome already saved.
  const eventResult = await recordEvent({
    entityType: 'decision_record',
    entityId: decision_record_id,
    orgId: context.orgId,
    eventType: 'outcome_recorded',
    actorId: context.userId,
    payload: {
      outcomeId: outcome.id,
      status: outcome.status,
      observedAt: outcome.observed_at,
      supersededOutcomeId: outcome.superseded_outcome_id,
    },
  })
  if (eventResult.success === false) {
    log.warn('outcome_recorded workflow event failed (non-fatal, outcome already saved)', {
      route: 'outcomes', outcomeId: outcome.id, error: eventResult.error,
    })
  }

  return NextResponse.json({ data: outcome }, { status: 201 })
}

// ─── GET /api/outcomes?decision_record_id=... — read the outcome timeline ──
//
// Returns every outcome row for the given decision_record, ordered
// chronologically. Original and superseded rows are both returned — the
// history is never collapsed server-side. Callers that want a "current"
// value derive it client-side from the timeline (e.g. the row with no
// later row referencing it via superseded_outcome_id); this API does not
// fabricate or return such a derived value itself.
export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'read', 'outcomes')
  if ('error' in auth) return auth.error
  const { context } = auth

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }, { status: 503 })
  }

  const url = new URL(req.url)
  const decisionRecordId = url.searchParams.get('decision_record_id')

  if (!isValidUuid(decisionRecordId)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'decision_record_id query parameter must be a valid UUID' } }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('outcomes')
    .select('id, organization_id, decision_record_id, status, observed_at, superseded_outcome_id, created_at')
    .eq('organization_id', context.orgId)
    .eq('decision_record_id', decisionRecordId)
    .order('observed_at', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: { code: 'QUERY_FAILED', message: error.message } }, { status: 500 })
  }

  return NextResponse.json({
    data: data ?? [],
    meta: { decision_record_id: decisionRecordId, count: data?.length ?? 0 },
  })
}
