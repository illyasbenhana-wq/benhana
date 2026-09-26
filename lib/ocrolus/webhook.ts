/**
 * Inbound Ocrolus webhook: authentication + event normalisation.
 *
 * Ocrolus has NOT yet confirmed how webhooks are authenticated (signature
 * scheme, header name), retry behaviour or ordering guarantees. Until
 * then, a request is accepted only if OCROLUS_WEBHOOK_SECRET is set AND
 * either:
 *   - an HMAC-SHA256 hex digest of the raw body, keyed with the secret,
 *     is present in one of CANDIDATE_SIGNATURE_HEADERS, or
 *   - the webhook URL registered with Ocrolus carries ?token=<secret>.
 * Unset secret = every request rejected (fail closed). Replace with the
 * provider's documented scheme once confirmed.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import type { ProviderEvent } from '../bank-verification'

const CANDIDATE_SIGNATURE_HEADERS = ['x-ocrolus-signature', 'webhook-signature', 'x-signature']

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function isAuthenticWebhook(rawBody: string, headers: Headers, url: URL, secret: string | undefined): boolean {
  if (!secret) return false
  const token = url.searchParams.get('token')
  if (token && safeEqual(token, secret)) return true
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  for (const h of CANDIDATE_SIGNATURE_HEADERS) {
    const v = headers.get(h)?.trim().replace(/^sha256=/i, '')
    if (v && safeEqual(v.toLowerCase(), expected)) return true
  }
  return false
}

// Event names appear in several spellings across Ocrolus's material
// ("book.verified", "Book Verified", status BOOK_COMPLETE) — normalise.
export function toProviderEvent(payload: any): { bookUuid: string; event: ProviderEvent } | null {
  const bookUuid = typeof payload?.book_uuid === 'string' ? payload.book_uuid : null
  if (!bookUuid) return null
  const name = String(payload?.event_name ?? payload?.event ?? '').toLowerCase().replace(/[._\-]+/g, ' ').trim()
  const status = String(payload?.status ?? '').toUpperCase()

  if (name === 'book verified' || status === 'BOOK_COMPLETE' || status === 'VERIFICATION_COMPLETE') {
    return { bookUuid, event: { kind: 'book_verified' } }
  }
  if (name === 'document rejected') {
    return { bookUuid, event: { kind: 'document_rejected', reason: typeof payload?.reason === 'string' ? payload.reason : undefined } }
  }
  if (name === 'detect signal found') return { bookUuid, event: { kind: 'detect_outcome', outcome: 'found' } }
  if (name === 'detect signal not found') return { bookUuid, event: { kind: 'detect_outcome', outcome: 'not_found' } }
  if (name === 'detect unable to process') return { bookUuid, event: { kind: 'detect_outcome', outcome: 'unable' } }
  return null // e.g. book.classified, document verified — informational only
}
