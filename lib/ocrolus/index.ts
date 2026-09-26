import { LiveOcrolusClient, OcrolusClient } from './client'
import { MockOcrolusClient } from './mock'

export * from './client'
export { MockOcrolusClient, mockScenarioFor } from './mock'
export { summarizeDetect } from './detect'
export type { DetectOutcome, DocumentAuthenticitySummary } from './detect'
export { selectBankMetrics } from './cash-flow'

/**
 * Returns null when bank verification is not configured — callers must
 * answer "unavailable", never pretend it succeeded.
 *   OCROLUS_MODE=mock → sandbox simulation (never set in production)
 *   OCROLUS_MODE=live → requires OCROLUS_CLIENT_ID / OCROLUS_CLIENT_SECRET
 */
export function getOcrolusClient(): OcrolusClient | null {
  const mode = process.env.OCROLUS_MODE
  if (mode === 'mock') return new MockOcrolusClient()
  if (mode === 'live') {
    const clientId = process.env.OCROLUS_CLIENT_ID
    const clientSecret = process.env.OCROLUS_CLIENT_SECRET
    if (!clientId || !clientSecret) return null
    return new LiveOcrolusClient({
      apiBase: process.env.OCROLUS_API_BASE || 'https://api.ocrolus.com',
      tokenUrl: process.env.OCROLUS_TOKEN_URL || 'https://auth.ocrolus.com/oauth/token',
      audience: process.env.OCROLUS_AUDIENCE || 'https://api.ocrolus.com/',
      clientId,
      clientSecret,
    })
  }
  return null
}
