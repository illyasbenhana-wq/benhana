import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ApplicationForm } from '@/types'

// Mock the Anthropic SDK so no real network call happens. `create` is a
// vi.fn() we reprogram per test via mockResolvedValueOnce chains.
// vi.hoisted() so mockCreate exists before the vi.mock factory (hoisted
// above imports) runs — scoring-engine.ts calls `new Anthropic()` at
// module-load time.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

// Imported after the mock so scoring-engine.ts's `new Anthropic()` picks it up.
import {
  scoreApplication,
  getScoringModel,
  DEFAULT_MODEL,
  buildEthoscoreAssessedPayload,
} from '../lib/scoring-engine'
import { PROMPT_VERSION as V1 } from '../lib/prompts/ethoscore-v1'
import { PROMPT_VERSION as FABLE5 } from '../lib/prompts/ethoscore-llm-v2'

const FORM: ApplicationForm = {
  full_name: 'Ada Lovelace',
  email: 'ada@example.com',
  monthly_income: 3000,
  employment_type: 'employed',
  employer_name: 'Analytical Engines Ltd',
  months_at_current_job: 24,
  rent_months_paid: 18,
  rent_monthly_amount: 900,
  gig_platforms: [],
  gig_monthly_avg: 0,
  savings_amount: 5000,
  loan_amount: 10000,
  loan_purpose: 'debt_consolidation',
  loan_term_months: 24,
  consent_data_use: true,
  consent_ai_decision: true,
}

function textResponse(model: string, text: string) {
  return { model, content: [{ type: 'text', text }] }
}

const VALID_V1_JSON = JSON.stringify({
  etho_score: 72,
  recommendation: 'approve',
  ai_summary: 'Strong applicant.',
  factors: [{ name: 'Rent', weight: 100, score: 90, rationale: 'Consistent.' }],
})

const VALID_FABLE5_JSON = JSON.stringify({
  etho_score: 820,
  risk_band: 'very_low',
  confidence_overall: 'high',
  summary: 'Strong SME.',
  pillars: {
    trust: { score: 270, confidence: 'high', rationale: 'Verified.', key_factors: [] },
    track_record: { score: 280, confidence: 'high', rationale: 'Clean history.', key_factors: [] },
    financial_health: { score: 180, confidence: 'medium', rationale: 'Healthy.', key_factors: [] },
    esg_alignment: { score: 90, confidence: 'low', rationale: 'Limited data.', key_factors: [] },
  },
  adverse_action_reasons: [],
  counterfactuals: [],
  data_gaps: [],
  compliance_flags: [],
})

describe('getScoringModel', () => {
  const originalEnv = process.env.ETHOSCORE_MODEL

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ETHOSCORE_MODEL
    else process.env.ETHOSCORE_MODEL = originalEnv
  })

  it('defaults to claude-opus-4-8 when ETHOSCORE_MODEL is unset', () => {
    delete process.env.ETHOSCORE_MODEL
    expect(getScoringModel()).toBe(DEFAULT_MODEL)
    expect(DEFAULT_MODEL).toBe('claude-opus-4-8')
  })

  it('reads ETHOSCORE_MODEL when set', () => {
    process.env.ETHOSCORE_MODEL = 'claude-fable-5'
    expect(getScoringModel()).toBe('claude-fable-5')
  })
})

describe('scoreApplication — model resolution', () => {
  const originalEnv = process.env.ETHOSCORE_MODEL

  beforeEach(() => {
    mockCreate.mockReset()
  })

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ETHOSCORE_MODEL
    else process.env.ETHOSCORE_MODEL = originalEnv
  })

  it('uses DEFAULT_MODEL when no option and no env var are set', async () => {
    delete process.env.ETHOSCORE_MODEL
    mockCreate.mockResolvedValueOnce(textResponse(DEFAULT_MODEL, VALID_V1_JSON))

    await scoreApplication(FORM)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0].model).toBe(DEFAULT_MODEL)
  })

  it('uses ETHOSCORE_MODEL env var when set and no option override', async () => {
    process.env.ETHOSCORE_MODEL = 'claude-sonnet-5'
    mockCreate.mockResolvedValueOnce(textResponse('claude-sonnet-5', VALID_V1_JSON))

    await scoreApplication(FORM)

    expect(mockCreate.mock.calls[0][0].model).toBe('claude-sonnet-5')
  })

  it('per-call options.model overrides the env var', async () => {
    process.env.ETHOSCORE_MODEL = 'claude-sonnet-5'
    mockCreate.mockResolvedValueOnce(textResponse('claude-fable-5', VALID_FABLE5_JSON))

    await scoreApplication(FORM, { model: 'claude-fable-5', promptVersion: FABLE5 })

    expect(mockCreate.mock.calls[0][0].model).toBe('claude-fable-5')
  })

  it('defaults promptVersion to v1', async () => {
    delete process.env.ETHOSCORE_MODEL
    mockCreate.mockResolvedValueOnce(textResponse(DEFAULT_MODEL, VALID_V1_JSON))

    const { promptVersion } = await scoreApplication(FORM)

    expect(promptVersion).toBe(V1)
  })
})

describe('scoreApplication — defensive JSON parsing', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('parses successfully on the first attempt without retrying', async () => {
    mockCreate.mockResolvedValueOnce(textResponse(DEFAULT_MODEL, VALID_V1_JSON))

    const { result, validationFallback } = await scoreApplication(FORM)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(validationFallback).toBe(false)
    expect(result.etho_score).toBe(72)
  })

  it('retries once with a corrective turn when the first response is malformed JSON', async () => {
    mockCreate
      .mockResolvedValueOnce(textResponse(DEFAULT_MODEL, 'not json at all'))
      .mockResolvedValueOnce(textResponse(DEFAULT_MODEL, VALID_V1_JSON))

    const { result, validationFallback, modelResponded } = await scoreApplication(FORM)

    expect(mockCreate).toHaveBeenCalledTimes(2)
    // Retry call includes the corrective follow-up turn
    const retryCallArgs = mockCreate.mock.calls[1][0]
    expect(retryCallArgs.messages).toHaveLength(3)
    expect(retryCallArgs.messages[2].content).toMatch(/valid JSON/i)
    expect(validationFallback).toBe(false)
    expect(modelResponded).toBe(DEFAULT_MODEL)
    expect(result.etho_score).toBe(72)
  })

  it('falls back to DEFAULT_MODEL and sets validationFallback when both attempts are malformed', async () => {
    process.env.ETHOSCORE_MODEL = 'claude-sonnet-5'
    mockCreate
      .mockResolvedValueOnce(textResponse('claude-sonnet-5', 'still not json'))
      .mockResolvedValueOnce(textResponse('claude-sonnet-5', 'still not json either'))
      .mockResolvedValueOnce(textResponse(DEFAULT_MODEL, VALID_V1_JSON))

    const { result, validationFallback, modelRequested, modelResponded } = await scoreApplication(FORM)

    expect(mockCreate).toHaveBeenCalledTimes(3)
    // First two calls used the originally-requested model
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-sonnet-5')
    expect(mockCreate.mock.calls[1][0].model).toBe('claude-sonnet-5')
    // Third (fallback) call always uses DEFAULT_MODEL regardless of what was requested
    expect(mockCreate.mock.calls[2][0].model).toBe(DEFAULT_MODEL)

    expect(modelRequested).toBe('claude-sonnet-5')
    expect(modelResponded).toBe(DEFAULT_MODEL)
    expect(validationFallback).toBe(true)
    expect(result.etho_score).toBe(72)

    delete process.env.ETHOSCORE_MODEL
  })

  it('throws if the fallback response is also malformed JSON', async () => {
    mockCreate
      .mockResolvedValueOnce(textResponse(DEFAULT_MODEL, 'bad'))
      .mockResolvedValueOnce(textResponse(DEFAULT_MODEL, 'still bad'))
      .mockResolvedValueOnce(textResponse(DEFAULT_MODEL, 'bad again'))

    await expect(scoreApplication(FORM)).rejects.toThrow(/invalid JSON/i)
    expect(mockCreate).toHaveBeenCalledTimes(3)
  })
})

describe('scoreApplication — request shape', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('sends cache_control and max_tokens per spec, and omits temperature (both claude-opus-4-8 and claude-fable-5 reject it as of 2026-08-03)', async () => {
    mockCreate.mockResolvedValueOnce(textResponse(DEFAULT_MODEL, VALID_V1_JSON))

    await scoreApplication(FORM)

    const call = mockCreate.mock.calls[0][0]
    expect(call.temperature).toBeUndefined()
    expect(call.max_tokens).toBe(4096)
    expect(call.system[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('normalizes the fable5 prompt 0-1000 score onto the 0-100 ScoreResult shape', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('claude-fable-5', VALID_FABLE5_JSON))

    const { result, confidenceOverall, fable5Assessment } = await scoreApplication(FORM, {
      promptVersion: FABLE5,
      model: 'claude-fable-5',
    })

    expect(result.etho_score).toBe(82) // 820 / 10
    expect(result.risk_band).toBe('low') // computeRiskBand(82)
    expect(confidenceOverall).toBe('high')
    expect(fable5Assessment).not.toBeNull()
    expect(fable5Assessment!.etho_score).toBe(820) // full 0-1000 scale preserved here
  })
})

describe('buildEthoscoreAssessedPayload', () => {
  it('produces the expected metadata shape for the ethoscore_assessed event', () => {
    const payload = buildEthoscoreAssessedPayload({
      scoreId: 'score-123',
      ethoScore: 72,
      riskBand: 'low',
      promptVersion: V1,
      modelRequested: 'claude-opus-4-8',
      modelResponded: 'claude-opus-4-8',
      confidenceOverall: null,
      validationFallback: false,
      fable5Assessment: null,
    })

    expect(payload).toEqual({
      scoreId: 'score-123',
      etho_score: 72,
      risk_band: 'low',
      prompt_version: V1,
      model_requested: 'claude-opus-4-8',
      model_responded: 'claude-opus-4-8',
      confidence_overall: null,
      validation_fallback: false,
      fable5_assessment: null,
    })
  })

  it('carries validation_fallback: true and the fable5 assessment detail through untouched', () => {
    const fable5Detail = { etho_score: 820, pillars: { trust: { score: 270 } } }
    const payload = buildEthoscoreAssessedPayload({
      scoreId: 'score-456',
      ethoScore: 82,
      riskBand: 'low',
      promptVersion: FABLE5,
      modelRequested: 'claude-fable-5',
      modelResponded: 'claude-opus-4-8', // fell back
      confidenceOverall: 'high',
      validationFallback: true,
      fable5Assessment: fable5Detail,
    })

    expect(payload.validation_fallback).toBe(true)
    expect(payload.model_requested).toBe('claude-fable-5')
    expect(payload.model_responded).toBe('claude-opus-4-8')
    expect(payload.fable5_assessment).toBe(fable5Detail)
  })
})
