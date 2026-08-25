import { C, F, SP, riskLevelColor } from './styles'
import type { PillarKeyFactor } from './PillarTable'


const DIRECTION_GLYPH: Record<PillarKeyFactor['direction'], string> = {
  positive: '▲',
  negative: '▼',
  neutral: '●',
}

const DIRECTION_LEVEL: Record<PillarKeyFactor['direction'], 'low' | 'high' | 'neutral'> = {
  positive: 'low',   // green
  negative: 'high',  // red
  neutral: 'neutral',
}

// Always-rendered (no accordion/toggle) — institutional users want every
// factor visible on load, not hidden behind a click.
export function FactorList({ factors }: { factors: PillarKeyFactor[] }) {
  if (factors.length === 0) {
    return <p style={{ fontFamily: F.sans, fontSize: 12, color: C.textMuted, margin: 0 }}>No key factors recorded.</p>
  }

  return (
    <div>
      {factors.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: SP.xs, marginTop: i === 0 ? 0 : 4 }}>
          <span style={{ fontFamily: F.mono, fontSize: 11, color: riskLevelColor(DIRECTION_LEVEL[f.direction]), flexShrink: 0 }}>
            {DIRECTION_GLYPH[f.direction]}
          </span>
          <span style={{ fontFamily: F.sans, fontSize: 12, color: C.textSecondary, lineHeight: 1.5 }}>
            <strong style={{ color: C.textPrimary, fontWeight: 600 }}>{f.factor}:</strong> {f.justification}
          </span>
        </div>
      ))}
    </div>
  )
}
