import { NextRequest, NextResponse } from 'next/server'
import { requirePartnerAuth } from '../../../../../../lib/partner-auth'
import { addComment } from '../../../../../../lib/case-manager'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePartnerAuth(req, 'cases:write')
  if ('error' in auth) return auth.error

  const { id } = await params

  let body: { body: string; internal?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } },
      { status: 400 }
    )
  }

  if (!body.body || typeof body.body !== 'string' || body.body.trim().length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Comment body is required' } },
      { status: 400 }
    )
  }

  const result = await addComment(
    id,
    `api_key:${auth.context.keyId}`,
    body.body.trim(),
    auth.context.orgId,
    body.internal ?? true
  )

  if (result.success === false) {
    return NextResponse.json(
      { error: { code: 'INSERT_FAILED', message: result.error } },
      { status: 500 }
    )
  }

  return NextResponse.json({
    data: result.comment,
    meta: { api_version: 'v1' },
  }, { status: 201 })
}
