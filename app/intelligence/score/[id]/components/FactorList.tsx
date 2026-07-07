import { colors, font, space } from '../../../../../lib/intelligence/tokens'
import type { PillarKeyFactor } from './PillarTable'

const DIRECTION_GLYPH: Record<PillarKeyFactor['direction'], string> = {
  positive: '▲',
  negative: '▼',
  neutral: '●',
}

const DIRECTION_COLOR: Record<PillarKeyFactor['direction'], string> = {
  positive: colors.risk.low.fg,
  negative: colors.risk.high.fg,
  neutral: colors.text.tertiary,
}

// Always-rendered (no accordion/toggle) — institutional users want every
// factor visible on load, not hidden behind a click. Extracted as its own
// component (rather than left inline in PillarTable) so Views 2/3/4 can
// reuse it anywhere key_factors need to be shown outside a pillar row —
// e.g. the audit trail view, or an anomaly's contributing factors.
export function FactorList({ factors }: { factors: PillarKeyFactor[] }) {
  if (factors.length === 0) {
    return <p style={{ fontFamily: font.body, fontSize: 12, color: colors.text.disabled, margin: 0 }}>No key factors recorded.</p>
  }

  return (
    <div>
      {factors.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: space.xs, marginTop: i === 0 ? 0 : 4 }}>
          <span style={{ fontFamily: font.mono, fontSize: 11, color: DIRECTION_COLOR[f.direction], flexShrink: 0 }}>
            {DIRECTION_GLYPH[f.direction]}
          </span>
          <span style={{ fontFamily: font.body, fontSize: 12, color: colors.text.secondary, lineHeight: 1.5 }}>
            <strong style={{ color: colors.text.primary, fontWeight: 600 }}>{f.factor}:</strong> {f.justification}
          </span>
        </div>
      ))}
    </div>
  )
}
