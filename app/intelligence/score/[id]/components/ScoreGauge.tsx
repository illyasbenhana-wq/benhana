import { colors, font, mapRiskBandToLevel } from '../../../../../lib/intelligence/tokens'

const BAND_LABEL: Record<string, string> = {
  very_low: 'Very Low Risk',
  low: 'Low Risk',
  moderate: 'Moderate Risk',
  medium: 'Medium Risk',
  elevated: 'Elevated Risk',
  high: 'High Risk',
}

// Data-focused, not celebratory: thin 4px stroke (vs. the consumer /score
// page's 8px), no countUp scale animation, no glow. The ring communicates
// "measurement instrument," not "achievement unlocked."
export function ScoreGauge({ score, max, riskBand }: { score: number; max: number; riskBand: string }) {
  const level = mapRiskBandToLevel(riskBand)
  const c = colors.risk[level]
  const pct = Math.max(0, Math.min(100, (score / max) * 100))
  const circumference = 264 // 2 * PI * r(42), matches viewBox below

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke={colors.bg.inset} strokeWidth="4" />
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke={c.fg} strokeWidth="4" strokeLinecap="butt"
            strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: font.mono, fontSize: 22, fontWeight: 600, color: colors.text.primary }}>
            {score}
          </span>
        </div>
      </div>

      <div>
        <div style={{ fontFamily: font.body, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.text.tertiary, marginBottom: 4 }}>
          EthoScore
        </div>
        <div style={{ fontFamily: font.mono, fontSize: 13, color: colors.text.secondary, marginBottom: 6 }}>
          {score} <span style={{ color: colors.text.disabled }}>/ {max}</span>
        </div>
        <div
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '3px 9px', borderRadius: 3,
            background: c.bg, border: `1px solid ${c.border}`,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.fg }} />
          <span style={{ fontFamily: font.body, fontSize: 11.5, fontWeight: 600, color: c.fg }}>
            {BAND_LABEL[riskBand] ?? riskBand}
          </span>
        </div>
      </div>
    </div>
  )
}
