'use client'
/**
 * EthosFi — Logo
 * ------------------------------------------------------------------
 * Single wordmark component replacing the improvised, inconsistent
 * logos scattered across screens (dashboard header, /login, /apply,
 * /lender/dashboard each hand-rolled their own). Built entirely on
 * lib/design-system/tokens-light.ts — no hard-coded colors or fonts.
 *
 * Renders as an inline SVG (typography-led wordmark, optionally with a
 * minimal geometric mark — no gradients, no icon gimmicks). `variant`
 * selects between the visual-direction proposals compared on
 * /logo-preview; once one is chosen, the others can be deleted and this
 * component collapses to a single rendering path.
 */
import React from 'react'
import { color as C, fontFamily as F, fontWeight as FW } from '../../lib/design-system/tokens-light'

export type LogoVariant = 'mark' | 'weight' | 'rule'
export type LogoSize = 'sm' | 'md' | 'lg'

const SIZES: Record<LogoSize, { fontSize: number; height: number; markSize: number; gap: number; tracking: string; barWidth: number }> = {
  sm: { fontSize: 14, height: 22, markSize: 18, gap: 6, tracking: '0.02em', barWidth: 2 },
  md: { fontSize: 20, height: 30, markSize: 26, gap: 8, tracking: '0.01em', barWidth: 3 },
  lg: { fontSize: 32, height: 46, markSize: 40, gap: 12, tracking: '0em', barWidth: 4 },
}

// Rough per-character width factor for Inter Semibold/Bold at 1px font-size,
// used only to size the SVG viewBox — approximate, not kerned. Fine for a
// wordmark comparison; a chosen variant can be hand-tuned afterward.
const CHAR_WIDTH = 0.62

function textWidth(text: string, fontSize: number, weightFactor = 1) {
  return text.length * fontSize * CHAR_WIDTH * weightFactor
}

export function Logo({ variant = 'mark', size = 'md' }: { variant?: LogoVariant; size?: LogoSize }) {
  const s = SIZES[size]

  if (variant === 'weight') {
    // Proposal 2 — pure wordmark, weight contrast. No mark at all: "ETHOS"
    // bold in textPrimary, "FI" regular in accent. Confidence from
    // typography alone.
    const w1 = textWidth('ETHOS', s.fontSize, 1.05)
    const w2 = textWidth('FI', s.fontSize, 0.95)
    const width = w1 + w2 + 4
    return (
      <svg width={width} height={s.height} viewBox={`0 0 ${width} ${s.height}`} role="img" aria-label="EthosFi">
        <text
          x={0} y={s.height / 2} dominantBaseline="middle" textAnchor="start"
          fontFamily={F.sans} fontSize={s.fontSize} fontWeight={FW.bold}
          letterSpacing={s.tracking} fill={C.textPrimary}
        >
          ETHOS
        </text>
        <text
          x={w1 + 2} y={s.height / 2} dominantBaseline="middle" textAnchor="start"
          fontFamily={F.sans} fontSize={s.fontSize} fontWeight={FW.regular}
          letterSpacing={s.tracking} fill={C.accent}
        >
          FI
        </text>
      </svg>
    )
  }

  if (variant === 'rule') {
    // Proposal 3 — rule-flanked wordmark. A single thin accent bar to the
    // left (the only color in the mark), wide-tracked monochrome text.
    // Restrained, terminal/infrastructure feel.
    const tracked = '0.08em'
    const w = textWidth('ETHOSFI', s.fontSize, 1) * 1.12 // wider tracking needs more room
    const barGap = s.gap
    const width = s.barWidth + barGap + w
    return (
      <svg width={width} height={s.height} viewBox={`0 0 ${width} ${s.height}`} role="img" aria-label="EthosFi">
        <rect x={0} y={s.height * 0.18} width={s.barWidth} height={s.height * 0.64} fill={C.accent} />
        <text
          x={s.barWidth + barGap} y={s.height / 2} dominantBaseline="middle" textAnchor="start"
          fontFamily={F.sans} fontSize={s.fontSize} fontWeight={FW.semibold}
          letterSpacing={tracked} fill={C.textPrimary}
        >
          ETHOSFI
        </text>
      </svg>
    )
  }

  // Proposal 1 (default) — small geometric mark + wordmark. A sharp-edged
  // (no rounded, per the design-system's "sharp edges signal precision"
  // rule carried over from the original brief) square mark in accent,
  // with a cut precision-notch, beside the wordmark.
  const wordWidth = textWidth('ETHOSFI', s.fontSize, 1)
  const width = s.markSize + s.gap + wordWidth
  const notch = s.markSize * 0.34
  return (
    <svg width={width} height={s.height} viewBox={`0 0 ${width} ${s.height}`} role="img" aria-label="EthosFi">
      <rect
        x={0} y={(s.height - s.markSize) / 2} width={s.markSize} height={s.markSize}
        fill={C.accent}
      />
      {/* precision notch — sharp diagonal cut, not a rounded/gradient flourish */}
      <polygon
        points={`
          ${s.markSize - notch},${(s.height - s.markSize) / 2}
          ${s.markSize},${(s.height - s.markSize) / 2}
          ${s.markSize},${(s.height - s.markSize) / 2 + notch}
        `}
        fill={C.background}
      />
      <text
        x={s.markSize + s.gap} y={s.height / 2} dominantBaseline="middle" textAnchor="start"
        fontFamily={F.sans} fontSize={s.fontSize} fontWeight={FW.semibold}
        letterSpacing={s.tracking} fill={C.textPrimary}
      >
        ETHOSFI
      </text>
    </svg>
  )
}

export default Logo
