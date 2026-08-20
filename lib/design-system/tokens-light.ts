/**
 * EthosFi Design System — Light Tokens ("Ramp" blanc/bleu)
 * ------------------------------------------------------------------
 * Phase UX-1 visual A/B exploration. This is a parallel light theme
 * used ONLY on feature/ux-1-light-exploration to restyle Screen 1.
 * The dark tokens (./tokens.ts) are untouched and remain the source
 * of truth on feature/ux-1-design-system.
 *
 * Architecture note: mirrors tokens.ts — plain TS constants consumed
 * via inline `style={{}}` objects, no global CSS.
 *
 * Rules encoded here (from the "Ramp" brief):
 *  1. Zero gradient, zero glassmorphism, zero color outside the palette.
 *  2. Hierarchy via size/weight, not color.
 *  3. EthoScore (0–1000) and case-risk (0–100) color logic must never
 *     be mixed — caseRiskColor()'s thresholds are untouched; only its
 *     display colors are remapped to success/warning/danger below.
 */

// ─── Color ──────────────────────────────────────────────────────────
export const color = {
  background: '#FFFFFF',
  surface: '#F8FAFC', // cards, panels
  border: '#E2E8F0',

  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  // No separate "muted" tier in the brief — reuse textSecondary for
  // tertiary text (timestamps/IDs) to stay within the given palette.
  textMuted: '#64748B',

  accent: '#1D4ED8', // CTAs, links, active states
  accentHover: '#1E40AF',
  accentSubtle: '#EFF6FF', // badge backgrounds, hover rows

  // Risk color system (case-risk 0–100 scale only — see caseRiskColor)
  riskHigh: '#DC2626', // danger
  riskMedium: '#D97706', // warning
  riskLow: '#059669', // success
} as const

/**
 * caseRiskColor — maps a CASE RISK score (0–100, higher = more risk) to
 * a display color. Thresholds mirror the dark-theme helper of the same
 * name (lib/design-system/tokens.ts) exactly — only the color values
 * change, to the light palette's success/warning/danger. Do NOT apply
 * to EthoScore (0–1000, higher = better) — that scale runs inverted.
 */
export function caseRiskColor(score: number): string {
  if (score >= 75) return color.riskHigh
  if (score >= 50) return color.riskMedium
  return color.riskLow
}

/**
 * ethoScoreColor — maps an EthoScore (0–1000, higher = BETTER / lower
 * risk) to a display color. This is a DIFFERENT scale running in the
 * OPPOSITE direction from caseRiskColor (0–100, higher = worse) — never
 * call caseRiskColor on an EthoScore value or vice versa.
 *
 * Thresholds are derived from computeRiskBand's actual, unmodified
 * source values — not reinvented here:
 *   - lib/risk-band.ts `computeRiskBand(ethoScore)` (canonical impl,
 *     re-exported from lib/scoring-engine.ts for existing callers):
 *       >=70 'low', >=40 'medium', else 'high' — operates on a 0–100
 *       NORMALIZED scale (see CLAUDE.md: "normalized scale").
 *   - lib/ethoscore-v2.ts:229 `normalized = clamp(Math.round(total / 10), 0, 100)`
 *       confirms normalized = raw EthoScore / 10.
 * So on the raw 0–1000 scale, computeRiskBand's thresholds are
 * 70*10=700 and 40*10=400. 'low' (risk) = success/green (good score),
 * 'high' (risk) = danger/red (poor score) — inverted from case-risk's
 * mapping, where high risk-score also means danger, but here a HIGH
 * ethoScore is what's good.
 */
export function ethoScoreColor(score: number): string {
  if (score >= 700) return color.riskLow
  if (score >= 400) return color.riskMedium
  return color.riskHigh
}

// ─── Typography ─────────────────────────────────────────────────────
// Inter — single family everywhere, per the Ramp brief.
export const fontFamily = {
  sans: 'Inter, system-ui, -apple-system, sans-serif',
  // No serif/mono split in the light brief; numerical values use
  // tabular-nums on the sans family instead of a dedicated mono face.
  mono: 'Inter, system-ui, -apple-system, sans-serif',
  // Display face for institutional headline moments (landing page hero,
  // section headers) — not used in-app on data screens, which stay on
  // fontSize.display/xl above with the sans family. Distinguishes
  // EthosFi's editorial voice from Fortress's all-sans reference.
  display: '"Fraunces", Georgia, serif',
} as const

/** Drop into a <link rel="stylesheet" href={...} /> to load Inter + Fraunces. */
export const googleFontsHref =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap'

export const fontSize = {
  micro: 10,
  xs: 11,
  sm: 13, // brief: small/labels 13px
  base: 15, // brief: body 15px
  md: 16,
  lg: 20, // brief: H3 20px
  xl: 28, // brief: H2 28px
  display: 36, // brief: H1 36px
  gauge: 34,
} as const

export const fontWeight = {
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

export const lineHeight = {
  body: 1.6,
  tight: '-0.01em', // heading tracking per brief
} as const

// Small-caps label style (Inter, letter-spaced, uppercase).
export const smallCaps = {
  fontFamily: fontFamily.sans,
  fontSize: fontSize.micro,
  fontWeight: fontWeight.semibold,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: color.textSecondary,
}

// ─── Radius ─────────────────────────────────────────────────────────
export const radius = {
  none: 0,
  card: 12, // brief: cards radius 12px
  control: 8, // brief: buttons radius 8px
  data: 12, // alias so components mirroring tokens.ts's `R.data` land on the card radius
} as const

// ─── Spacing (px) ───────────────────────────────────────────────────
// Brief scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
export const space = {
  xxs: 4,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const

// ─── Borders ────────────────────────────────────────────────────────
export const borderLine = `1px solid ${color.border}`
export const shadowSm = '0 1px 2px 0 rgba(15, 23, 42, 0.05)' // shadow-sm max, per brief

// Elevation scale beyond shadowSm — for marketing-surface cards/sections
// that need more depth than the brief's data-screen shadow-sm ceiling
// (stat tiles, feature cards, hero panels). Not used on dense data
// screens, which stay flat/bordered per the original brief.
export const shadowMd = '0 4px 16px -4px rgba(15, 23, 42, 0.08), 0 1px 2px 0 rgba(15, 23, 42, 0.04)'
export const shadowLg = '0 16px 40px -12px rgba(15, 23, 42, 0.14), 0 2px 6px -1px rgba(15, 23, 42, 0.05)'

// ─── Motion ─────────────────────────────────────────────────────────
// Brief: 150ms ease, color/background/border/opacity only. No entrance
// or scroll-gadget animation. The dark theme's dataPulse/ringDraw are
// intentionally NOT carried over — the arc still draws once (a precise
// fill, not a bounce) since that motion is structural to the gauge,
// not decorative.
export const transition = 'color 150ms ease, background 150ms ease, border-color 150ms ease, opacity 150ms ease'

export const motion = {
  ringDraw: 'ethosLightRingDraw 1.1s ease-out forwards',
} as const

export const keyframes = `
@keyframes ethosLightRingDraw {
  from { stroke-dashoffset: var(--ethos-ring-circumference, 1000); }
  to { stroke-dashoffset: var(--ethos-ring-offset, 0); }
}
`

// ─── Convenience surface presets ────────────────────────────────────
export const surface = {
  page: { background: color.background, color: color.textPrimary, fontFamily: fontFamily.sans },
  panel: { background: color.surface, border: borderLine },
  card: { background: color.surface, border: borderLine, borderRadius: radius.card, boxShadow: shadowSm },
} as const

export const tokens = {
  color,
  fontFamily,
  googleFontsHref,
  fontSize,
  fontWeight,
  lineHeight,
  smallCaps,
  radius,
  space,
  borderLine,
  shadowSm,
  shadowMd,
  shadowLg,
  transition,
  motion,
  keyframes,
  surface,
  caseRiskColor,
  ethoScoreColor,
}

export default tokens
