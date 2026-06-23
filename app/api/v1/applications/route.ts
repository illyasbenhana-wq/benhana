import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePartnerAuth } from '../../../../lib/partner-auth'
import { scoreApplication, computeRiskBand } from '../../../../lib/scoring-engine'
import { extractRiskSignals } from '../../../../lib/risk-factors'
import { makeDecision } from '../../../../lib/decision-engine'
import { recordAuditEvent } from '../../../../lib/audit-engine'
import { transition } from '../../../../lib/workflow-engine'
import { ApplicationForm, ScoreFactor, validateApplicationForm } from '../../../../types'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function getMockScore() {
  const factors: ScoreFactor[] = [
    { name: 'Income Stability', weight: 25, score: 65, rationale: 'Employment duration suggests moderate stability' },
    { name: 'Rent Payment History', weight: 30, score: 70, rationale: 'Consistent rent payments indicate responsibility' },
    { name: 'Loan-to-Income Ratio', weight: 25, score: 60, rationale: 'Loan amount relative to income is acceptable' },
    { name: 'Savings Buffer', weight: 15, score: 55, rationale: 'Moderate savings provide some financial cushion' },
    { name: 'Gig Income Stability', weight: 5, score: 50, rationale: 'Gig income trends require further assessment' },
  ]
  return {
    result: {
      etho_score: 64, risk_band: computeRiskBand(64), recommendation: 'review' as const,
      ai_summary: 'Applicant shows moderate credit signals. Requires manual review.',
      factors, model_version: 'mock-v1',
    },
    rawPrompt: 'Mock scoring (ANTHROPIC_API_KEY not configured)',
    rawResponse: 'Mock response',
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePartnerAuth(req, 'applications:write')
  if ('error' in auth) return auth.error

  try {
    const rawBody = await req.json()
    const validation = validateApplicationForm(rawBody)
    if (validation.valid === false) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: validation.error } }, { status: 400 })
    }
    const form = validation.data
    const supabase = getSupabase()
    if (!supabase) {
      return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }, { status: 503 })
    }

    // 1. Save application
    const { data: application, error: appErr } = await supabase
      .from('applications')
      .insert({
        organization_id: auth.context.orgId,
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
        status: 'pending',
      })
      .select()
      .single()

    if (appErr || !application) {
      return NextResponse.json({ error: { code: 'INSERT_FAILED', message: appErr?.message ?? 'Failed to create application' } }, { status: 500 })
    }

    // 2. AI scoring
    const aiProvider = process.env.ANTHROPIC_API_KEY ? 'claude' : 'fallback'
    const scoreData = process.env.ANTHROPIC_API_KEY
      ? await scoreApplication(form)
      : getMockScore()
    const { result, rawPrompt, rawResponse } = scoreData

    // 3. Risk signals + decision
    const riskSignals = extractRiskSignals({
      etho_score: result.etho_score,
      risk_band: result.risk_band,
      factors: result.factors,
      recommendation: result.recommendation,
      ai_summary: result.ai_summary,
    })
    const decision = makeDecision({
      ethoScore: result.etho_score,
      riskBand: result.risk_band,
      riskFactors: result.factors,
    })

    // 4. Audit record
    await recordAuditEvent({
      applicationId: application.id,
      inputSnapshot: form as unknown as Record<string, unknown>,
      modelVersion: result.model_version,
      promptVersion: 'v1',
      aiProvider,
      rawPrompt,
      rawResponse,
    })

    // 5. Save score
    const { data: score, error: scoreErr } = await supabase
      .from('scores')
      .insert({
        organization_id: auth.context.orgId,
        application_id: application.id,
        etho_score: result.etho_score,
        risk_band: result.risk_band,
        recommendation: decision.requiresHumanReview ? 'review' : decision.approved ? 'approve' : 'decline',
        ai_summary: result.ai_summary,
        factors: result.factors,
        model_version: result.model_version,
        raw_prompt: rawPrompt,
        raw_response: rawResponse,
      })
      .select()
      .single()

    if (scoreErr) {
      return NextResponse.json({ error: { code: 'SCORE_SAVE_FAILED', message: scoreErr.message } }, { status: 500 })
    }

    // 6. Workflow transition
    await transition({
      entityType: 'application',
      entityId: application.id,
      fromState: 'pending',
      toState: 'scored',
      actorId: `api_key:${auth.context.keyId}`,
      orgId: auth.context.orgId,
      metadata: { scoreId: score.id, ethoScore: result.etho_score, riskBand: result.risk_band },
    })

    // 7. Response
    return NextResponse.json({
      data: {
        application_id: application.id,
        score_id: score.id,
        etho_score: result.etho_score,
        risk_band: result.risk_band,
        recommendation: result.recommendation,
        ai_summary: result.ai_summary,
        factors: result.factors,
        decision: {
          approved: decision.approved,
          confidence: decision.confidence,
          requires_human_review: decision.requiresHumanReview,
          reason_codes: decision.reasonCodes,
        },
        risk_signals: riskSignals,
      },
      meta: { model_version: result.model_version, api_version: 'v1' },
    })
  } catch (err) {
    const { log } = require('../../../lib/logger'); log.error('v1 scoring pipeline failed', { route: 'v1/applications', error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Scoring failed' } }, { status: 500 })
  }
}
