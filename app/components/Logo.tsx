'use client'
/**
 * EthosFi — Logo
 * ------------------------------------------------------------------
 * Single wordmark, chosen from three proposals compared on the now-
 * removed /logo-preview page (see git history for the other two).
 * Replaces the improvised, inconsistent logos previously hand-rolled
 * per screen (dashboard header, /login, /apply, /demo, /backtest,
 * landing page, /score/[id], /lender/dashboard — each had its own
 * copy-pasted SVG + DM Serif Display text).
 *
 * Built on lib/design-system/tokens-light.ts values by default — no
 * hard-coded colors or fonts. Sharp-edged accent square with a
 * precision notch (no rounded corners, no gradient — "sharp edges
 * signal precision"), beside an Inter semibold wordmark.
 *
 * Color overrides: several screens (login, apply, demo, backtest, the
 * landing page, score/[id], lender/dashboard) are still on the old dark
 * hardcoded palette (Screen 4 and others — out of scope for the
 * tokens-light restyle so far). Rendering the default tokens-light
 * colors there would be illegible (dark navy text on a near-black
 * background), so those call sites pass `textColor`/`notchColor` to
 * keep the identical mark/wordmark legible on a dark surface, rather
 * than inventing a different logo per screen. `accentColor` defaults
 * to the same blue everywhere — that's the one color that should never
 * change between light and dark surfaces.
 */
import React from 'react'
import { color as C, fontFamily as F, fontWeight as FW } from '../../lib/design-system/tokens-light'

export type LogoSize = 'sm' | 'md' | 'lg'

const SIZES: Record<LogoSize, { fontSize: number; height: number; markSize: number; gap: number; tracking: string }> = {
  sm: { fontSize: 14, height: 22, markSize: 18, gap: 6, tracking: '0.02em' },
  md: { fontSize: 20, height: 30, markSize: 26, gap: 8, tracking: '0.01em' },
  lg: { fontSize: 32, height: 46, markSize: 40, gap: 12, tracking: '0em' },
}

// Rough per-character width factor for Inter Semibold at 1px font-size,
// used only to size the SVG viewBox — approximate, not kerned.
const CHAR_WIDTH = 0.62

export type LogoProps = {
  size?: LogoSize
  /** Wordmark text color. Defaults to tokens-light textPrimary (dark navy) — pass a light color on a dark surface. */
  textColor?: string
  /** Notch color — should match the surface the mark sits on. Defaults to tokens-light background (white). */
  notchColor?: string
  /** Mark square color. Defaults to tokens-light accent — keep this the same blue on every surface. */
  accentColor?: string
}

export function Logo({ size = 'md', textColor, notchColor, accentColor }: LogoProps) {
  const s = SIZES[size]
  const wordWidth = 'ETHOSFI'.length * s.fontSize * CHAR_WIDTH
  const width = s.markSize + s.gap + wordWidth
  const notch = s.markSize * 0.34
  const markY = (s.height - s.markSize) / 2
  const accent = accentColor ?? C.accent
  const text = textColor ?? C.textPrimary
  const notchFill = notchColor ?? C.background

  return (
    <svg width={width} height={s.height} viewBox={`0 0 ${width} ${s.height}`} role="img" aria-label="EthosFi">
      <rect x={0} y={markY} width={s.markSize} height={s.markSize} fill={accent} />
      {/* precision notch — sharp diagonal cut, not a rounded/gradient flourish */}
      <polygon
        points={`${s.markSize - notch},${markY} ${s.markSize},${markY} ${s.markSize},${markY + notch}`}
        fill={notchFill}
      />
      <text
        x={s.markSize + s.gap} y={s.height / 2} dominantBaseline="middle" textAnchor="start"
        fontFamily={F.sans} fontSize={s.fontSize} fontWeight={FW.semibold}
        letterSpacing={s.tracking} fill={text}
      >
        ETHOSFI
      </text>
    </svg>
  )
}

export default Logo
