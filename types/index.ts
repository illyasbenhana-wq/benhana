export type EmploymentType = 'employed' | 'self_employed' | 'gig' | 'freelance' | 'unemployed'
export type RiskBand = 'low' | 'medium' | 'high'
export type ApplicationStatus = 'pending' | 'scored' | 'approved' | 'declined' | 'more_info'
export type Recommendation = 'approve' | 'decline' | 'review'
export type Decision = 'approved' | 'declined' | 'more_info'

export interface ApplicationForm {
  full_name: string
  email: string
  monthly_income: number
  employment_type: EmploymentType
  employer_name?: string
  months_at_current_job?: number
  rent_months_paid: number
  rent_monthly_amount: number
  gig_platforms: string[]
  gig_monthly_avg: number
  savings_amount: number
  loan_amount: number
  loan_purpose: string
  loan_term_months: number
  consent_data_use: boolean
  consent_ai_decision: boolean
}

export interface ScoreFactor {
  name: string
  weight: number       // 0–100 importance
  score: number        // 0–100 borrower's score on this factor
  rationale: string    // plain English explanation
}

export interface ScoreResult {
  id: string
  application_id: string
  etho_score: number
  risk_band: RiskBand
  ai_summary: string
  factors: ScoreFactor[]
  recommendation: Recommendation
  model_version: string
  raw_prompt?: string
  raw_response?: string
  created_at: string
}

const VALID_EMPLOYMENT_TYPES = new Set<EmploymentType>(['employed', 'self_employed', 'gig', 'freelance', 'unemployed'])

export function validateApplicationForm(form: unknown): { valid: true; data: ApplicationForm } | { valid: false; error: string } {
  if (!form || typeof form !== 'object') return { valid: false, error: 'Request body must be a JSON object' }
  const f = form as Record<string, unknown>

  if (typeof f.full_name !== 'string' || f.full_name.trim().length === 0) return { valid: false, error: 'full_name is required (non-empty string)' }
  if (typeof f.email !== 'string' || !f.email.includes('@')) return { valid: false, error: 'email is required (valid email address)' }
  if (typeof f.monthly_income !== 'number' || f.monthly_income < 0) return { valid: false, error: 'monthly_income is required (non-negative number)' }
  if (typeof f.employment_type !== 'string' || !VALID_EMPLOYMENT_TYPES.has(f.employment_type as EmploymentType)) return { valid: false, error: `employment_type must be one of: ${[...VALID_EMPLOYMENT_TYPES].join(', ')}` }
  if (typeof f.loan_amount !== 'number' || f.loan_amount <= 0) return { valid: false, error: 'loan_amount is required (positive number)' }
  if (typeof f.loan_purpose !== 'string' || f.loan_purpose.trim().length === 0) return { valid: false, error: 'loan_purpose is required (non-empty string)' }
  if (typeof f.loan_term_months !== 'number' || f.loan_term_months <= 0) return { valid: false, error: 'loan_term_months is required (positive number)' }
  if (typeof f.consent_data_use !== 'boolean' || !f.consent_data_use) return { valid: false, error: 'consent_data_use must be true' }
  if (typeof f.consent_ai_decision !== 'boolean' || !f.consent_ai_decision) return { valid: false, error: 'consent_ai_decision must be true' }

  return {
    valid: true,
    data: {
      full_name: f.full_name as string,
      email: f.email as string,
      monthly_income: f.monthly_income as number,
      employment_type: f.employment_type as EmploymentType,
      employer_name: (f.employer_name as string) ?? undefined,
      months_at_current_job: typeof f.months_at_current_job === 'number' ? f.months_at_current_job : undefined,
      rent_months_paid: typeof f.rent_months_paid === 'number' ? f.rent_months_paid : 0,
      rent_monthly_amount: typeof f.rent_monthly_amount === 'number' ? f.rent_monthly_amount : 0,
      gig_platforms: Array.isArray(f.gig_platforms) ? f.gig_platforms.filter((p: unknown) => typeof p === 'string') : [],
      gig_monthly_avg: typeof f.gig_monthly_avg === 'number' ? f.gig_monthly_avg : 0,
      savings_amount: typeof f.savings_amount === 'number' ? f.savings_amount : 0,
      loan_amount: f.loan_amount as number,
      loan_purpose: f.loan_purpose as string,
      loan_term_months: f.loan_term_months as number,
      consent_data_use: true,
      consent_ai_decision: true,
    },
  }
}

export interface Application {
  id: string
  created_at: string
  full_name: string
  email: string
  monthly_income: number
  employment_type: EmploymentType
  loan_amount: number
  loan_purpose: string
  loan_term_months: number
  status: ApplicationStatus
  score?: ScoreResult
}
