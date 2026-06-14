import { RiskBand, ScoreFactor } from '@/types'

export interface DecisionInput {
  ethoScore: number
  riskBand: RiskBand
  riskFactors: ScoreFactor[]
}

export interface DecisionOutput {
  approved: boolean
  confidence: number
  requiresHumanReview: boolean
  reasonCodes: string[]
}

export function makeDecision(input: DecisionInput): DecisionOutput {
  const { ethoScore, riskBand, riskFactors } = input
  const reasonCodes: string[] = []

  // Derive confidence from how far the score sits from the nearest threshold
  // Score 0-100 maps to confidence within each band
  let confidence: number
  let approved: boolean
  let requiresHumanReview: boolean

  if (ethoScore > 70) {
    approved = true
    requiresHumanReview = false
    confidence = parseFloat(((ethoScore - 70) / 30).toFixed(2))
    reasonCodes.push('SCORE_ABOVE_THRESHOLD')
  } else if (ethoScore >= 50) {
    approved = false
    requiresHumanReview = true
    // Confidence is low in the review band — equidistant from both thresholds at 60
    confidence = parseFloat((1 - Math.abs(ethoScore - 60) / 10).toFixed(2))
    reasonCodes.push('SCORE_IN_REVIEW_BAND')
  } else {
    approved = false
    requiresHumanReview = false
    confidence = parseFloat(((50 - ethoScore) / 50).toFixed(2))
    reasonCodes.push('SCORE_BELOW_THRESHOLD')
  }

  // Append factor-level reason codes for low-scoring factors
  for (const factor of riskFactors) {
    if (factor.score < 40) {
      reasonCodes.push(`LOW_FACTOR_${factor.name.toUpperCase().replace(/\s+/g, '_')}`)
    }
  }

  if (riskBand === 'high') {
    reasonCodes.push('HIGH_RISK_BAND')
  }

  return { approved, confidence, requiresHumanReview, reasonCodes }
}
