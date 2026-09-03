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

// Model/prompt governance guard (Production Closure, P1): ETHOSCORE_MODEL
// alone can redirect production traffic to a different model with no
// corresponding code change. That's fine for interchangeable models under
// the same prompt contract (e.g. swapping Claude tiers under the v1
// prompt — a legitimate, already-used calibration/ops pattern, left
// untouched). It is NOT fine for a model whose response schema the
// current promptVersion was never designed for — claude-fable-5 expects
// the 2.0.0-fable5 prompt's 4-pillar JSON shape, not v1's. Only models
// with a genuine schema-coupling requirement are listed here; every other
// model remains freely substitutable, exactly as before.
const MODEL_REQUIRES_PROMPT_VERSION: Partial<Record<string, PromptVersion>> = {
  'claude-fable-5': PromptV2.PROMPT_VERSION,
}

export class ModelPromptMismatchError extends Error {
  constructor(model: string, requiredPromptVersion: PromptVersion, actualPromptVersion: PromptVersion) {
    super(
      `Model "${model}" requires prompt version "${requiredPromptVersion}" but "${actualPromptVersion}" was resolved. ` +
      `This model was requested (via options.model or ETHOSCORE_MODEL) without also requesting the matching prompt version — refusing to silently send a mismatched request.`
    )
    this.name = 'ModelPromptMismatchError'
  }
}

function assertModelPromptCompatible(model: string, promptVersion: PromptVersion): void {
  const required = MODEL_REQUIRES_PROMPT_VERSION[model]
  if (required && required !== promptVersion) {
    throw new ModelPromptMismatchError(model, required, promptVersion)
  }
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

// Allowlist, not blocklist: confirmed via direct API test (2026-08-03) that
// BOTH claude-opus-4-8 (production default) and claude-fable-5 reject
// `temperature` outright ("`temperature` is deprecated for this model", 400)
// — this isn't a Fable5-specific quirk. Add a model here only once you've
// confirmed live that it still accepts the parameter; default is to omit it.
const MODELS_WITH_TEMPERATURE = new Set<string>([])

function buildMessageParams(
  model: string,
  systemPrompt: string,
  messages: Anthropic.MessageParam[]
): Anthropic.MessageCreateParamsNonStreaming {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages,
  }
  if (MODELS_WITH_TEMPERATURE.has(model)) {
    params.temperature = 0.2
  }
  return params
}

async function callClaude(model: string, systemPrompt: string, userPrompt: string): Promise<Anthropic.Message> {
  return client.messages.create(buildMessageParams(model, systemPrompt, [{ role: 'user', content: userPrompt }]))
}

// content[0] isn't reliably the text block — claude-fable-5 emits an
// extended-thinking block first (confirmed via direct API test, 2026-08-03),
// which content[0]-only extraction silently reads as empty text.
function extractText(response: Anthropic.Message): string {
  const block = response.content.find(b => b.type === 'text')
  return block?.type === 'text' ? block.text : ''
}

// A validator returns null when `parsed` is acceptable, or a short
// human-readable reason string when it must be rejected. Rejection is
// routed through the same retry/fallback path as a JSON.parse failure —
// there is deliberately no separate error path for "parsed but wrong
// shape" vs. "didn't parse at all".
type ParseValidator = (parsed: any) => string | null

function parseAndValidate(
  rawResponse: string,
  validate: ParseValidator
): { ok: true; parsed: any } | { ok: false; error: string } {
  let parsed: any
  try {
    parsed = JSON.parse(rawResponse)
  } catch {
    return { ok: false, error: 'response was not valid JSON' }
  }
  const validationError = validate(parsed)
  if (validationError) {
    return { ok: false, error: validationError }
  }
  return { ok: true, parsed }
}

// Parse and validate defensively: try, retry once with a corrective turn,
// then fall back to DEFAULT_MODEL and flag the record. A response that
// parses as JSON but fails `validate` (missing/malformed/out-of-range
// fields) is treated exactly like a parse failure — same retry, same
// fallback, same eventual throw — so there is one failure path, not two.
// Never throws before the fallback is exhausted — callers always get a
// usable (if degraded) result plus a flag so the record can be reviewed.
async function requestAndParse(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  validate: ParseValidator = () => null
): Promise<{ parsed: any; rawResponse: string; modelResponded: string; validationFallback: boolean }> {
  let response = await callClaude(model, systemPrompt, userPrompt)
  let rawResponse = extractText(response)

  let attempt = parseAndValidate(rawResponse, validate)
  if (attempt.ok === true) {
    return { parsed: attempt.parsed, rawResponse, modelResponded: response.model, validationFallback: false }
  }
  log.warn('EthoScore response failed validation, retrying once', { model, reason: attempt.error })

  // Retry 1: same model, corrective follow-up turn
  response = await client.messages.create(buildMessageParams(model, systemPrompt, [
    { role: 'user', content: userPrompt },
    { role: 'assistant', content: rawResponse },
    { role: 'user', content: 'Your previous response was not valid JSON. Respond with ONLY the valid JSON object described in the schema — no preamble, no markdown fences, no trailing text.' },
  ]))
  rawResponse = extractText(response)

  attempt = parseAndValidate(rawResponse, validate)
  if (attempt.ok === true) {
    return { parsed: attempt.parsed, rawResponse, modelResponded: response.model, validationFallback: false }
  }
  log.warn('EthoScore response failed validation after retry, falling back to default model', { model, fallbackModel: DEFAULT_MODEL, reason: attempt.error })

  // Fallback: default model, flag the record for review
  response = await callClaude(DEFAULT_MODEL, systemPrompt, userPrompt)
  rawResponse = extractText(response)

  attempt = parseAndValidate(rawResponse, validate)
  if (attempt.ok === true) {
    return { parsed: attempt.parsed, rawResponse, modelResponded: response.model, validationFallback: true }
  }
  log.error('EthoScore response failed validation after fallback — giving up', { fallbackModel: DEFAULT_MODEL, reason: attempt.error })
  throw new Error(`EthoScore assessment returned invalid JSON after retry and fallback: ${attempt.error}`)
}

// Fable 5 (2.0.0-fable5) output-shape validation. Rejects (does NOT clamp)
// structurally invalid or semantically inconsistent output — a model that
// violates the ranges/consistency it was explicitly instructed to honor
// (lib/prompts/ethoscore-llm-v2.ts) is treated as an unreliable response,
// not silently coerced into range.
const FABLE5_PILLAR_MAX: Record<string, number> = {
  trust: 300,
  track_record: 300,
  financial_health: 200,
  esg_alignment: 200,
}
const FABLE5_ETHO_SCORE_MAX = 1000
// Rounding slack only — the prompt instructs the model to sum the four
// pillar scores exactly (lib/prompts/ethoscore-llm-v2.ts: "The total score
// is the sum of the four pillar scores").
const FABLE5_PILLAR_SUM_TOLERANCE = 1

function validateFable5Shape(parsed: any): string | null {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return 'response is not a JSON object'
  }
  if (typeof parsed.etho_score !== 'number' || !Number.isFinite(parsed.etho_score)) {
    return 'etho_score is missing or not a number'
  }
  if (parsed.etho_score < 0 || parsed.etho_score > FABLE5_ETHO_SCORE_MAX) {
    return `etho_score (${parsed.etho_score}) is outside the declared range 0-${FABLE5_ETHO_SCORE_MAX}`
  }
  if (typeof parsed.pillars !== 'object' || parsed.pillars === null || Array.isArray(parsed.pillars)) {
    return 'pillars is missing or not an object'
  }

  let pillarSum = 0
  for (const key of Object.keys(FABLE5_PILLAR_MAX)) {
    const pillar = parsed.pillars[key]
    if (typeof pillar !== 'object' || pillar === null || Array.isArray(pillar)) {
      return `pillars.${key} is missing or not an object`
    }
    if (typeof pillar.score !== 'number' || !Number.isFinite(pillar.score)) {
      return `pillars.${key}.score is missing or not a number`
    }
    if (typeof pillar.rationale !== 'string' || pillar.rationale.length === 0) {
      return `pillars.${key}.rationale is missing or not a non-empty string`
    }
    const max = FABLE5_PILLAR_MAX[key]
    if (pillar.score < 0 || pillar.score > max) {
      return `pillars.${key}.score (${pillar.score}) is outside the declared range 0-${max}`
    }
    pillarSum += pillar.score
  }

  if (Math.abs(pillarSum - parsed.etho_score) > FABLE5_PILLAR_SUM_TOLERANCE) {
    return `pillar scores sum to ${pillarSum} but etho_score is ${parsed.etho_score} (inconsistent with the prompt's "total is the sum of the four pillars" requirement)`
  }

  return null
}

export async function scoreApplication(
  form: ApplicationForm,
  options: ScoreApplicationOptions = {}
): Promise<ScoreApplicationResult> {
  const promptVersion = options.promptVersion ?? (PromptV1.PROMPT_VERSION as PromptVersion)
  const model = options.model ?? getScoringModel()
  assertModelPromptCompatible(model, promptVersion)
  const systemPrompt = PROMPTS[promptVersion].systemPrompt
  const userPrompt = buildUserPrompt(form)

  const validate: ParseValidator = promptVersion === PromptV2.PROMPT_VERSION ? validateFable5Shape : () => null
  const { parsed, rawResponse, modelResponded, validationFallback } = await requestAndParse(model, systemPrompt, userPrompt, validate)

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
