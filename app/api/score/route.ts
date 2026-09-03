import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scoreApplication, computeRiskBand, buildEthoscoreAssessedPayload } from '../../../lib/scoring-engine'
import { extractRiskSignals } from '../../../lib/risk-factors'
import { makeDecision, DECISION_RULE_VERSION } from '../../../lib/decision-engine'
import { commitDecisionPackage } from '../../../lib/audit-engine'
import { resolveApiContext } from '../../../lib/api-guard'
import { getDefaultOrgId } from '../../../lib/org-context'
import { transition, recordEvent } from '../../../lib/workflow-engine'
import { computeEthoScoreV2 } from '../../../lib/ethoscore-v2'
import { PROMPT_VERSION as FABLE5_PROMPT_VERSION } from '../../../lib/prompts/ethoscore-llm-v2'
import { ApplicationForm, ScoreFactor, validateApplicationForm } from '../../../types'
import { log, alertEthoscoreAssessedEventFailed, alertScoringRequestFailed } from '../../../lib/logger'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// Marks an application explicitly 'failed' with a reason, instead of
// leaving it silently at 'pending'. Itself best-effort/non-throwing —
// this is diagnostic bookkeeping for an already-failing request; if it
// can't be written, the original failure is still what gets returned to
// the caller, not this one.
async function markApplicationFailed(
  supabase: any,
  applicationId: string,
  reason: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('applications')
      .update({ status: 'failed', failure_reason: reason.slice(0, 2000) })
      .eq('id', applicationId)
    if (error) {
      log.error('failed to mark application as failed', { route: 'score', applicationId, error: error.message })
    }
  } catch (err) {
    log.error('markApplicationFailed threw', { route: 'score', applicationId, error: err instanceof Error ? err.message : String(err) })
  }
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
      risk_band: computeRiskBand(64),
      recommendation: 'review' as const,
      ai_summary: 'Mock score: Applicant shows moderate credit signals. Income is stable with consistent rent payments, but requires manual review for final decision.',
      factors: mockFactors,
      model_version: 'mock-v1'
    },
    rawPrompt: 'Mock scoring (ANTHROPIC_API_KEY not configured)',
    rawResponse: 'Mock response',
    promptVersion: 'v1' as const,
    modelRequested: 'mock-v1',
    modelResponded: 'mock-v1',
    confidenceOverall: null,
    validationFallback: false,
    fable5Assessment: null,
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

    // Step 2: Call AI scoring (Claude) or mock fallback.
    // A failure here (Anthropic error, malformed response exhausting
    // retry/fallback, model/prompt governance mismatch) previously left
    // `applicationId` at status: 'pending' forever, with no explanation
    // anywhere in the database — an orphaned record indistinguishable
    // from "still being scored." Now marked explicitly, so an operator
    // (or a future automated check) can find and explain it, instead of
    // it being silently invisible. See Production Readiness & Decision
    // Integrity Audit, §6/§11/P0.
    let scoreData: any
    const aiProvider = process.env.ANTHROPIC_API_KEY ? 'claude' : 'fallback'
    try {
      if (process.env.ANTHROPIC_API_KEY) {
        scoreData = await scoreApplication(form)
      } else {
        log.warn('ANTHROPIC_API_KEY not set, using mock score', { route: 'score' })
        scoreData = getMockScore()
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      log.error('scoring failed', { route: 'score', applicationId, error: errMsg })
      if (supabase && applicationId !== 'demo') {
        await markApplicationFailed(supabase, applicationId, `scoring: ${errMsg}`)
      }
      alertScoringRequestFailed({ applicationId, stage: 'scoring', error: errMsg })
      return NextResponse.json(
        { error: { code: 'SCORING_FAILED', message: 'Scoring failed and could not be completed.' }, application_id: applicationId },
        { status: 502 }
      )
    }
    const { result, rawPrompt, rawResponse, promptVersion, modelRequested, modelResponded, confidenceOverall, validationFallback } = scoreData

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
      log.warn('EthoScore v2 computation failed (non-fatal)', { route: 'score', error: err instanceof Error ? err.message : String(err) })
    }

    // Step 6: Atomically persist the complete Decision Package (scores +
    // model_versions + data_snapshots + decision_records +
    // provenance_records) in a single database transaction — see
    // lib/audit-engine.ts's commitDecisionPackage() and
    // supabase/migrations/20260903000002_atomic_decision_package.sql.
    //
    // Production Closure (P0): this used to be five separate, sequential
    // writes where anything past the first could fail silently while the
    // API still returned 200. Now it is one call. If it fails, NOTHING
    // was persisted (the whole transaction rolled back — no orphaned
    // `scores` row, no partial lineage) and the request fails loudly: the
    // application is marked 'failed' and the caller gets an explicit
    // error, never a misleading success.
    let scoreId = 'demo'
    if (supabase) {
      // score_version must describe which scoring approach actually
      // produced result.etho_score (i.e. whether the LLM was called with
      // the v2/fable5 prompt, whose response's own pillar breakdown
      // mathematically explains the score), NOT merely "did the
      // separate, always-run deterministic lib/ethoscore-v2.ts
      // calculation succeed." Those are two unrelated engines (see
      // CLAUDE.md, "Two unrelated v2 modules") whose outputs are
      // deliberately never merged — score_pillars is always the
      // deterministic engine's independent assessment.
      const scoreVersion = promptVersion === FABLE5_PROMPT_VERSION ? 'v2' : 'v1'
      const authoritativeRecommendation = decision.requiresHumanReview ? 'review' : decision.approved ? 'approve' : 'decline'

      const packageResult = await commitDecisionPackage(
        {
          applicationId,
          orgId,
          source: 'apply_flow',
          inputSnapshot: form as unknown as Record<string, unknown>,
          scoreVersion,
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
          scorePillars: v2?.pillars ?? null,
          decision: decision.requiresHumanReview ? 'review' : decision.approved ? 'approved' : 'declined',
          reasonCodes: decision.reasonCodes,
          confidence: decision.confidence,
          requiresHumanReview: decision.requiresHumanReview,
        },
        DECISION_RULE_VERSION
      )

      if (packageResult.success === false) {
        log.error('decision package commit failed — no score persisted', { route: 'score', applicationId, error: packageResult.error })
        await markApplicationFailed(supabase, applicationId, `decision_package: ${packageResult.error}`)
        alertScoringRequestFailed({ applicationId, stage: 'decision_package', error: packageResult.error })
        return NextResponse.json(
          { error: { code: 'DECISION_PACKAGE_FAILED', message: 'Scoring succeeded but the decision could not be durably persisted. No score was recorded.' }, application_id: applicationId },
          { status: 502 }
        )
      }

      scoreId = packageResult.scoreId

      // Workflow transition: pending → scored. Downstream of the
      // durable commit above, as required — a failure here can never
      // cause a missing score/lineage, only a missing workflow-state
      // side effect (already best-effort, unchanged from before).
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
        log.warn('workflow transition failed (non-fatal)', { route: 'score', error: txResult.error })
      }

      // Immutable event: which prompt/model actually produced this score
      // (traceability requirement — see lib/prompts/ethoscore-llm-v2.ts).
      // Never allowed to lose an already-computed score: recordEvent() itself
      // doesn't throw, and this call site is additionally wrapped so that if
      // it somehow does (e.g. the 'ethoscore_assessed' event_type / nullable
      // to_state haven't been unlocked yet by the calibration-fields
      // migration on this database), the score we already saved still ships.
      try {
        const assessedResult = await recordEvent({
          entityType: 'application',
          entityId: applicationId,
          orgId: orgId,
          eventType: 'ethoscore_assessed',
          actorId: authContext?.userId ?? 'system',
          payload: buildEthoscoreAssessedPayload({
            scoreId,
            ethoScore: result.etho_score,
            riskBand: result.risk_band,
            promptVersion,
            modelRequested,
            modelResponded,
            confidenceOverall,
            validationFallback,
            fable5Assessment: scoreData.fable5Assessment ?? null,
          }),
        })
        if (assessedResult.success === false) {
          log.warn('ethoscore_assessed event logging failed (non-fatal)', { route: 'score', error: assessedResult.error })
          // Same traceability gap as the calibration-columns case above —
          // this score has no ethoscore_assessed audit trail. Alert, don't
          // just log.
          alertEthoscoreAssessedEventFailed({ scoreId, error: assessedResult.error })
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        log.warn('ethoscore_assessed event logging threw (non-fatal, score already saved)', {
          route: 'score',
          error: errMsg,
        })
        alertEthoscoreAssessedEventFailed({ scoreId, error: errMsg })
      }
    }

    // Step 7: Return response.
    //
    // Production Closure (P2): `ai_assessment.recommendation` is the
    // model's own self-declared recommendation — it is NOT the EthoFi
    // decision and can disagree with it. `decision` (below, and its
    // alias `ethosfi_decision`) is the only authoritative output,
    // produced exclusively by lib/decision-engine.ts's makeDecision().
    // Both fields are kept — the model's own reasoning is useful context
    // — but `model_assessment`/`ethosfi_decision` make the distinction
    // explicit and unambiguous for any new integration, without removing
    // the original field names existing consumers already read.
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
      // Explicit, unambiguous alias of ai_assessment — this is model
      // output, NOT the EthoFi decision.
      model_assessment: {
        is_authoritative: false,
        score: result.etho_score,
        risk_band: result.risk_band,
        recommendation: result.recommendation,
        summary: result.ai_summary,
        factors: result.factors,
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
      // Explicit, unambiguous alias of `decision` — this, and only this,
      // is the actual EthoFi decision (lib/decision-engine.ts's
      // makeDecision(), rule version DECISION_RULE_VERSION).
      ethosfi_decision: {
        is_authoritative: true,
        decision_rule_version: DECISION_RULE_VERSION,
        approved: decision.approved,
        confidence: decision.confidence,
        requires_human_review: decision.requiresHumanReview,
        reason_codes: decision.reasonCodes,
      },
      risk_signals: riskSignals,
    })

  } catch (err) {
    log.error('scoring pipeline failed', { route: 'score', error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 })
  }
}
