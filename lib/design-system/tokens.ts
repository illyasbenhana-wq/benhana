/**
 * EthosFi Design System — Token Source of Truth
 * ------------------------------------------------------------------
 * Phase UX-1 product identity. Every screen derives its visual
 * language from this file. Do not hard-code hex values or font
 * families in components — import from here.
 *
 * Architecture note: the app styles with inline `style={{}}` objects
 * (no global CSS, no CSS modules), so tokens are exported as plain
 * TS constants. Keyframe/animation CSS that must live in a <style>
 * block is exported as string constants (`keyframes`) for components
 * to inject once.
 *
 * Design rules encoded here (from the brief):
 *  1. No gradients — flat surfaces only.
 *  2. Sharp edges on data surfaces (radius 0–2px max).
 *  3. Amber is precious — reserve `color.amber` for the single most
 *     important thing on a screen.
 *  4. Monospace for anything numerical/machine-generated.
 *  5. Density over emptiness.
 *  6. Motion is intelligence: only `dataPulse` (live metrics) and
 *     `ringDraw` (score gauge first render) are allowed.
 */

// ─── Color ──────────────────────────────────────────────────────────
export const color = {
  // Surfaces (deep navy, never pure black)
  midnight: '#0A0E1A', // primary background
  graphite: '#141824', // panel / surface background
  slate: '#1E2433', // card / component background
  border: '#2A3347', // subtle borders and dividers

  // Text (warm white, never pure white)
  textPrimary: '#E8ECF4',
  textSecondary: '#8892A4', // labels, secondary text
  textMuted: '#4A5568', // timestamps, IDs, tertiary

  // Signature accent — Ethos Amber (use sparingly)
  amber: '#F59E0B',
  amberDim: '#92400E', // amber alert surfaces / backgrounds

  // Risk color system
  riskHigh: '#EF4444', // institutional red
  riskMedium: '#F59E0B', // amber (shares with signature)
  riskLow: '#10B981', // institutional green

  // Intelligence accent
  ice: '#38BDF8', // confidence indicators, positive signals
  iceDim: '#0C4A6E', // ice-blue backgrounds
} as const

/**
 * caseRiskColor — maps a CASE RISK score to a risk color.
 *
 * ⚠️ Scale: applies ONLY to the 0–100 case-risk scale used by the
 * analyst case queue, where HIGHER = MORE RISK (e.g. 89 = critical).
 * NEVER apply this to EthoScore values (0–1000, where HIGHER = BETTER /
 * lower risk) — the two scales run in opposite directions. If Screen 3
 * needs an EthoScore color mapping, add a separate, explicitly named
 * function (e.g. `ethoScoreColor`); do not reuse this one.
 *
 * Thresholds (>=75 high/red, >=50 medium/amber, else low/green) mirror
 * the existing dashboard helper `riskColor()` in app/dashboard/page.tsx
 * (lines 197–201) — the case-risk scale.
 *
 * Deliberately NOT derived from `computeRiskBand` (lib/scoring-engine.ts,
 * lines 4–8), which grades EthoScore on the inverted scale
 * (`>=70 low, >=40 medium, else high`, i.e. higher = lower risk).
 * Copying those thresholds here would invert the color mapping, so the
 * two are kept separate.
 */
export function caseRiskColor(score: number): string {
  if (score >= 75) return color.riskHigh
  if (score >= 50) return color.riskMedium
  return color.riskLow
}

// ─── Typography ─────────────────────────────────────────────────────
// IBM Plex — designed for financial/technical interfaces. Loaded via
// Google Fonts using the existing <link> pattern in the app.
export const fontFamily = {
  // Display / headers — institutional gravitas
  serif: '"IBM Plex Serif", Georgia, "Times New Roman", serif',
  // Body / UI — technical clarity, high legibility
  sans: '"IBM Plex Sans", system-ui, -apple-system, sans-serif',
  // Data / IDs / scores / timestamps / hashes / model names
  mono: '"IBM Plex Mono", "SF Mono", Menlo, Consolas, monospace',
} as const

/** Drop into a <link rel="stylesheet" href={...} /> to load IBM Plex. */
export const googleFontsHref =
  'https://fonts.googleapis.com/css2?' +
  'family=IBM+Plex+Sans:wght@300;400;500;600;700&' +
  'family=IBM+Plex+Serif:ital,wght@0,400;0,500;0,600;1,400&' +
  'family=IBM+Plex+Mono:wght@400;500;600&display=swap'

// Type scale (px). Dense institutional UI — restrained sizes.
export const fontSize = {
  micro: 10, // small-caps labels, tags
  xs: 11, // secondary labels, IDs
  sm: 12, // dense body, table cells
  base: 14, // body / UI default
  md: 16, // section text, brand mark
  lg: 20, // sub-headers
  xl: 26, // panel headers
  display: 36, // screen titles
  gauge: 34, // score value inside the precision gauge
} as const

export const fontWeight = {
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

// Small-caps label style (IBM Plex Sans, letter-spaced, uppercase).
export const smallCaps = {
  fontFamily: fontFamily.sans,
  fontSize: fontSize.micro,
  fontWeight: fontWeight.semibold,
  letterSpacing: '0.12em',
  textTransform: 'uppercase' as const,
  color: color.textSecondary,
}

// ─── Radius ─────────────────────────────────────────────────────────
// Sharp edges signal precision. Data surfaces: 0 or 2px max.
export const radius = {
  none: 0,
  data: 2, // max for anything containing data
  control: 4, // buttons / inputs only
} as const

// ─── Spacing (px) ───────────────────────────────────────────────────
// Space separates, it does not decorate. 4px base grid.
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

// ─── Borders ────────────────────────────────────────────────────────
export const borderLine = `1px solid ${color.border}`

// ─── Motion ─────────────────────────────────────────────────────────
// Only two animations are permitted. Nothing bounces.
export const motion = {
  // Slow data-pulse on live metrics (2s cycle, subtle opacity change).
  dataPulse: 'ethosDataPulse 2s ease-in-out infinite',
  // Line-draw fill on risk score rings on first load (precise meter fill).
  ringDraw: 'ethosRingDraw 1.1s ease-out forwards',
} as const

/**
 * Keyframes for the permitted animations. Inject once per screen via a
 * <style dangerouslySetInnerHTML={{ __html: keyframes }} /> block
 * (the app already uses this pattern for inline animations).
 */
export const keyframes = `
@keyframes ethosDataPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes ethosRingDraw {
  from { stroke-dashoffset: var(--ethos-ring-circumference, 1000); }
  to { stroke-dashoffset: var(--ethos-ring-offset, 0); }
}
`

// ─── Convenience surface presets ────────────────────────────────────
// Common flat surfaces so screens stay consistent (no gradients).
export const surface = {
  page: { background: color.midnight, color: color.textPrimary, fontFamily: fontFamily.sans },
  panel: { background: color.graphite, border: borderLine },
  card: { background: color.slate, border: borderLine, borderRadius: radius.data },
} as const

export const tokens = {
  color,
  fontFamily,
  googleFontsHref,
  fontSize,
  fontWeight,
  smallCaps,
  radius,
  space,
  borderLine,
  motion,
  keyframes,
  surface,
  caseRiskColor,
}

export default tokens
