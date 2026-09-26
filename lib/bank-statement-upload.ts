import { NextRequest } from 'next/server'

// Vercel serverless request bodies are capped at 4.5 MB; the file is
// forwarded straight to the provider inside the same request and never
// stored by EthosFi, so this is also the effective document limit.
export const MAX_BANK_STATEMENT_BYTES = 4 * 1024 * 1024

export type UploadParse =
  | { ok: true; file: Blob; fileName: string }
  | { ok: false; status: number; code: string; message: string }

export async function readStatementUpload(req: NextRequest): Promise<UploadParse> {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Send the bank statement as multipart/form-data with a "file" field' }
  }
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_BANK_STATEMENT_BYTES + 64 * 1024) {
    return { ok: false, status: 413, code: 'FILE_TOO_LARGE', message: 'Bank statement must be 4 MB or smaller' }
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Malformed multipart body' }
  }
  const file = form.get('file')
  if (!file || typeof file === 'string') {
    return { ok: false, status: 400, code: 'VALIDATION_ERROR', message: 'Missing "file" field' }
  }
  if (file.size === 0) return { ok: false, status: 400, code: 'INVALID_PDF', message: 'The uploaded file is empty' }
  if (file.size > MAX_BANK_STATEMENT_BYTES) {
    return { ok: false, status: 413, code: 'FILE_TOO_LARGE', message: 'Bank statement must be 4 MB or smaller' }
  }

  // Content, not the declared type: every PDF starts with "%PDF-".
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  if (String.fromCharCode(...head) !== '%PDF-') {
    return { ok: false, status: 400, code: 'INVALID_PDF', message: 'The file is not a PDF. Upload the bank statement as a PDF.' }
  }

  const raw = (file as File).name || 'bank-statement.pdf'
  const base = raw.split(/[\\/]/).pop()!.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'bank-statement.pdf'
  const fileName = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`
  return { ok: true, file, fileName }
}
