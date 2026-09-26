import { NextRequest, NextResponse } from 'next/server'
import { requirePartnerAuth } from '../../../../../../lib/partner-auth'
import { readStatementUpload } from '../../../../../../lib/bank-statement-upload'
import { startBankVerification, toPartnerVerification } from '../../../../../../lib/bank-verification'
import { getLatestPartnerDecision, getLatestPartnerScore } from '../../../../../../lib/application-view'

// Upload a PDF bank statement for an already-scored application. The
// statement is verified asynchronously (typically 1–5 minutes); when
// verification completes the application is re-scored with the verified
// figures and GET /api/v1/applications/{id} returns the new score and
// ethosfi_decision. Partner-facing responses never name the provider.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePartnerAuth(req, 'applications:write')
  if ('error' in auth) return auth.error
  const { id } = await params

  const upload = await readStatementUpload(req)
  if (upload.ok === false) {
    return NextResponse.json({ error: { code: upload.code, message: upload.message } }, { status: upload.status })
  }

  const started = await startBankVerification({
    applicationId: id,
    orgId: auth.context.orgId,
    channel: 'partner_api',
    actorId: `api_key:${auth.context.keyId}`,
    file: upload.file,
    fileName: upload.fileName,
  })
  if (started.ok === false) {
    return NextResponse.json({ error: { code: started.code, message: started.message } }, { status: started.status })
  }

  const verification = toPartnerVerification(started.verification)
  const done = verification?.status === 'verified'
  return NextResponse.json({
    data: {
      application_id: id,
      bank_verification: verification,
      ...(done ? {
        score: await getLatestPartnerScore(id, auth.context.orgId),
        ethosfi_decision: await getLatestPartnerDecision(id, auth.context.orgId),
      } : {}),
    },
    meta: { api_version: 'v1' },
  }, { status: verification?.status === 'processing' ? 202 : 200 })
}
