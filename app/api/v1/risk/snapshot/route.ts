import { NextRequest, NextResponse } from 'next/server'
import { requirePartnerAuth } from '../../../../../lib/partner-auth'
import { generateRiskSnapshot, getLatestSnapshot } from '../../../../../lib/risk-dashboard'

export async function GET(req: NextRequest) {
  const auth = await requirePartnerAuth(req, 'applications:read')
  if ('error' in auth) return auth.error

  const snapshot = await getLatestSnapshot(auth.context.orgId)

  if (!snapshot) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No risk snapshot available. Generate one with POST.' } },
      { status: 404 }
    )
  }

  return NextResponse.json({
    data: snapshot,
    meta: { api_version: 'v1' },
  })
}

export async function POST(req: NextRequest) {
  const auth = await requirePartnerAuth(req, 'applications:write')
  if ('error' in auth) return auth.error

  const result = await generateRiskSnapshot(auth.context.orgId)

  if (result.success === false) {
    return NextResponse.json(
      { error: { code: 'GENERATION_FAILED', message: result.error } },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: result.snapshot,
    meta: { api_version: 'v1' },
  }, { status: 201 })
}
