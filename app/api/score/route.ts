import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoreApplication } from '../../../lib/scoring-engine'
import { extractRiskSignals } from '../../../lib/risk-factors'
import { makeDecision } from '../../../lib/decision-engine'
import { recordAuditEvent } from '../../../lib/audit-engine'
import { resolveApiContext } from '../../../lib/api-guard'
import { getDefaultOrgId } from '../../../lib/org-context'
import { transition } from '../../../lib/workflow-engine'
import { computeEthoScoreV2 } from '../../../lib/ethoscore-v2'
import { ApplicationForm, ScoreFactor, validateApplicationForm } from '../../../types'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// Mock score for when ANTHROPIC_API_KEY is not available
function getMockScore() {
  const mockFactors: ScoreFactor[] = [
    {
      name: 'Income Stability',
      weight: 25,
      score: 65,
      rationale: 'Employment duration suggests moderate stability'
    },
    {
      name: 'Rent Payment History',
      weight: 30,
      score: 70,
      rationale: 'Consistent rent payments indicate responsibility'
    },
    {
      name: 'Loan-to-Income Ratio',
      weight: 25,
      score: 60,
      rationale: 'Loan amount relative to income is acceptable'
    },
    {
      name: 'Savings Buffer',
      weight: 15,
      score: 55,
      rationale: 'Moderate savings provide some financial cushion'
    },
    {
      name: 'Gig Income Stability',
      weight: 5,
      score: 50,
      rationale: 'Gig income trends require further assessment'
    }
  ]

  return {
    result: {
      etho_score: 64,
      risk_band: 'medium' as const,
      recommendation: 'review' as const,
      ai_summary: 'Mock score: Applicant shows moderate credit signals. Income is stable with consistent rent payments, but requires manual review for final decision.',
      factors: mockFactors,
      model_version: 'mock-v1'
    },
    rawPrompt: 'Mock scoring (ANTHROPIC_API_KEY not configured)',
    rawResponse: 'Mock response'
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json()
    const validation = validateApplicationForm(rawBody)
    if (validation.valid === false) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: validation.error } }, { status: 400 })
    }
    const form = validation.data
    const orgIdFromBody = (rawBody as Record<string, unknown>).organization_id as string | undefined
    const supabase = getSupabase()

    // Resolve org: authenticated user → their org, public → validate body or default
    const authContext = await resolveApiContext(req)
    let orgId: string

    if (authContext) {
      orgId = authContext.orgId
    } else if (orgIdFromBody) {
      if (!supabase) {
        return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }, { status: 503 })
      }
      const { data, error } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', orgIdFromBody)
        .is('deleted_at', null)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: { code: 'INVALID_ORG', message: 'Organization not found' } }, { status: 400 })
      }
      orgId = data.id
    } else {
      orgId = getDefaultOrgId()
    }

    // Step 1: Save application to Supabase
    let applicationId = 'demo'
    if (supabase) {
      const { data: application, error: appError } = await supabase
        .from('applications')
        .insert({
          organization_id: orgId,
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
      applicationId = application.id
    }

    // Step 2: Call AI scoring (Claude) or mock fallback
    let scoreData: any
    const aiProvider = process.env.ANTHROPIC_API_KEY ? 'claude' : 'fallback'
    if (process.env.ANTHROPIC_API_KEY) {
      scoreData = await scoreApplication(form)
    } else {
      console.warn('ANTHROPIC_API_KEY not set, using mock score')
      scoreData = getMockScore()
    }
    const { result, rawPrompt, rawResponse } = scoreData

    // Step 3: Transform AI output into structured risk signals
    const riskSignals = extractRiskSignals({
      etho_score: result.etho_score,
      risk_band: result.risk_band,
      factors: result.factors,
      recommendation: result.recommendation,
      ai_summary: result.ai_summary,
    })

    // Step 4: Apply business decision rules
    const decision = makeDecision({
      ethoScore: result.etho_score,
      riskBand: result.risk_band,
      riskFactors: result.factors,
    })

    // Step 4b: Compute structured EthoScore v2 (deterministic, no AI)
    let v2: ReturnType<typeof computeEthoScoreV2> | null = null
    try {
      v2 = computeEthoScoreV2(form)
    } catch (err) {
      console.warn('[score] EthoScore v2 computation failed (non-fatal):', err)
    }

    // Step 5: Save audit record (EU AI Act compliance)
    await recordAuditEvent({
      applicationId,
      inputSnapshot: form as unknown as Record<string, unknown>,
      modelVersion: result.model_version,
      promptVersion: 'v1',
      aiProvider,
      rawPrompt,
      rawResponse,
    })

    // Step 6: Save final score + decision to Supabase
    let scoreId = 'demo'
    if (supabase) {
      const { data: score, error: scoreError } = await supabase
        .from('scores')
        .insert({
          organization_id: orgId,
          application_id: applicationId,
          etho_score: result.etho_score,
          risk_band: result.risk_band,
          recommendation: decision.requiresHumanReview ? 'review' : decision.approved ? 'approve' : 'decline',
          ai_summary: result.ai_summary,
          factors: result.factors,
          model_version: result.model_version,
          raw_prompt: rawPrompt,
          raw_response: rawResponse,
          score_version: v2 ? 'v2' : 'v1',
          score_pillars: v2?.pillars ?? null,
        })
        .select()
        .single()

      if (scoreError) throw scoreError
      scoreId = score.id

      // Workflow transition: pending → scored
      const txResult = await transition({
        entityType: 'application',
        entityId: applicationId,
        fromState: 'pending',
        toState: 'scored',
        actorId: authContext?.userId ?? 'system',
        orgId: orgId,
        metadata: { scoreId, ethoScore: result.etho_score, riskBand: result.risk_band },
      })
      if (txResult.success === false) {
        console.warn('[score] workflow transition failed (non-fatal):', txResult.error)
      }
    }

    // Step 7: Return response
    return NextResponse.json({
      application_id: applicationId,
      score_id: scoreId,
      full_name: form.full_name,
      ai_assessment: {
        score: result.etho_score,
        risk_band: result.risk_band,
        recommendation: result.recommendation,
        summary: result.ai_summary,
        factors: result.factors,
        model_version: result.model_version,
      },
      structured_score: v2 ? {
        total: v2.total,
        normalized: v2.normalized,
        pillars: v2.pillars,
      } : null,
      // Backward compat — existing consumers read these top-level fields
      etho_score: result.etho_score,
      risk_band: result.risk_band,
      recommendation: result.recommendation,
      ai_summary: result.ai_summary,
      factors: result.factors,
      model_version: result.model_version,
      decision: {
        approved: decision.approved,
        confidence: decision.confidence,
        requires_human_review: decision.requiresHumanReview,
        reason_codes: decision.reasonCodes,
      },
      risk_signals: riskSignals,
    })

  } catch (err) {
    console.error('Scoring error:', err)
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 })
  }
}
