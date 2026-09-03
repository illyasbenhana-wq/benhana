import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '../../../../lib/api-guard'
import { replayDecision } from '../../../../lib/decision-replay'
import { recordEvent } from '../../../../lib/workflow-engine'
import { log } from '../../../../lib/logger'

// Phase 2, Step 5 — minimal, internal, read-only replay endpoint.
// Mutates nothing. Never calls scoring. See lib/decision-replay.ts for the
// actual reconstruction logic and its point-in-time guarantees.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(req, 'read', 'decision_replay')
  if ('error' in auth) return auth.error
  const { context } = auth

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'id must be a valid UUID' } }, { status: 400 })
  }

  const outcome = await replayDecision(id, context.orgId)
  // NOTE: `=== false`, not `!outcome.success` — this codebase's tsconfig
  // has strict/strictNullChecks off, under which discriminated-union
  // narrowing via negation/truthiness on a literal boolean discriminant is
  // unreliable (confirmed by direct repro against this exact tsconfig);
  // equality narrowing (`=== false` / `=== true`) is the pattern already
  // used everywhere else in this codebase for the same TransitionResult-
  // shaped unions (see e.g. app/api/case-action/route.ts's txResult.success
  // === false) and is the one that actually narrows correctly here.
  if (outcome.success === false) {
    const status = outcome.error.code === 'NOT_FOUND' ? 404 : outcome.error.code === 'SERVICE_UNAVAILABLE' ? 503 : 500
    return NextResponse.json({ error: outcome.error }, { status })
  }

  // Complementary, best-effort audit trail (same established pattern as
  // Step 2's outcome_recorded event) — describes that a replay was
  // performed, never mutates the original decision_record. Never blocks
  // the response: recordEvent() never throws.
  const eventResult = await recordEvent({
    entityType: 'decision_record',
    entityId: id,
    orgId: context.orgId,
    eventType: 'decision_replayed',
    actorId: context.userId,
    payload: { decisionRecordId: id },
  })
  if (eventResult.success === false) {
    log.warn('decision_replayed workflow event failed (non-fatal, replay already returned)', {
      route: 'decision-replay', decisionRecordId: id, error: eventResult.error,
    })
  }

  return NextResponse.json({ data: outcome.result })
}
