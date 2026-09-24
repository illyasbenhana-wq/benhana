import { NextRequest, NextResponse } from 'next/server'
import { requirePartnerAuth } from '../../../../../../lib/partner-auth'
import { summarizeCase } from '../../../../../../lib/ai-review'
import { toPartnerModelVersion } from '../../../../../../lib/partner-redaction'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePartnerAuth(req, 'cases:write')
  if ('error' in auth) return auth.error

  const { id } = await params
  const result = await summarizeCase(id, auth.context.orgId)

  if (result.success === false) {
    return NextResponse.json(
      { error: { code: 'REVIEW_FAILED', message: result.error } },
      { status: result.error.includes('not found') ? 404 : 500 }
    )
  }

  return NextResponse.json({
    data: { ...result.review, model_version: toPartnerModelVersion(result.review.model_version) },
    meta: { api_version: 'v1' },
  })
}
