import { F, riskLevelColor, pillCss, type RiskLevel } from './styles'

export type ExplainabilityStatus = 'explainable' | 'fallback' | 'structured' | 'legacy'

// EU AI Act explainability status for a given score. Four states, in
// descending order of explainability:
// - 'explainable': a REAL Fable 5 assessment — prompt_version ===
//   '2.0.0-fable5' AND its pillars were actually parsed out of
//   raw_response (not just claimed by the prompt_version field). Full
//   pillar rationale, key factors, and grounded counterfactuals available.
// - 'fallback': same as above, but a validation_fallback occurred during
//   scoring — provenance recorded, but review before relying on it.
// - 'structured': the deterministic engine's score_pillars is populated,
//   but there's no Fable 5 narrative assessment. This is the case Finding
//   2 caught: score_pillars alone is NOT the same evidence as a parsed
//   Fable 5 assessment (see CLAUDE.md "Two unrelated v2 modules" — they
//   are never merged), so it must not earn the green "AI Act Ready" label.
// - 'legacy': v1 prompt, no structured pillar data of any kind.
const STATUS_CONFIG: Record<ExplainabilityStatus, { label: string; risk: RiskLevel; detail: string }> = {
  explainable: {
    label: 'Explainable — AI Act Ready',
    risk: 'low',
    detail: 'A structured engine assessment was parsed: pillar rationale, key factors, and grounded counterfactuals available.',
  },
  fallback: {
    label: 'Explainable — Degraded',
    risk: 'medium',
    detail: 'A validation fallback occurred during scoring. Provenance recorded, but review before relying on this record.',
  },
  structured: {
    label: 'Structured — No Narrative',
    risk: 'medium',
    detail: 'Deterministic pillar scores (score_pillars) are available, but no structured narrative assessment or counterfactual guidance exists for this record.',
  },
  legacy: {
    label: 'Legacy — Narrative Only',
    risk: 'neutral',
    detail: 'Scored under prompt v1. No structured pillar breakdown or counterfactual guidance.',
  },
}

export function ExplainabilityBadge({ status }: { status: ExplainabilityStatus }) {
  const cfg = STATUS_CONFIG[status]
  const color = riskLevelColor(cfg.risk)

  return (
    <div style={{ ...pillCss(color), padding: '6px 12px' }} title={cfg.detail}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: F.sans, fontSize: 12, fontWeight: 600, color, letterSpacing: '0.02em' }}>
        {cfg.label}
      </span>
    </div>
  )
}

// Derives status from fields on a `scores` row PLUS whether the caller
// actually succeeded in parsing a Fable 5 assessment out of raw_response
// (fable5PillarsParsed) — this must come from the same parse the page
// already does to build the pillar table, not be re-derived from
// prompt_version alone. A row can claim prompt_version === '2.0.0-fable5'
// while raw_response is malformed/unparseable; that must NOT earn the
// green badge, since there's no actual structured evidence to back it.
//
// `validation_fallback` is NOT persisted on `scores` itself (confirmed:
// not in the table's column list) — it only exists in the
// `ethoscore_assessed` event's metadata on `workflow_events`. Callers that
// want the 'fallback' state to actually trigger must look that event up
// separately and pass its flag in; omitting it just means this can only
// resolve to 'explainable', 'structured', or 'legacy'.
export function deriveExplainabilityStatus(score: {
  prompt_version: string | null
  score_pillars: unknown
  fable5PillarsParsed: boolean
  validation_fallback?: boolean | null
}): ExplainabilityStatus {
  if (score.prompt_version === '2.0.0-fable5' && score.fable5PillarsParsed) {
    return score.validation_fallback ? 'fallback' : 'explainable'
  }
  if (score.score_pillars) return 'structured'
  return 'legacy'
}
