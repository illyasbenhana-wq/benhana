import Anthropic from '@anthropic-ai/sdk'
import { ApplicationForm, ScoreResult, RiskBand, Recommendation } from '@/types'

export function computeRiskBand(ethoScore: number): RiskBand {
  if (ethoScore >= 70) return 'low'
  if (ethoScore >= 40) return 'medium'
  return 'high'
}

const client = new Anthropic()

const SCORING_SYSTEM_PROMPT = `You are EthosFi-AI, an ethical alternative credit scoring engine.

Your purpose is to fairly assess borrowers who lack traditional credit history — gig workers, immigrants, young adults, self-employed individuals — using alternative financial signals.

You must:
1. Generate an EthoScore (0–100) based on the applicant data
2. Assign a risk band: low (70–100), medium (40–69), high (0–39)
3. Identify exactly 5 scoring factors with weights and individual scores
4. Write a plain-English summary a lender can read in 10 seconds
5. Make a recommendation: approve / review / decline

Scoring philosophy:
- Consistent rent payments are strong signals (weight heavily)
- Income stability matters more than income source
- Gig income trends (growing/stable/declining) matter
- Savings buffer reduces default risk significantly
- Loan-to-income ratio is critical
- Favour the borrower when signals are ambiguous — traditional credit models already penalise these applicants

EU AI Act compliance: Your explanation must be clear enough that the borrower can understand and challenge the decision.

Return ONLY valid JSON. No preamble, no markdown fences. Schema:
{
  "etho_score": number,
  "risk_band": "low" | "medium" | "high",
  "recommendation": "approve" | "review" | "decline",
  "ai_summary": "2-3 sentence plain English summary for lender",
  "factors": [
    {
      "name": "Factor name",
      "weight": number (0-100),
      "score": number (0-100),
      "rationale": "One sentence explaining this score"
    }
  ]
}`

export async function scoreApplication(form: ApplicationForm): Promise<{
  result: Omit<ScoreResult, 'id' | 'application_id' | 'created_at'>
  rawPrompt: string
  rawResponse: string
}> {
  const loanToIncomeRatio = (form.loan_amount / (form.monthly_income * 12) * 100).toFixed(1)
  
  const userPrompt = `Score this loan application:

APPLICANT
- Name: ${form.full_name}
- Employment: ${form.employment_type}${form.employer_name ? ` at ${form.employer_name}` : ''}
- Time in role: ${form.months_at_current_job ?? 'unknown'} months
- Monthly income: £${form.monthly_income.toLocaleString()}

ALTERNATIVE CREDIT SIGNALS
- Rent paid on time: ${form.rent_months_paid} consecutive months (£${form.rent_monthly_amount}/mo)
- Gig platforms: ${form.gig_platforms.length > 0 ? form.gig_platforms.join(', ') : 'none'}
- Average gig income: £${form.gig_monthly_avg}/month
- Current savings: £${form.savings_amount.toLocaleString()}

LOAN REQUEST
- Amount: £${form.loan_amount.toLocaleString()}
- Purpose: ${form.loan_purpose}
- Term: ${form.loan_term_months} months
- Loan-to-annual-income ratio: ${loanToIncomeRatio}%
- Implied monthly repayment: ~£${Math.round(form.loan_amount / form.loan_term_months)}/month`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SCORING_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }]
  })

  const rawResponse = response.content[0].type === 'text' ? response.content[0].text : ''
  
  const parsed = JSON.parse(rawResponse)

  return {
    result: {
      etho_score: parsed.etho_score,
      risk_band: computeRiskBand(parsed.etho_score),
      recommendation: parsed.recommendation as Recommendation,
      ai_summary: parsed.ai_summary,
      factors: parsed.factors,
      model_version: 'claude-sonnet-4-6'
    },
    rawPrompt: userPrompt,
    rawResponse
  }
}
