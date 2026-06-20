import { ApplicationForm } from '@/types'
import { MerchantProfile } from './merchant-scoring'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PillarFactor {
  name: string
  score: number
  max: number
  rationale: string
}

export interface PillarResult {
  score: number
  max: number
  factors: PillarFactor[]
}

export interface EthoScoreV2Result {
  total: number
  normalized: number
  pillars: {
    trust: PillarResult
    track_record: PillarResult
    financial_health: PillarResult
    esg: PillarResult
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ─── Trust Pillar (0–300) ────────────────────────────────────────────────────

function scoreTrust(form: ApplicationForm): PillarResult {
  const factors: PillarFactor[] = []

  // Identity completeness (0–100): full name + email + consent
  const hasName = form.full_name.trim().length > 0
  const hasEmail = form.email.trim().length > 0
  const bothConsents = form.consent_data_use && form.consent_ai_decision
  const identityScore = clamp(
    (hasName ? 35 : 0) + (hasEmail ? 35 : 0) + (bothConsents ? 30 : 0),
    0, 100
  )
  factors.push({
    name: 'Identity Completeness',
    score: identityScore,
    max: 100,
    rationale: `${hasName && hasEmail ? 'Full identity provided' : 'Incomplete identity'}. ${bothConsents ? 'Both consents granted.' : 'Missing consent(s).'}`,
  })

  // Employment verification (0–100): type + employer name + tenure
  const hasEmployer = !!form.employer_name && form.employer_name.trim().length > 0
  const isEmployed = form.employment_type === 'employed' || form.employment_type === 'self_employed'
  const tenureMonths = form.months_at_current_job ?? 0
  const tenureScore = clamp(Math.round((tenureMonths / 60) * 100), 0, 100)
  const employmentScore = clamp(
    (isEmployed ? 30 : 10) + (hasEmployer ? 25 : 0) + Math.round(tenureScore * 0.45),
    0, 100
  )
  factors.push({
    name: 'Employment Verification',
    score: employmentScore,
    max: 100,
    rationale: `${form.employment_type}${hasEmployer ? ` at ${form.employer_name}` : ''}, ${tenureMonths} months tenure.`,
  })

  // Address stability proxy (0–100): rent payment months as proxy for stable address
  const rentMonths = form.rent_months_paid ?? 0
  const addressScore = clamp(Math.round((rentMonths / 36) * 100), 0, 100)
  factors.push({
    name: 'Address Stability',
    score: addressScore,
    max: 100,
    rationale: `${rentMonths} months of rent history as address stability proxy.`,
  })

  const pillarScore = clamp(
    Math.round((identityScore * 1.0 + employmentScore * 1.0 + addressScore * 1.0)),
    0, 300
  )

  return { score: pillarScore, max: 300, factors }
}

// ─── Track Record Pillar (0–300) ─────────────────────────────────────────────

function scoreTrackRecord(form: ApplicationForm, merchant?: MerchantProfile): PillarResult {
  const factors: PillarFactor[] = []

  // Rent payment consistency (0–100)
  const rentMonths = form.rent_months_paid ?? 0
  const rentScore = clamp(Math.round((rentMonths / 24) * 100), 0, 100)
  factors.push({
    name: 'Rent Payment Consistency',
    score: rentScore,
    max: 100,
    rationale: `${rentMonths} consecutive months of on-time rent at £${form.rent_monthly_amount}/mo.`,
  })

  // Gig platform tenure (0–100)
  const gigPlatforms = form.gig_platforms?.length ?? 0
  const gigIncome = form.gig_monthly_avg ?? 0
  const gigScore = clamp(
    Math.round((gigPlatforms / 4) * 50 + (gigIncome > 0 ? Math.min(gigIncome / 1000, 1) * 50 : 0)),
    0, 100
  )
  factors.push({
    name: 'Gig Platform Tenure',
    score: gigScore,
    max: 100,
    rationale: `${gigPlatforms} platform(s), £${gigIncome}/mo average gig income.`,
  })

  // Merchant payment history (0–100) — from MerchantProfile if available
  let merchantScore = 50
  let merchantRationale = 'No merchant profile available — using neutral baseline.'
  if (merchant) {
    merchantScore = clamp(Math.round(merchant.paymentHistory.onTimeRate * 100), 0, 100)
    merchantRationale = `${Math.round(merchant.paymentHistory.onTimeRate * 100)}% on-time rate, avg ${merchant.paymentHistory.avgDelayDays}-day delay.`
  }
  factors.push({
    name: 'Payment History',
    score: merchantScore,
    max: 100,
    rationale: merchantRationale,
  })

  const pillarScore = clamp(
    Math.round(rentScore * 1.0 + gigScore * 1.0 + merchantScore * 1.0),
    0, 300
  )

  return { score: pillarScore, max: 300, factors }
}

// ─── Financial Health Pillar (0–200) ─────────────────────────────────────────

function scoreFinancialHealth(form: ApplicationForm): PillarResult {
  const factors: PillarFactor[] = []

  // Loan-to-income ratio (0–100): lower is better
  const annualIncome = form.monthly_income * 12
  const ltiRatio = annualIncome > 0 ? form.loan_amount / annualIncome : 1
  const ltiScore = clamp(Math.round((1 - Math.min(ltiRatio, 1)) * 100), 0, 100)
  factors.push({
    name: 'Loan-to-Income Ratio',
    score: ltiScore,
    max: 100,
    rationale: `Loan is ${Math.round(ltiRatio * 100)}% of annual income. ${ltiRatio < 0.3 ? 'Healthy ratio.' : ltiRatio < 0.5 ? 'Moderate ratio.' : 'Elevated ratio.'}`,
  })

  // Savings buffer (0–100): months of loan repayment covered by savings
  const monthlyRepayment = form.loan_term_months > 0 ? form.loan_amount / form.loan_term_months : form.loan_amount
  const savingsMonths = monthlyRepayment > 0 ? form.savings_amount / monthlyRepayment : 0
  const savingsScore = clamp(Math.round((savingsMonths / 6) * 100), 0, 100)
  factors.push({
    name: 'Savings Buffer',
    score: savingsScore,
    max: 100,
    rationale: `£${form.savings_amount} savings covers ${savingsMonths.toFixed(1)} months of repayments.`,
  })

  const pillarScore = clamp(
    Math.round(ltiScore * 1.0 + savingsScore * 1.0),
    0, 200
  )

  return { score: pillarScore, max: 200, factors }
}

// ─── ESG Pillar (0–200) ─────────────────────────────────────────────────────

function scoreESG(form: ApplicationForm, merchant?: MerchantProfile): PillarResult {
  const factors: PillarFactor[] = []

  // ESG score from merchant profile (0–100)
  let esgDirectScore = 50
  let esgRationale = 'No ESG data available — using neutral baseline.'
  if (merchant?.esgScore != null) {
    esgDirectScore = clamp(merchant.esgScore, 0, 100)
    esgRationale = `Merchant ESG score: ${merchant.esgScore}/100.`
  }
  factors.push({
    name: 'ESG Rating',
    score: esgDirectScore,
    max: 100,
    rationale: esgRationale,
  })

  // Geographic corridor diversity (0–100)
  // More diverse trade corridors = lower concentration risk = higher ESG resilience
  let geoScore = 50
  let geoRationale = 'No trade corridor data available — using neutral baseline.'
  if (merchant && merchant.tradeCorridors.length > 0) {
    const corridorCount = new Set(merchant.tradeCorridors.map(c => c.region)).size
    geoScore = clamp(Math.round((corridorCount / 5) * 100), 0, 100)
    geoRationale = `${corridorCount} trade corridor(s): ${merchant.tradeCorridors.map(c => c.region).join(', ')}. Higher diversity reduces concentration risk.`
  }
  factors.push({
    name: 'Geographic Corridor Diversity',
    score: geoScore,
    max: 100,
    rationale: geoRationale,
  })

  const pillarScore = clamp(
    Math.round(esgDirectScore * 1.0 + geoScore * 1.0),
    0, 200
  )

  return { score: pillarScore, max: 200, factors }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

export function computeEthoScoreV2(
  form: ApplicationForm,
  merchant?: MerchantProfile
): EthoScoreV2Result {
  const trust = scoreTrust(form)
  const trackRecord = scoreTrackRecord(form, merchant)
  const financialHealth = scoreFinancialHealth(form)
  const esg = scoreESG(form, merchant)

  const total = trust.score + trackRecord.score + financialHealth.score + esg.score
  const normalized = clamp(Math.round(total / 10), 0, 100)

  return {
    total,
    normalized,
    pillars: { trust, track_record: trackRecord, financial_health: financialHealth, esg },
  }
}
