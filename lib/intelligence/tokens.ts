// Shared design tokens for the /intelligence/* institutional layer.
// Imported by all four views (score, case, audit, entity) so the design
// language stays one system, not four independent ones. Plain constants,
// not Tailwind — this codebase styles with inline style objects (see
// app/score/[id]/page.tsx), so these are consumed the same way:
//   style={{ background: colors.bg.canvas, color: colors.text.primary }}

// ── Color system ──
// Deep navy/charcoal, never pure black — distinguishes this from the
// consumer-facing /score page (#0a0a0f) and from generic dark-mode admin
// panels (#000/#111).
export const colors = {
  bg: {
    canvas: '#0b0e14',   // page background
    surface: '#11151d',  // card/table background
    raised: '#161b25',   // nested/hover surface
    inset: '#0e1119',    // wells, code blocks, track backgrounds
  },
  border: {
    default: '#232a38',
    subtle: '#1a1f2a',
    strong: '#333d52',
  },
  text: {
    primary: '#e4e8f1',
    secondary: '#9aa5b8',
    tertiary: '#5f6b80',
    disabled: '#3d4657',
  },
  // Risk system: exactly three states, used consistently for risk_band,
  // confidence, and status badges across all four views. Not decorative —
  // the same red/amber/green mapping must mean the same thing everywhere.
  risk: {
    high:   { fg: '#f0645a', bg: '#2a1414', border: '#4a2320' },  // red
    medium: { fg: '#e0a638', bg: '#2a2213', border: '#4a3d1e' },  // amber
    low:    { fg: '#3ecf8e', bg: '#122a20', border: '#1e4a37' },  // green
    neutral:{ fg: '#7c8698', bg: '#161b25', border: '#232a38' }, // no signal / n/a
  },
  accent: {
    primary: '#4a7dff',   // links, focus states, primary actions — used sparingly
  },
} as const

export type RiskLevel = keyof typeof colors.risk

// risk_band values in this codebase are 'low' | 'medium' | 'high' (5-value
// Fable 5 bands are normalized before display — see mapRiskBandToLevel).
export function mapRiskBandToLevel(band: string): RiskLevel {
  if (band === 'low' || band === 'very_low') return 'low'
  if (band === 'medium' || band === 'moderate') return 'medium'
  if (band === 'high' || band === 'elevated') return 'high'
  return 'neutral'
}

// ── Typography ──
// Monospace for anything an investigator might need to compare
// character-for-character (IDs, hashes, scores, timestamps, model names).
// Serif for headers — signals "report", not "dashboard widget".
export const font = {
  mono: '"IBM Plex Mono", "SF Mono", Consolas, monospace',
  serif: '"DM Serif Display", Georgia, serif',
  body: '"DM Sans", -apple-system, sans-serif',
} as const

export const type = {
  pageTitle:   { fontFamily: font.serif, fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em' },
  sectionLabel:{ fontFamily: font.body, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: colors.text.tertiary },
  tableHeader: { fontFamily: font.body, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const, color: colors.text.tertiary },
  body:        { fontFamily: font.body, fontSize: 13, lineHeight: 1.55, color: colors.text.secondary },
  mono:        { fontFamily: font.mono, fontSize: 12.5, color: colors.text.primary },
  monoSmall:   { fontFamily: font.mono, fontSize: 11, color: colors.text.tertiary },
  scoreValue:  { fontFamily: font.mono, fontSize: 32, fontWeight: 600 },
} as const

// ── Spacing / density ──
// Tighter than the consumer /score page by design — "high information
// density, data tables not cards" per the brief. Base unit 4px.
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radius = {
  sm: 4,
  md: 6,
  lg: 10,
} as const

// Row height for dense tables (vs. the consumer page's card padding).
export const density = {
  rowHeight: 36,
  rowPaddingX: 12,
  tableFontSize: 12.5,
} as const
