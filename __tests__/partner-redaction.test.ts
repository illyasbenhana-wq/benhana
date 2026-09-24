import { describe, it, expect } from 'vitest'
import {
  PARTNER_MODEL_LABEL,
  toPartnerModelVersion,
  redactPartnerMetadata,
  redactPartnerEvents,
} from '../lib/partner-redaction'

const VENDOR_PATTERN = /claude|anthropic|opus|sonnet|haiku|fable/i

describe('toPartnerModelVersion', () => {
  it('maps real model identifiers to the EthosFi label', () => {
    for (const id of ['claude-opus-4-8', 'claude-sonnet-5', 'claude-fable-5', 'some-future-model']) {
      expect(toPartnerModelVersion(id)).toBe(PARTNER_MODEL_LABEL)
    }
  })

  it('keeps mock-v1 so sandbox mock scores stay recognizable', () => {
    expect(toPartnerModelVersion('mock-v1')).toBe('mock-v1')
  })

  it('never returns null/empty for missing values', () => {
    expect(toPartnerModelVersion(null)).toBe(PARTNER_MODEL_LABEL)
    expect(toPartnerModelVersion(undefined)).toBe(PARTNER_MODEL_LABEL)
    expect(toPartnerModelVersion('')).toBe(PARTNER_MODEL_LABEL)
  })
})

describe('redactPartnerMetadata', () => {
  // Shape of the real 'ethoscore_assessed' payload
  // (lib/scoring-engine.ts buildEthoscoreAssessedPayload)
  const assessed = {
    scoreId: 's1',
    etho_score: 76,
    risk_band: 'low',
    prompt_version: '2.0.0-fable5',
    model_requested: 'claude-fable-5',
    model_responded: 'claude-opus-4-8',
    confidence_overall: 'high',
    validation_fallback: false,
    fable5_assessment: { pillars: {} },
  }

  it('strips every model-identifying key and keeps the rest', () => {
    const out = redactPartnerMetadata(assessed)
    expect(out).toEqual({
      scoreId: 's1',
      etho_score: 76,
      risk_band: 'low',
      confidence_overall: 'high',
      validation_fallback: false,
    })
    expect(JSON.stringify(out)).not.toMatch(VENDOR_PATTERN)
  })

  it('does not mutate the stored metadata object', () => {
    const copy = structuredClone(assessed)
    redactPartnerMetadata(assessed)
    expect(assessed).toEqual(copy)
  })

  it('handles null/undefined', () => {
    expect(redactPartnerMetadata(null)).toEqual({})
    expect(redactPartnerMetadata(undefined)).toEqual({})
  })
})

describe('redactPartnerEvents', () => {
  it('redacts metadata on every event and tolerates null', () => {
    const events = [
      { id: 'e1', event_type: 'ethoscore_assessed', metadata: { model_responded: 'claude-opus-4-8', scoreId: 's1' } },
      { id: 'e2', event_type: 'status_change', metadata: null },
    ]
    const out = redactPartnerEvents(events)
    expect(out[0].metadata).toEqual({ scoreId: 's1' })
    expect(out[1].metadata).toEqual({})
    expect(JSON.stringify(out)).not.toMatch(VENDOR_PATTERN)
    expect(redactPartnerEvents(null)).toEqual([])
  })
})
