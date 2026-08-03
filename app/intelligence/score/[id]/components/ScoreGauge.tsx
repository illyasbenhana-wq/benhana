import { C, F, mapRiskBandToLevel, riskLevelColor, pillCss } from './styles'

const BAND_LABEL: Record<string, string> = {
  very_low: 'Very Low Risk',
  low: 'Low Risk',
  moderate: 'Moderate Risk',
  medium: 'Medium Risk',
  elevated: 'Elevated Risk',
  high: 'High Risk',
}

export function ScoreGauge({ score, max, riskBand }: { score: number; max: number; riskBand: string }) {
  const level = mapRiskBandToLevel(riskBand)
  const bandColor = riskLevelColor(level)
  const pct = Math.max(0, Math.min(100, (score / max) * 100))
  const circumference = 264 // 2 * PI * r(42), matches viewBox below

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="42" fill="none" stroke={C.border} strokeWidth="4" />
          <circle
            cx="50" cy="50" r="42" fill="none"
            stroke={bandColor} strokeWidth="4" strokeLinecap="butt"
            strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: F.mono, fontSize: 22, fontWeight: 600, color: C.textPrimary }}>
            {score}
          </span>
        </div>
      </div>

      <div>
        <div style={{ fontFamily: F.sans, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textSecondary, marginBottom: 4 }}>
          EthoScore
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 13, color: C.textSecondary, marginBottom: 6 }}>
          {score} <span style={{ color: C.textMuted }}>/ {max}</span>
        </div>
        <div style={pillCss(bandColor)}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: bandColor }} />
          <span style={{ fontFamily: F.sans, fontSize: 11.5, fontWeight: 600, color: bandColor }}>
            {BAND_LABEL[riskBand] ?? riskBand}
          </span>
        </div>
      </div>
    </div>
  )
}
