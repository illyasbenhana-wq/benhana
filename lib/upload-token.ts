import { createHmac, timingSafeEqual } from 'crypto'

// Short-lived capability for the public apply flow: /api/score (which
// accepts unauthenticated applicants) hands the applicant a token bound
// to their own application id, so only they can attach a bank statement
// to it. No secret configured = no token issued, upload unavailable.
const TTL_SECONDS = 60 * 60

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function issueUploadToken(applicationId: string, secret = process.env.BANK_UPLOAD_TOKEN_SECRET, now = Date.now()): string | null {
  if (!secret) return null
  const exp = Math.floor(now / 1000) + TTL_SECONDS
  const payload = `${applicationId}.${exp}`
  return `${exp}.${sign(payload, secret)}`
}

export function verifyUploadToken(applicationId: string, token: string | null, secret = process.env.BANK_UPLOAD_TOKEN_SECRET, now = Date.now()): boolean {
  if (!secret || !token) return false
  const [expStr, sig] = token.split('.')
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || !sig || exp < Math.floor(now / 1000)) return false
  const expected = sign(`${applicationId}.${exp}`, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
