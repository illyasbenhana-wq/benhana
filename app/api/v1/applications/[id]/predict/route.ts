import { NextRequest, NextResponse } from 'next/server'
import { requirePartnerAuth } from '../../../../../../lib/partner-auth'
import { predictOutcome } from '../../../../../../lib/predictive'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePartnerAuth(req, 'applications:read')
  if ('error' in auth) return auth.error

  const { id } = await params
  const result = await predictOutcome(id, auth.context.orgId)

  if (result.success === false) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: result.error } },
      { status: 404 }
    )
  }

  return NextResponse.json({
    data: result.data,
    meta: { api_version: 'v1' },
  })
}
