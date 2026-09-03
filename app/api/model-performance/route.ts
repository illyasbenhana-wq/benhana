import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '../../../lib/api-guard'
import { getObservatorySummary } from '../../../lib/model-performance-observatory'
import { WINDOW_DAYS, type WindowDays } from '../../../lib/performance-windows'

// Model Performance Observatory — single, minimal, read-only endpoint
// (per the instruction to avoid redundant endpoints): one response
// carries the model-version, score-band, and time-series views together,
// rather than three separate routes. Model-version comparison is a
// client-side concern over the by_model_version array — no separate
// compare endpoint.

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'read', 'model_performance')
  if ('error' in auth) return auth.error
  const { context } = auth

  const url = new URL(req.url)
  const windowParam = url.searchParams.get('window_days')
  const windowDays = windowParam ? Number(windowParam) : 90
  if (!WINDOW_DAYS.includes(windowDays as WindowDays)) {
    return NextResponse.json({
      error: { code: 'VALIDATION_ERROR', message: `window_days must be one of: ${WINDOW_DAYS.join(', ')}` },
    }, { status: 400 })
  }

  const outcome = await getObservatorySummary(context.orgId, windowDays as WindowDays)
  if (outcome.success === false) {
    return NextResponse.json({ error: { code: 'QUERY_FAILED', message: outcome.error } }, { status: 500 })
  }

  return NextResponse.json({ data: outcome.summary })
}
