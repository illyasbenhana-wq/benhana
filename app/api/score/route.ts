import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoreApplication } from '@/lib/scoring-engine'
import { ApplicationForm } from '@/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const form: ApplicationForm = await req.json()

    // 1. Save application
    const { data: application, error: appError } = await supabase
      .from('applications')
      .insert({
        full_name: form.full_name,
        email: form.email,
        monthly_income: form.monthly_income,
        employment_type: form.employment_type,
        employer_name: form.employer_name,
        months_at_current_job: form.months_at_current_job,
        rent_months_paid: form.rent_months_paid,
        rent_monthly_amount: form.rent_monthly_amount,
        gig_platforms: form.gig_platforms,
        gig_monthly_avg: form.gig_monthly_avg,
        savings_amount: form.savings_amount,
        loan_amount: form.loan_amount,
        loan_purpose: form.loan_purpose,
        loan_term_months: form.loan_term_months,
        consent_data_use: form.consent_data_use,
        consent_ai_decision: form.consent_ai_decision,
        status: 'pending'
      })
      .select()
      .single()

    if (appError) throw appError

    // 2. Score with Claude
    const { result, rawPrompt, rawResponse } = await scoreApplication(form)

    // 3. Save score
    const { data: score, error: scoreError } = await supabase
      .from('scores')
      .insert({
        application_id: application.id,
        etho_score: result.etho_score,
        risk_band: result.risk_band,
        recommendation: result.recommendation,
        ai_summary: result.ai_summary,
        factors: result.factors,
        model_version: result.model_version,
        raw_prompt: rawPrompt,
        raw_response: rawResponse
      })
      .select()
      .single()

    if (scoreError) throw scoreError

    // 4. Update application status
    await supabase
      .from('applications')
      .update({ status: 'scored' })
      .eq('id', application.id)

    return NextResponse.json({
      application_id: application.id,
      score_id: score.id,
      etho_score: result.etho_score,
      risk_band: result.risk_band,
      recommendation: result.recommendation,
      ai_summary: result.ai_summary,
      factors: result.factors
    })

  } catch (err) {
    console.error('Scoring error:', err)
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 })
  }
}
