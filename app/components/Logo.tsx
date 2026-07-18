'use client'
/**
 * EthosFi — Logo
 * ------------------------------------------------------------------
 * Signal Field mark (v2) — three points of evidence converging on one
 * illuminated nucleus, beside the Archivo-outlined ETHOSFI wordmark.
 * Replaces the v1 placeholder (sharp accent square + Inter text) that
 * this component drew previously — see git history.
 *
 * Both the symbol and the wordmark are reproduced here as inline SVG
 * geometry/paths taken directly from the delivered asset package
 * (assets/logo-system/svg/logo-horizontal.svg — the primary lockup),
 * scaled uniformly per LogoSize from that file's own proportions
 * (100x100 symbol at 0.64 scale + wordmark group at
 * translate(85.76,51.200) scale(0.05598,-0.05598), composed in a
 * 336.7x64 viewBox). Reusing that exact composition — rather than
 * re-deriving spacing/scale by eye — keeps this in sync with the
 * approved lockup asset. The wordmark is outlined to vector paths in
 * the source asset, so no font install/load is needed to render it.
 *
 * Built on lib/design-system/tokens-light.ts values by default — no
 * hard-coded colors. Symbol stroke/node colors (light slate tones)
 * are legible on both the white light-system background and the
 * still-dark screens (login/apply/demo/backtest/lender-dashboard)
 * pending their §12 unification, so they're intentionally constant
 * rather than swapped per-surface.
 *
 * Color overrides: several screens are still on the old dark
 * hardcoded palette. Rendering the default tokens-light textPrimary
 * (dark navy) there would be illegible, so those call sites pass
 * `textColor` for the wordmark. `accentColor` (nucleus fill) defaults
 * to the same blue everywhere — that's the one color that should
 * never change between light and dark surfaces. `notchColor` is kept
 * in the prop signature only for call-site compatibility (the v1 mark
 * had a punched notch that needed a matching background fill; the
 * Signal Field mark has no such cutout, so this prop is now a no-op).
 */
import React from 'react'
import { color as C } from '../../lib/design-system/tokens-light'

export type LogoSize = 'sm' | 'md' | 'lg'

// Row heights for the lockup — the same three heights the v1 mark used,
// preserved so existing layouts (header spacing, etc.) don't shift.
const HEIGHTS: Record<LogoSize, number> = { sm: 22, md: 30, lg: 46 }

// Reference lockup geometry, from assets/logo-system/svg/logo-horizontal.svg
// (a 336.7 x 64 composition). Scaled uniformly by k = desiredHeight / 64.
const LOCKUP_HEIGHT = 64
const LOCKUP_WIDTH = 336.7
const WORDMARK_TX = 85.76
const WORDMARK_TY = 51.2
const WORDMARK_SCALE = 0.05598

const WORDMARK_PATHS = [
  'M76 0V686H611V575H206V406H567V295H206V111H617V0Z',
  'M244 0V574H25V686H594V574H374V0Z',
  'M76 0V686H206V407H526V686H656V0H526V295H206V0Z',
  'M391 -12Q284 -12 206.0 26.5Q128 65 86.5 144.0Q45 223 45 343Q45 464 86.5 542.5Q128 621 206.0 659.5Q284 698 391 698Q499 698 576.5 659.5Q654 621 695.5 542.5Q737 464 737 343Q737 223 695.5 144.0Q654 65 576.5 26.5Q499 -12 391 -12ZM391 98Q443 98 482.5 113.0Q522 128 549.0 157.5Q576 187 590.0 230.5Q604 274 604 331V353Q604 411 590.0 455.0Q576 499 549.0 528.5Q522 558 482.5 573.0Q443 588 391 588Q339 588 299.5 573.0Q260 558 233.0 528.5Q206 499 192.5 455.0Q179 411 179 353V331Q179 274 192.5 230.5Q206 187 233.0 157.5Q260 128 299.5 113.0Q339 98 391 98Z',
  'M332 -12Q275 -12 223.0 0.5Q171 13 131.0 39.5Q91 66 68.0 105.5Q45 145 45 199Q45 205 45.5 211.0Q46 217 46 220H177Q177 218 176.5 212.5Q176 207 176 203Q176 170 195.0 146.5Q214 123 250.0 110.5Q286 98 335 98Q368 98 393.5 102.0Q419 106 437.5 113.5Q456 121 468.0 131.5Q480 142 485.5 155.0Q491 168 491 183Q491 212 473.0 231.0Q455 250 424.5 263.0Q394 276 355.5 286.5Q317 297 276.5 308.0Q236 319 197.5 334.5Q159 350 128.5 372.0Q98 394 80.0 427.5Q62 461 62 508Q62 556 82.5 592.0Q103 628 140.5 651.5Q178 675 228.0 686.5Q278 698 337 698Q392 698 440.5 686.5Q489 675 526.0 650.5Q563 626 584.0 588.5Q605 551 605 499V487H476V497Q476 526 458.5 546.0Q441 566 409.5 577.0Q378 588 336 588Q291 588 259.0 579.5Q227 571 210.0 554.5Q193 538 193 514Q193 489 211.0 472.0Q229 455 259.5 443.0Q290 431 328.5 421.0Q367 411 407.5 399.5Q448 388 486.5 373.0Q525 358 555.5 335.5Q586 313 604.0 280.0Q622 247 622 201Q622 124 584.5 77.0Q547 30 481.5 9.0Q416 -12 332 -12Z',
  'M76 0V686H569V575H206V391H533V280H206V0Z',
  'M76 0V686H206V0Z',
]
const WORDMARK_PATH_OFFSETS = [0, 692, 1331, 2083, 2885, 3572, 4201]

export type LogoProps = {
  size?: LogoSize
  /** Wordmark text color. Defaults to tokens-light textPrimary (dark navy) — pass a light color on a dark surface. */
  textColor?: string
  /** Unused — kept for call-site compatibility with the v1 mark's punched notch, which the Signal Field symbol has no equivalent of. */
  notchColor?: string
  /** Nucleus fill. Defaults to tokens-light accent — keep this the same blue on every surface. */
  accentColor?: string
}

export function Logo({ size = 'md', textColor, accentColor }: LogoProps) {
  const height = HEIGHTS[size]
  const k = height / LOCKUP_HEIGHT
  const width = LOCKUP_WIDTH * k
  const accent = accentColor ?? C.accent
  const text = textColor ?? C.textPrimary

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="EthosFi">
      {/* Signal Field symbol — three signals converging on the lit nucleus */}
      <g transform={`scale(${k})`}>
        <g stroke="#CBD5E1" strokeWidth={2.2} strokeLinecap="round">
          <line x1={50} y1={50} x2={50} y2={18} />
          <line x1={50} y1={50} x2={23} y2={66} />
          <line x1={50} y1={50} x2={77} y2={66} />
        </g>
        <g fill="#64748B">
          <circle cx={50} cy={18} r={4.6} />
          <circle cx={23} cy={66} r={4.6} />
          <circle cx={77} cy={66} r={4.6} />
        </g>
        <circle cx={50} cy={50} r={10.5} fill={accent} />
      </g>
      {/* Wordmark — outlined vector paths, no font load required */}
      <g transform={`translate(${WORDMARK_TX * k},${WORDMARK_TY * k}) scale(${WORDMARK_SCALE * k},${-WORDMARK_SCALE * k})`} fill={text}>
        {WORDMARK_PATHS.map((d, i) => (
          <path key={i} transform={`translate(${WORDMARK_PATH_OFFSETS[i]},0)`} d={d} />
        ))}
      </g>
    </svg>
  )
}

export default Logo
