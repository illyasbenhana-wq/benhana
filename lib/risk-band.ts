import { RiskBand } from '@/types'

/**
 * computeRiskBand — the canonical implementation, moved here (out of
 * lib/scoring-engine.ts) so it can be imported from client components
 * without pulling in the Anthropic SDK. lib/scoring-engine.ts's
 * `new Anthropic()` module-scope instantiation throws in any browser
 * environment (Core.isRunningInBrowser() check, unless
 * `dangerouslyAllowBrowser` is set) — importing anything from that file
 * client-side crashes on load. This file has zero dependencies, so it's
 * safe to import from either server or client code.
 *
 * lib/scoring-engine.ts re-exports this for existing callers — the
 * thresholds below are the single source of truth cited elsewhere
 * (e.g. lib/design-system/tokens-light.ts's ethoScoreColor()).
 */
export function computeRiskBand(ethoScore: number): RiskBand {
  if (ethoScore >= 70) return 'low'
  if (ethoScore >= 40) return 'medium'
  return 'high'
}
