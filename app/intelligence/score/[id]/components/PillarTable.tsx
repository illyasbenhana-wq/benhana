import { C, F, SP, cardCss, labelCss, monoCss, riskLevelColor, pillCss } from './styles'
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
  high: 'low',   // high confidence -> green
  medium: 'medium',
  low: 'high',   // low confidence -> red
}

function pct(score: number, max: number): number {
  return max > 0 ? Math.round((score / max) * 100) : 0
}

// Row-level bar, colored by the pillar's proportion of its own max — not
// by the confidence palette.
function ProportionBar({ value, max }: { value: number; max: number }) {
  const p = pct(value, max)
  const barColor = p >= 70 ? C.riskLow : p >= 40 ? C.riskMedium : C.riskHigh
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm, minWidth: 140 }}>
      <div style={{ flex: 1, height: 5, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: barColor, borderRadius: 2 }} />
      </div>
      <span style={{ ...monoCss, fontSize: 11, width: 32, textAlign: 'right', color: C.textSecondary }}>{p}%</span>
    </div>
  )
}

function ConfidenceTag({ confidence }: { confidence: PillarDatum['confidence'] }) {
  const color = riskLevelColor(CONFIDENCE_LEVEL[confidence])
  return (
    <span style={{ ...pillCss(color), padding: '2px 8px', color, fontFamily: F.sans, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {confidence}
    </span>
  )
}

export function PillarTable({ pillars }: { pillars: PillarDatum[] }) {
  return (
    <div style={cardCss}>
      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '160px 90px 1fr 80px',
          gap: SP.md,
          padding: `${SP.sm}px ${SP.lg}px`,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span style={{ ...labelCss, fontSize: 11 }}>Pillar</span>
        <span style={{ ...labelCss, fontSize: 11 }}>Score</span>
        <span style={{ ...labelCss, fontSize: 11 }}>Proportion of Max</span>
        <span style={{ ...labelCss, fontSize: 11, textAlign: 'right' }}>Confidence</span>
      </div>

      {pillars.map((p, i) => (
        <div key={p.key} style={{ borderBottom: i < pillars.length - 1 ? `1px solid ${C.border}` : 'none' }}>
          {/* Summary row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 90px 1fr 80px',
              gap: SP.md,
              alignItems: 'center',
              minHeight: 36,
              padding: `0 ${SP.lg}px`,
            }}
          >
            <span style={{ fontFamily: F.sans, fontSize: 12.5, fontWeight: 600, color: C.textPrimary }}>
              {p.label}
            </span>
            <span style={{ ...monoCss, fontSize: 12.5, color: C.textPrimary }}>
              {p.score}<span style={{ color: C.textMuted }}>/{p.max}</span>
            </span>
            <ProportionBar value={p.score} max={p.max} />
            <div style={{ textAlign: 'right' }}>
              <ConfidenceTag confidence={p.confidence} />
            </div>
          </div>

          {/* Rationale + key factors — always expanded (investigation
              surface, not a summary card the analyst has to click into) */}
          <div style={{ padding: `0 ${SP.lg}px ${SP.md}px calc(160px + ${SP.md}px)` }}>
            <p style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 1.55, margin: `0 0 ${SP.xs}px`, color: C.textSecondary }}>
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
