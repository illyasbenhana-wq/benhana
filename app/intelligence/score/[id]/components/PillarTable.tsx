import { colors, font, type, space, density, mapRiskBandToLevel } from '../../../../../lib/intelligence/tokens'
import { FactorList } from './FactorList'

export interface PillarKeyFactor {
  factor: string
  direction: 'positive' | 'negative' | 'neutral'
  justification: string
}

export interface PillarDatum {
  key: 'trust' | 'track_record' | 'financial_health' | 'esg_alignment'
  label: string
  score: number
  max: number
  confidence: 'high' | 'medium' | 'low'
  rationale: string
  key_factors: PillarKeyFactor[]
}

// Same three-state risk color system as ExplainabilityBadge — confidence
// isn't risk, but reusing the palette keeps "how much can I trust this
// number" visually consistent across the whole panel rather than
// introducing a second color language.
const CONFIDENCE_LEVEL: Record<PillarDatum['confidence'], 'low' | 'medium' | 'high'> = {
  high: 'low',   // high confidence -> green (maps to risk.low = green)
  medium: 'medium',
  low: 'high',   // low confidence -> red (maps to risk.high = red)
}

function pct(score: number, max: number): number {
  return max > 0 ? Math.round((score / max) * 100) : 0
}

// Row-level bar, colored by the pillar's proportion of its own max — not
// by the risk palette. Density/table treatment: fixed row height, no card
// padding, hover reveals key_factors inline rather than in a modal.
function ProportionBar({ value, max }: { value: number; max: number }) {
  const p = pct(value, max)
  const barColor = p >= 70 ? colors.risk.low.fg : p >= 40 ? colors.risk.medium.fg : colors.risk.high.fg
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: space.sm, minWidth: 140 }}>
      <div style={{ flex: 1, height: 5, background: colors.bg.inset, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: barColor, borderRadius: 2 }} />
      </div>
      <span style={{ ...type.monoSmall, width: 32, textAlign: 'right', color: colors.text.secondary }}>{p}%</span>
    </div>
  )
}

function ConfidenceTag({ confidence }: { confidence: PillarDatum['confidence'] }) {
  const c = colors.risk[CONFIDENCE_LEVEL[confidence]]
  return (
    <span
      style={{
        fontFamily: font.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: c.fg,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 3,
        padding: '2px 6px',
      }}
    >
      {confidence}
    </span>
  )
}

export function PillarTable({ pillars }: { pillars: PillarDatum[] }) {
  return (
    <div style={{ background: colors.bg.surface, border: `1px solid ${colors.border.default}`, borderRadius: 6 }}>
      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '160px 90px 1fr 80px',
          gap: space.md,
          padding: `${space.sm}px ${density.rowPaddingX}px`,
          borderBottom: `1px solid ${colors.border.default}`,
        }}
      >
        <span style={type.tableHeader}>Pillar</span>
        <span style={type.tableHeader}>Score</span>
        <span style={type.tableHeader}>Proportion of Max</span>
        <span style={{ ...type.tableHeader, textAlign: 'right' }}>Confidence</span>
      </div>

      {pillars.map((p, i) => (
        <div key={p.key} style={{ borderBottom: i < pillars.length - 1 ? `1px solid ${colors.border.subtle}` : 'none' }}>
          {/* Summary row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 90px 1fr 80px',
              gap: space.md,
              alignItems: 'center',
              minHeight: density.rowHeight,
              padding: `0 ${density.rowPaddingX}px`,
            }}
          >
            <span style={{ fontFamily: font.body, fontSize: density.tableFontSize, fontWeight: 600, color: colors.text.primary }}>
              {p.label}
            </span>
            <span style={{ ...type.mono, fontSize: density.tableFontSize }}>
              {p.score}<span style={{ color: colors.text.tertiary }}>/{p.max}</span>
            </span>
            <ProportionBar value={p.score} max={p.max} />
            <div style={{ textAlign: 'right' }}>
              <ConfidenceTag confidence={p.confidence} />
            </div>
          </div>

          {/* Rationale + key factors — always expanded (investigation
              surface, not a summary card the analyst has to click into) */}
          <div style={{ padding: `0 ${density.rowPaddingX}px ${space.md}px calc(160px + ${space.md}px)` }}>
            <p style={{ ...type.body, fontSize: 12.5, margin: `0 0 ${space.xs}px`, color: colors.text.secondary }}>
              {p.rationale}
            </p>
            <FactorList factors={p.key_factors} />
          </div>
        </div>
      ))}
    </div>
  )
}

// Adapts a parsed Fable 5 `raw_response` payload (see
// lib/prompts/ethoscore-llm-v2.ts schema) into PillarDatum[]. Kept out of
// the component so PillarTable stays a pure presentational piece.
export function pillarsFromFable5Assessment(assessment: Record<string, any>): PillarDatum[] {
  const order: PillarDatum['key'][] = ['trust', 'track_record', 'financial_health', 'esg_alignment']
  const labels: Record<PillarDatum['key'], string> = {
    trust: 'Trust',
    track_record: 'Track Record',
    financial_health: 'Financial Health',
    esg_alignment: 'ESG Alignment',
  }
  const maxByKey: Record<PillarDatum['key'], number> = {
    trust: 300,
    track_record: 300,
    financial_health: 200,
    esg_alignment: 200,
  }
  return order.map((key) => {
    const p = assessment.pillars?.[key] ?? {}
    return {
      key,
      label: labels[key],
      score: p.score ?? 0,
      max: maxByKey[key],
      confidence: p.confidence ?? 'low',
      rationale: p.rationale ?? '',
      key_factors: p.key_factors ?? [],
    }
  })
}

// Re-exported for callers that need to color a risk_band badge alongside
// this table using the same mapping as the rest of the panel.
export { mapRiskBandToLevel }
