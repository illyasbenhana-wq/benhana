import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '../../../../lib/api-guard'
import { simulateCounterfactual } from '../../../../lib/counterfactual-analysis'

// Counterfactual Analysis — minimal, internal, non-persisting endpoint.
// POST because the request carries a body (the controlled changes), not
// because anything is written: simulateCounterfactual() never touches the
// database. Tenant ownership of decision_record_id is verified inside
// simulateCounterfactual() via lib/decision-replay.ts, reused rather than
// duplicated.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ decisionRecordId: string }> }
) {
  const auth = await requirePermission(req, 'read', 'counterfactual_analysis')
  if ('error' in auth) return auth.error
  const { context } = auth

  const { decisionRecordId } = await params
  if (!UUID_RE.test(decisionRecordId)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'decisionRecordId must be a valid UUID' } }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 })
  }

  const outcome = await simulateCounterfactual(decisionRecordId, context.orgId, body.changes)

  if (outcome.success === false) {
    const status =
      outcome.error.code === 'NOT_FOUND' ? 404 :
      outcome.error.code === 'VALIDATION_ERROR' ? 400 :
      outcome.error.code === 'EVIDENCE_UNAVAILABLE' ? 409 :
      503
    return NextResponse.json({
      error: { code: outcome.error.code, message: outcome.error.message, details: outcome.error.validationErrors },
    }, { status })
  }

  return NextResponse.json({ data: outcome.result })
}
