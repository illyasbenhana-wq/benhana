'use client'
/**
 * PrecisionGauge — the EthosFi signature score element.
 *
 * A thin-stroke circular arc that fills clockwise from 0 to the value,
 * with the value printed in IBM Plex Mono at the center and a risk-band
 * label below it in small caps. The arc draws on first render (a precise
 * meter fill via the `ringDraw` keyframe) — it does not bounce.
 *
 * Colors come from the design tokens. By default the ring color is
 * derived from `caseRiskColor` (0–100 case-risk scale, higher = more
 * risk). Pass an explicit `color` to override for other scales (e.g. a
 * future `ethoScoreColor` for EthoScore 0–1000).
 */
import React from 'react'
import { color as tokenColor, fontFamily, motion, caseRiskColor } from '../../lib/design-system/tokens'

export type PrecisionGaugeProps = {
  /** Displayed value (also drives the arc fill unless `fraction` given). */
  value: number
  /** Max of the scale the value sits on (default 100). */
  max?: number
  /** Small-caps label rendered below the value (e.g. "CRITICAL"). */
  label?: string
  /** Ring/label color. Defaults to caseRiskColor(value) on the 0–100 scale. */
  color?: string
  /** Outer diameter in px. */
  size?: number
  /** Arc stroke width in px (thin — precision). */
  strokeWidth?: number
  /** Animate the arc draw on first render. */
  animate?: boolean
  /** Optional caption above the value (e.g. entity name). */
  caption?: string
}

export function PrecisionGauge({
  value,
  max = 100,
  label,
  color,
  size = 116,
  strokeWidth = 5,
  animate = true,
  caption,
}: PrecisionGaugeProps) {
  const ringColor = color ?? caseRiskColor(value)
  const r = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const fraction = Math.max(0, Math.min(1, value / max))
  const targetOffset = circumference * (1 - fraction)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {caption && (
        <div
          style={{
            fontFamily: fontFamily.sans,
            fontSize: 12,
            color: tokenColor.textSecondary,
            textAlign: 'center',
          }}
        >
          {caption}
        </div>
      )}
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={tokenColor.border}
            strokeWidth={strokeWidth}
          />
          {/* Value arc — draws clockwise from top */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
            strokeDasharray={circumference}
            strokeDashoffset={targetOffset}
            style={
              animate
                ? ({
                    // consumed by the ringDraw keyframe
                    ['--ethos-ring-circumference' as string]: `${circumference}`,
                    ['--ethos-ring-offset' as string]: `${targetOffset}`,
                    animation: motion.ringDraw,
                  } as React.CSSProperties)
                : undefined
            }
          />
        </svg>
        {/* Center readout */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <span
            style={{
              fontFamily: fontFamily.mono,
              fontSize: Math.round(size * 0.29),
              fontWeight: 500,
              color: ringColor,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
          </span>
          {label && (
            <span
              style={{
                fontFamily: fontFamily.sans,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: ringColor,
              }}
            >
              {label}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default PrecisionGauge
