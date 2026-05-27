/**
 * Merchant/SME Trust Scoring Engine
 * Scores cross-border traders and underserved SMEs using alternative data signals.
 * Complements the credit scoring engine for holistic risk assessment.
 */

export type TradeCorridor = {
  region: string
  volume: number // USD annualized volume
}

export type PaymentHistory = {
  onTimeRate: number // 0..1
  avgDelayDays: number
}

export type MerchantProfile = {
  id?: string
  name: string
  country: string
  industry?: string
  annualRevenue?: number
  tradeCorridors: TradeCorridor[]
  paymentHistory: PaymentHistory
  esgScore?: number // 0..100
}

export type MerchantScoreResult = {
  score: number // 0..100
  breakdown: {
    paymentConsistency: number
    tradeCorridors: number
    esg: number
  }
  recommendation: 'approve' | 'review' | 'decline'
}

function clamp(v: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, v))
}

/**
 * Score a merchant/SME profile for alternative credit eligibility.
 * Uses weighted combination of: payment consistency (50%), trade corridors (30%), ESG (20%).
 */
export function scoreMerchant(profile: MerchantProfile): MerchantScoreResult {
  // Payment consistency: on-time rate as a percentage (0–100)
  const paymentConsistency = clamp(profile.paymentHistory.onTimeRate * 100)

  // Trade corridors: consider both volume and geographic diversity
  const totalVolume = profile.tradeCorridors.reduce((sum, c) => sum + (c.volume || 0), 0)
  const diversityCount = new Set(profile.tradeCorridors.map((c) => c.region)).size

  // Normalize volume against a notional baseline (500k USD → strong)
  const volumeScore = clamp((totalVolume / 500000) * 100)

  // Diversity bonus: up to +20 points (1 region → 0, 5+ regions → 20)
  const diversityBonus = clamp(((diversityCount - 1) / 4) * 20, 0, 20)

  const tradeCorridorsScore = clamp(volumeScore + diversityBonus)

  // ESG score (default 50 if not provided)
  const esg = clamp(profile.esgScore ?? 50)

  // Weighted scoring: payment 50%, trade 30%, esg 20%
  const score = Math.round(clamp(paymentConsistency * 0.5 + tradeCorridorsScore * 0.3 + esg * 0.2))

  // Recommendation thresholds
  let recommendation: MerchantScoreResult['recommendation'] = 'review'
  if (score >= 75) recommendation = 'approve'
  else if (score < 50) recommendation = 'decline'

  return {
    score,
    breakdown: {
      paymentConsistency: Math.round(paymentConsistency),
      tradeCorridors: Math.round(tradeCorridorsScore),
      esg: Math.round(esg),
    },
    recommendation,
  }
}

export default scoreMerchant
