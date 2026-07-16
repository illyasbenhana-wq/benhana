import Anthropic from '@anthropic-ai/sdk'
import { ApplicationForm, ScoreResult, RiskBand, Recommendation } from '@/types'
import { log } from './logger'
import * as PromptV1 from './prompts/ethoscore-v1'
import * as PromptV2 from './prompts/ethoscore-llm-v2'
import { computeRiskBand } from './risk-band'

// Moved to lib/risk-band.ts (dependency-free — safe to import from
// client components, unlike this file, whose `new Anthropic()` below
// throws in any browser environment). Re-exported here so existing
// server-side callers (app/api/*, lib/backtest-engine.ts) are unaffected.
export { computeRiskBand }

const client = new Anthropic()

export type PromptVersion = typeof PromptV1.PROMPT_VERSION | typeof PromptV2.PROMPT_VERSION

const PROMPTS: Record<PromptVersion, { systemPrompt: string }> = {
  [PromptV1.PROMPT_VERSION]: { systemPrompt: PromptV1.ETHOSCORE_SYSTEM_PROMPT },
  [PromptV2.PROMPT_VERSION]: { systemPrompt: PromptV2.ETHOSCORE_SYSTEM_PROMPT },
}

// Production default. NOT claude-fable-5 — that only happens after the
// calibration run + advisor sign-off (see CLAUDE.md).
export const DEFAULT_MODEL = 'claude-opus-4-8'

// Resolution order: explicit option (per-call override, e.g. a calibration
// script) → ETHOSCORE_MODEL env var → DEFAULT_MODEL.
export function getScoringModel(): string {
  return process.env.ETHOSCORE_MODEL || DEFAULT_MODEL
}

export interface ScoreApplicationOptions {
  promptVersion?: PromptVersion
  model?: string // overrides ETHOSCORE_MODEL, e.g. for a calibration run
}

export interface ScoreApplicationResult {
  result: Omit<ScoreResult, 'id' | 'application_id' | 'created_at'>
  rawPrompt: string
  rawResponse: string
  promptVersion: PromptVersion
  modelRequested: string
  modelResponded: string
  confidenceOverall: string | null
  validationFallback: boolean
  // Only populated for prompt_version 2.0.0-fable5 — full pillar detail,
  // kept out of the ScoreResult shape so v1 consumers are unaffected.
  fable5Assessment: Record<string, unknown> | null
}

function buildUserPrompt(form: ApplicationForm): string {
  const loanToIncomeRatio = (form.loan_amount / (form.monthly_income * 12) * 100).toFixed(1)

  return `Score this loan application:

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
}

async function callClaude(model: string, systemPrompt: string, userPrompt: string): Promise<Anthropic.Message> {
  return client.messages.create({
    model,
    max_tokens: 4096,
    temperature: 0.2,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  })
}

function extractText(response: Anthropic.Message): string {
  const block = response.content[0]
  return block?.type === 'text' ? block.text : ''
}

// Parse defensively: try, retry once with a corrective turn, then fall back
// to DEFAULT_MODEL and flag the record. Never throws — callers always get a
// usable (if degraded) result plus a flag so the record can be reviewed.
async function requestAndParse(
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ parsed: any; rawResponse: string; modelResponded: string; validationFallback: boolean }> {
  let response = await callClaude(model, systemPrompt, userPrompt)
  let rawResponse = extractText(response)

  try {
    return { parsed: JSON.parse(rawResponse), rawResponse, modelResponded: response.model, validationFallback: false }
  } catch {
    log.warn('EthoScore JSON parse failed, retrying once', { model })
  }

  // Retry 1: same model, corrective follow-up turn
  response = await client.messages.create({
    model,
    max_tokens: 4096,
    temperature: 0.2,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: rawResponse },
      { role: 'user', content: 'Your previous response was not valid JSON. Respond with ONLY the valid JSON object described in the schema — no preamble, no markdown fences, no trailing text.' },
    ],
  })
  rawResponse = extractText(response)

  try {
    return { parsed: JSON.parse(rawResponse), rawResponse, modelResponded: response.model, validationFallback: false }
  } catch {
    log.warn('EthoScore JSON parse failed after retry, falling back to default model', { model, fallbackModel: DEFAULT_MODEL })
  }

  // Fallback: default model, flag the record for review
  response = await callClaude(DEFAULT_MODEL, systemPrompt, userPrompt)
  rawResponse = extractText(response)

  try {
    return { parsed: JSON.parse(rawResponse), rawResponse, modelResponded: response.model, validationFallback: true }
  } catch (err) {
    log.error('EthoScore JSON parse failed after fallback — giving up', { fallbackModel: DEFAULT_MODEL, error: err instanceof Error ? err.message : String(err) })
    throw new Error('EthoScore assessment returned invalid JSON after retry and fallback')
  }
}

export async function scoreApplication(
  form: ApplicationForm,
  options: ScoreApplicationOptions = {}
): Promise<ScoreApplicationResult> {
  const promptVersion = options.promptVersion ?? (PromptV1.PROMPT_VERSION as PromptVersion)
  const model = options.model ?? getScoringModel()
  const systemPrompt = PROMPTS[promptVersion].systemPrompt
  const userPrompt = buildUserPrompt(form)

  const { parsed, rawResponse, modelResponded, validationFallback } = await requestAndParse(model, systemPrompt, userPrompt)

  if (promptVersion === PromptV2.PROMPT_VERSION) {
    // Fable 5 prompt: 0-1000 scale, 5-value risk_band, pillar detail.
    // Normalize onto the existing 0-100 ScoreResult shape so v1 consumers
    // (decision engine, dashboards) keep working unchanged; full pillar
    // detail is returned separately via fable5Assessment.
    const normalizedScore = Math.round(parsed.etho_score / 10)
    return {
      result: {
        etho_score: normalizedScore,
        risk_band: computeRiskBand(normalizedScore),
        recommendation: (normalizedScore >= 70 ? 'approve' : normalizedScore >= 40 ? 'review' : 'decline') as Recommendation,
        ai_summary: parsed.summary,
        factors: [
          { name: 'Trust', weight: 30, score: Math.round((parsed.pillars.trust.score / 300) * 100), rationale: parsed.pillars.trust.rationale },
          { name: 'Track Record', weight: 30, score: Math.round((parsed.pillars.track_record.score / 300) * 100), rationale: parsed.pillars.track_record.rationale },
          { name: 'Financial Health', weight: 20, score: Math.round((parsed.pillars.financial_health.score / 200) * 100), rationale: parsed.pillars.financial_health.rationale },
          { name: 'ESG Alignment', weight: 20, score: Math.round((parsed.pillars.esg_alignment.score / 200) * 100), rationale: parsed.pillars.esg_alignment.rationale },
        ],
        model_version: modelResponded,
      },
      rawPrompt: userPrompt,
      rawResponse,
      promptVersion,
      modelRequested: model,
      modelResponded,
      confidenceOverall: parsed.confidence_overall ?? null,
      validationFallback,
      fable5Assessment: parsed,
    }
  }

  return {
    result: {
      etho_score: parsed.etho_score,
      risk_band: computeRiskBand(parsed.etho_score),
      recommendation: parsed.recommendation as Recommendation,
      ai_summary: parsed.ai_summary,
      factors: parsed.factors,
      model_version: modelResponded,
    },
    rawPrompt: userPrompt,
    rawResponse,
    promptVersion,
    modelRequested: model,
    modelResponded,
    confidenceOverall: null,
    validationFallback,
    fable5Assessment: null,
  }
}

export interface EthoscoreAssessedPayloadInput {
  scoreId: string
  ethoScore: number
  riskBand: RiskBand
  promptVersion: PromptVersion
  modelRequested: string
  modelResponded: string
  confidenceOverall: string | null
  validationFallback: boolean
  fable5Assessment: Record<string, unknown> | null
}

// Shape of the `metadata` payload on the 'ethoscore_assessed' workflow_events
// entry (see lib/workflow-engine.ts recordEvent + app/api/score/route.ts).
// Pulled out as a pure function so it's independently testable without a DB.
export function buildEthoscoreAssessedPayload(input: EthoscoreAssessedPayloadInput): Record<string, unknown> {
  return {
    scoreId: input.scoreId,
    etho_score: input.ethoScore,
    risk_band: input.riskBand,
    prompt_version: input.promptVersion,
    model_requested: input.modelRequested,
    model_responded: input.modelResponded,
    confidence_overall: input.confidenceOverall,
    validation_fallback: input.validationFallback,
    fable5_assessment: input.fable5Assessment,
  }
}
