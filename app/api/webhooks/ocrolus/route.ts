import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticWebhook, toProviderEvent } from '../../../../lib/ocrolus/webhook'
import { handleProviderEvent } from '../../../../lib/bank-verification'
import { log } from '../../../../lib/logger'

// Inbound trust boundary: Ocrolus → EthosFi. Not partner-facing and not
// behind partner API keys — authenticated only by lib/ocrolus/webhook.ts.
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  if (!isAuthenticWebhook(rawBody, req.headers, new URL(req.url), process.env.OCROLUS_WEBHOOK_SECRET)) {
    log.warn('ocrolus webhook rejected: authentication failed', {})
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const mapped = toProviderEvent(payload)
  if (!mapped) return NextResponse.json({ received: true, handled: false })

  // A verified book + Detect outcome triggers the re-score inside this
  // request. Unknown books and repeat deliveries are acknowledged (200) so
  // the provider doesn't keep retrying them.
  const result = await handleProviderEvent(mapped.bookUuid, mapped.event)
  if (result === 'unknown_book') log.warn('ocrolus webhook for unknown book', { bookUuid: mapped.bookUuid })
  return NextResponse.json({ received: true, handled: result === 'applied' })
}
