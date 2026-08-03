import { NextRequest, NextResponse } from 'next/server'
import { fetchScoreForIntelligence } from '../../../../../lib/intelligence/fetchScore'

// Internal-only route backing /intelligence/score/[id]. fetchScoreForIntelligence
// deliberately looks up applications across ALL orgs (see the comment in
// lib/intelligence/fetchScore.ts), so the existing session/org-role guard
// (lib/api-guard.ts, requirePermission) is the wrong fit here — it would only
// prove the caller belongs to *some* org, not that they're EthosFi staff, and
// would let a customer's own analyst pull other orgs' applicant PII through
// this route. Gated instead with the same static-token pattern already used
// for the other internal-only tools (DEMO_ACCESS_TOKEN in app/api/demo-data,
// BACKTEST_ACCESS_TOKEN in app/api/backtest/*) — but fail-closed: if the token
// env var isn't set, every request is rejected rather than allowed through
// (the demo/backtest routes fail OPEN when their token is unset, which is not
// safe for a route that returns full applicant PII).
//
// Token travels via the X-Intelligence-Token header, not a query param —
// query strings end up in server access logs, browser history, and Referer
// headers, which is not acceptable for a PII-grade credential.
//
// No rate-limiting on the token check (unlike lib/rate-limiter.ts elsewhere
// in this codebase). Accepted risk for v1: this is a single static internal
// token, not a per-caller credential, so rate-limiting would only slow down
// brute-forcing rather than isolate a compromised caller. Revisit if this
// route moves to per-user tokens.
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.INTELLIGENCE_ACCESS_TOKEN
  if (!expected) return false
  const token = req.headers.get('x-intelligence-token')
  return token === expected
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing intelligence access token' } },
      { status: 401 }
    )
  }

  const { id } = await params

  const result = await fetchScoreForIntelligence(id)
  if (!result) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }
  if (!result.score) {
    return NextResponse.json({ error: 'Score not found' }, { status: 404 })
  }

  return NextResponse.json({ application: result.application, score: result.score })
}
