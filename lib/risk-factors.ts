import { ScoreFactor, ScoreResult, RiskBand } from '@/types'

export type RiskFactorCode =
  | 'low_income'
  | 'unstable_employment'
  | 'strong_references'
  | 'high_savings'
  | 'poor_payment_history'
  | 'cross_border_risk'
  | 'pep_relationship'
  | 'sanctions_match'
  | 'low_loan_to_income'
  | 'high_loan_to_income'
  | 'short_employment_history'
  | 'strong_rent_history'
  | 'gig_income_present'
  | 'no_savings_buffer'
  | 'high_risk_band'
  | 'medium_risk_band'

export interface RiskSignal {
  code: RiskFactorCode
  score: number       // 0–100; higher = more risk
  weight: number      // 0–100; importance to overall decision
  rationale: string
}

// Subset of ScoreResult fields needed for transformation
export interface ScoringOutput {
  etho_score: number
  risk_band: RiskBand
  factors: ScoreFactor[]
  recommendation: string
  ai_summary: string
}

// Keyword maps: factor name fragments → risk signal code
const POSITIVE_SIGNALS: Array<{ keywords: string[]; code: RiskFactorCode }> = [
  { keywords: ['rent', 'payment history', 'payment track'], code: 'strong_rent_history' },
  { keywords: ['savings', 'buffer', 'reserve'],             code: 'high_savings' },
  { keywords: ['reference', 'employer ref'],                code: 'strong_references' },
  { keywords: ['gig', 'freelance', 'platform'],             code: 'gig_income_present' },
]

const NEGATIVE_SIGNALS: Array<{ keywords: string[]; code: RiskFactorCode }> = [
  { keywords: ['income', 'salary', 'earnings'],             code: 'low_income' },
  { keywords: ['employment', 'stability', 'job tenure'],    code: 'unstable_employment' },
  { keywords: ['payment', 'default', 'missed'],             code: 'poor_payment_history' },
  { keywords: ['border', 'international', 'foreign'],       code: 'cross_border_risk' },
  { keywords: ['pep', 'politically exposed'],               code: 'pep_relationship' },
  { keywords: ['sanction', 'ofac', 'sdn'],                  code: 'sanctions_match' },
  { keywords: ['loan', 'debt', 'ratio', 'repayment'],       code: 'high_loan_to_income' },
  { keywords: ['tenure', 'months', 'history', 'time in'],   code: 'short_employment_history' },
]

function matchKeywords(factorName: string, keywords: string[]): boolean {
  const lower = factorName.toLowerCase()
  return keywords.some(k => lower.includes(k))
}

function factorToSignal(factor: ScoreFactor): RiskSignal | null {
  const isLowScore = factor.score < 50

  if (isLowScore) {
    for (const { keywords, code } of NEGATIVE_SIGNALS) {
      if (matchKeywords(factor.name, keywords)) {
        return {
          code,
          score: 100 - factor.score,   // invert: low factor score = high risk score
          weight: factor.weight,
          rationale: factor.rationale,
        }
      }
    }
  } else {
    for (const { keywords, code } of POSITIVE_SIGNALS) {
      if (matchKeywords(factor.name, keywords)) {
        return {
          code,
          score: 100 - factor.score,   // invert: high factor score = low risk score
          weight: factor.weight,
          rationale: factor.rationale,
        }
      }
    }
  }

  return null
}

function riskBandSignal(riskBand: RiskBand): RiskSignal | null {
  if (riskBand === 'high') {
    return {
      code: 'high_risk_band',
      score: 85,
      weight: 100,
      rationale: 'Overall risk band classified as high by scoring model.',
    }
  }
  if (riskBand === 'medium') {
    return {
      code: 'medium_risk_band',
      score: 45,
      weight: 60,
      rationale: 'Overall risk band classified as medium by scoring model.',
    }
  }
  return null
}

export function extractRiskSignals(output: ScoringOutput): RiskSignal[] {
  const signals: RiskSignal[] = []
  const seenCodes = new Set<RiskFactorCode>()

  for (const factor of output.factors) {
    const signal = factorToSignal(factor)
    if (signal && !seenCodes.has(signal.code)) {
      signals.push(signal)
      seenCodes.add(signal.code)
    }
  }

  const bandSignal = riskBandSignal(output.risk_band)
  if (bandSignal && !seenCodes.has(bandSignal.code)) {
    signals.push(bandSignal)
  }

  // Sort descending by weighted risk (weight × score)
  return signals.sort((a, b) => b.weight * b.score - a.weight * a.score)
}
