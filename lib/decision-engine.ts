import { RiskBand, ScoreFactor } from '@/types'

// Stable identifier for the exact threshold rule makeDecision() below
// implements. Persisted per-decision (decision_records.decision_rule_id,
// resolved against the decision_rules table by this string — see
// supabase/migrations/20260903000002_atomic_decision_package.sql) so a
// historical decision can be explained without depending on today's
// source code matching what actually ran at decision time. If these
// thresholds ever change, this constant MUST change too, and a new
// decision_rules row must be added (never edit the existing one — see
// that migration's own "insert-only, never renamed" convention, the
// same principle already applied to decision_records itself).
export const DECISION_RULE_VERSION = 'threshold-70-50-v1'

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
