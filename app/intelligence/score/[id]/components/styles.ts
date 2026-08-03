// Shared style helpers for the /intelligence/score/[id] panel — on the same
// design system as /score/[id] and /case/[ref] (lib/design-system/tokens-light),
// not the separate dark institutional palette this view used to have.
import type { CSSProperties } from 'react'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  borderLine,
  shadowSm,
  googleFontsHref,
} from '../../../../../lib/design-system/tokens-light'

export { C, F, FS, FW, R, SP, borderLine, shadowSm, googleFontsHref }

export const cardCss: CSSProperties = { background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm }
export const labelCss: CSSProperties = { fontFamily: F.sans, fontSize: FS.micro, fontWeight: FW.semibold, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSecondary }
export const monoCss: CSSProperties = { fontFamily: F.mono, fontVariantNumeric: 'tabular-nums' }

export type RiskLevel = 'low' | 'medium' | 'high' | 'neutral'

// risk_band values in this codebase are 'low' | 'medium' | 'high' (5-value
// Fable 5 bands are normalized before display).
export function mapRiskBandToLevel(band: string): RiskLevel {
  if (band === 'low' || band === 'very_low') return 'low'
  if (band === 'medium' || band === 'moderate') return 'medium'
  if (band === 'high' || band === 'elevated') return 'high'
  return 'neutral'
}

// tokens-light only defines flat risk colors (no neutral) — 'neutral' here
// (no signal / n/a) falls back to textSecondary rather than a risk color.
export function riskLevelColor(level: RiskLevel): string {
  if (level === 'low') return C.riskLow
  if (level === 'medium') return C.riskMedium
  if (level === 'high') return C.riskHigh
  return C.textSecondary
}

// Pill badge: accent-tinted background, colored border at reduced alpha,
// colored dot + label — same convention as the risk-band pill on
// /score/[id] and the severity pill on /case/[ref].
export function pillCss(hex: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '3px 10px',
    borderRadius: 20,
    background: C.accentSubtle,
    border: `1px solid ${hex}44`,
  }
}
