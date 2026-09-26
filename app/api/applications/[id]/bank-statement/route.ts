import { NextRequest, NextResponse } from 'next/server'
import { readStatementUpload } from '../../../../../lib/bank-statement-upload'
import { startBankVerification, toPartnerVerification } from '../../../../../lib/bank-verification'
import { verifyUploadToken } from '../../../../../lib/upload-token'

// Apply-flow counterpart of POST /api/v1/applications/{id}/bank-statement.
// Authorised by the upload token /api/score returned for this application
// (header X-Upload-Token) — not by a partner key or a session.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!verifyUploadToken(id, req.headers.get('x-upload-token'))) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Missing, invalid or expired upload token' } }, { status: 401 })
  }

  const upload = await readStatementUpload(req)
  if (upload.ok === false) {
    return NextResponse.json({ error: { code: upload.code, message: upload.message } }, { status: upload.status })
  }

  const started = await startBankVerification({
    applicationId: id,
    orgId: null, // resolved from the application; the token already binds the id
    channel: 'apply_flow',
    actorId: 'applicant',
    file: upload.file,
    fileName: upload.fileName,
  })
  if (started.ok === false) {
    return NextResponse.json({ error: { code: started.code, message: started.message } }, { status: started.status })
  }

  const verification = toPartnerVerification(started.verification)
  return NextResponse.json({ bank_verification: verification }, { status: verification?.status === 'processing' ? 202 : 200 })
}
