import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePartnerAuth } from '../../../../lib/partner-auth'
import { scoreApplication, computeRiskBand } from '../../../../lib/scoring-engine'
import { extractRiskSignals } from '../../../../lib/risk-factors'
import { makeDecision, DECISION_RULE_VERSION } from '../../../../lib/decision-engine'
import { commitDecisionPackage } from '../../../../lib/audit-engine'
import { transition } from '../../../../lib/workflow-engine'
import { ApplicationForm, ScoreFactor, validateApplicationForm } from '../../../../types'
import { log, alertScoringRequestFailed } from '../../../../lib/logger'

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

    // 2. AI scoring. A failure here previously left `application` at
    // status: 'pending' forever with no explanation — now marked
    // explicitly 'failed' (see app/api/score/route.ts's markApplicationFailed
    // for the internal route's identical fix).
    let scoreData: any
    const aiProvider = process.env.ANTHROPIC_API_KEY ? 'claude' : 'fallback'
    try {
      scoreData = process.env.ANTHROPIC_API_KEY
        ? await scoreApplication(form)
        : getMockScore()
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      log.error('v1 scoring failed', { route: 'v1/applications', applicationId: application.id, error: errMsg })
      await supabase.from('applications').update({ status: 'failed', failure_reason: `scoring: ${errMsg}`.slice(0, 2000) }).eq('id', application.id)
      alertScoringRequestFailed({ applicationId: application.id, stage: 'scoring', error: errMsg })
      return NextResponse.json(
        { error: { code: 'SCORING_FAILED', message: 'Scoring failed and could not be completed.' } },
        { status: 502 }
      )
    }
    const { result, rawPrompt, rawResponse } = scoreData
    const promptVersion: string = scoreData.promptVersion ?? 'v1'
    const modelRequested: string | null = scoreData.modelRequested ?? null
    const modelResponded: string | null = scoreData.modelResponded ?? null
    const confidenceOverall: string | null = scoreData.confidenceOverall ?? null

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

    // 5. Atomically persist the complete Decision Package. Same
    // guarantee as app/api/score/route.ts: either everything (scores +
    // model_versions + data_snapshots + decision_records +
    // provenance_records) commits together, or nothing does, and the
    // request fails loudly instead of returning a score with silently
    // missing evidence. This route doesn't compute EthoScore v2 pillars,
    // so scoreVersion is always 'v1' and scorePillars is always null
    // here, matching this route's existing v1-only behavior.
    const authoritativeRecommendation = decision.requiresHumanReview ? 'review' : decision.approved ? 'approve' : 'decline'
    const packageResult = await commitDecisionPackage(
      {
        applicationId: application.id,
        orgId: auth.context.orgId,
        source: 'partner_api',
        inputSnapshot: form as unknown as Record<string, unknown>,
        scoreVersion: 'v1',
        promptVersion,
        modelRequested,
        modelResponded,
        modelVersionLabel: result.model_version,
        rawPrompt,
        rawResponse,
        confidenceOverall,
        ethoScore: result.etho_score,
        riskBand: result.risk_band,
        aiSummary: result.ai_summary,
        factors: result.factors,
        recommendation: authoritativeRecommendation,
        scorePillars: null,
        decision: decision.requiresHumanReview ? 'review' : decision.approved ? 'approved' : 'declined',
        reasonCodes: decision.reasonCodes,
        confidence: decision.confidence,
        requiresHumanReview: decision.requiresHumanReview,
      },
      DECISION_RULE_VERSION
    )

    if (packageResult.success === false) {
      log.error('v1 decision package commit failed — no score persisted', { route: 'v1/applications', applicationId: application.id, error: packageResult.error })
      await supabase.from('applications').update({ status: 'failed', failure_reason: `decision_package: ${packageResult.error}`.slice(0, 2000) }).eq('id', application.id)
      alertScoringRequestFailed({ applicationId: application.id, stage: 'decision_package', error: packageResult.error })
      return NextResponse.json(
        { error: { code: 'DECISION_PACKAGE_FAILED', message: 'Scoring succeeded but the decision could not be durably persisted. No score was recorded.' } },
        { status: 502 }
      )
    }

    // 6. Workflow transition — downstream of the durable commit, best-effort.
    await transition({
      entityType: 'application',
      entityId: application.id,
      fromState: 'pending',
      toState: 'scored',
      actorId: `api_key:${auth.context.keyId}`,
      orgId: auth.context.orgId,
      metadata: { scoreId: packageResult.scoreId, ethoScore: result.etho_score, riskBand: result.risk_band },
    })

    // 7. Response
    return NextResponse.json({
      data: {
        application_id: application.id,
        score_id: packageResult.scoreId,
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
        // Explicit, unambiguous alias — see app/api/score/route.ts's
        // identical addition. `decision` above is model-adjacent but
        // authoritative already in this route; ethosfi_decision makes
        // that unambiguous for any new integration.
        ethosfi_decision: {
          is_authoritative: true,
          decision_rule_version: DECISION_RULE_VERSION,
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
    log.error('v1 scoring pipeline failed', { route: 'v1/applications', error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Scoring failed' } }, { status: 500 })
  }
}
