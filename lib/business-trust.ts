import { BusinessProfile, ScoreFactor } from '@/types'

// ─── Business Trust Factor ───────────────────────────────────────────────────
//
// Lendflow's business-loan applicants are mapped onto EthosFi's
// person-shaped ApplicationForm today (see the Lendflow integration guide:
// "The API scores the applicant as a person ... Business applicants ...
// must be mapped onto these fields"). This module adds a real business
// signal on top of that, without changing the required personal fields —
// `form.business` is optional and additive (CLAUDE.md principle 5).
//
// clamp() mirrors lib/ethoscore-v2.ts's helper — kept local rather than
// imported so this module has no dependency on the deterministic v2 engine
// (it operates on ScoreFactor[], the LLM-path shape, not EthoScoreV2Result).
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

const DEFAULT_BUSINESS_TRUST_WEIGHT = 20

/**
 * Scores how much trust signal a business profile carries, 0-100.
 * Declarative only (Companies House / external verification is future
 * work — out of scope here, see the AskUserQuestion decision this was
 * built from: "données déclaratives simples").
 */
export function computeBusinessTrustFactor(business: BusinessProfile): ScoreFactor {
  const reasons: string[] = []

  // Registration completeness (0-40): a real registration number + a
  // stated jurisdiction is the strongest signal we can read declaratively.
  let registrationScore = 0
  if (business.registration_number && business.registration_number.trim().length > 0) {
    registrationScore += 25
    reasons.push(`registered (${business.registration_number})`)
  } else {
    reasons.push('no registration number provided')
  }
  if (business.jurisdiction && business.jurisdiction.trim().length > 0) {
    registrationScore += 15
    reasons.push(`jurisdiction: ${business.jurisdiction}`)
  }

  // Trading history (0-35): longer trading history = more trust, capped
  // at 5 years (60 months), same cap shape as scoreTrust's address/tenure
  // proxies in lib/ethoscore-v2.ts.
  const tradingMonths = business.trading_since_months ?? 0
  const tradingScore = clamp(Math.round((tradingMonths / 60) * 35), 0, 35)
  reasons.push(`${tradingMonths} month(s) trading`)

  // Declared revenue presence (0-25): having a non-zero declared revenue
  // is itself a signal of a real, reporting business — the specific
  // amount isn't compared against the loan here (that's already covered
  // by the Financial Health pillar / loan-to-income factor elsewhere).
  const revenue = business.annual_revenue ?? 0
  const revenueScore = revenue > 0 ? clamp(Math.round(Math.min(revenue / 50_000, 1) * 25), 0, 25) : 0
  if (revenue > 0) reasons.push(`£${revenue.toLocaleString()}/yr declared revenue`)
  else reasons.push('no revenue declared')

  const score = clamp(registrationScore + tradingScore + revenueScore, 0, 100)

  return {
    name: 'Business Trust',
    weight: DEFAULT_BUSINESS_TRUST_WEIGHT,
    score,
    rationale: `${business.legal_name}: ${reasons.join(', ')}.`,
  }
}

/**
 * Injects a Business Trust factor into an existing factor list, rescaling
 * the other factors' weights so the whole set still sums to exactly 100 —
 * `weight` is "0-100 importance" (types/index.ts) across the full factor
 * set, both in the Lendflow-facing response and as consumed by
 * lib/decision-engine.ts / lib/risk-factors.ts. A business factor added
 * without rescaling would silently overweight the total past 100.
 *
 * No-op (returns `factors` unchanged) when `business` is absent — every
 * existing person-only application keeps its exact current factors/weights.
 *
 * Weights are integers, so proportional rescaling rounds each one — naive
 * rounding can drift the total to 99 or 101. The remainder is corrected by
 * adjusting the single largest-weight retained factor (least likely to
 * flip a LOW_FACTOR_* reason code or visibly distort its own weight),
 * guaranteeing the returned set sums to exactly 100 in all cases.
 */
export function injectBusinessTrustFactor(
  factors: ScoreFactor[],
  business?: BusinessProfile,
  weight: number = DEFAULT_BUSINESS_TRUST_WEIGHT
): ScoreFactor[] {
  if (!business) return factors
  if (factors.length === 0) {
    return [{ ...computeBusinessTrustFactor(business), weight: 100 }]
  }

  const businessFactor = { ...computeBusinessTrustFactor(business), weight }
  const remainingBudget = 100 - weight
  const existingTotal = factors.reduce((sum, f) => sum + f.weight, 0)

  const rescaled: ScoreFactor[] = factors.map(f => ({
    ...f,
    weight: existingTotal > 0
      ? Math.round((f.weight / existingTotal) * remainingBudget)
      : Math.round(remainingBudget / factors.length),
  }))

  const rescaledTotal = rescaled.reduce((sum, f) => sum + f.weight, 0) + businessFactor.weight
  const drift = 100 - rescaledTotal // positive: under 100, needs adding; negative: over 100, needs removing

  if (drift !== 0) {
    const largestIndex = rescaled.reduce(
      (bestIdx, f, idx) => (f.weight > rescaled[bestIdx].weight ? idx : bestIdx),
      0
    )
    rescaled[largestIndex] = { ...rescaled[largestIndex], weight: rescaled[largestIndex].weight + drift }
  }

  return [...rescaled, businessFactor]
}
