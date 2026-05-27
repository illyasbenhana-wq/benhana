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
