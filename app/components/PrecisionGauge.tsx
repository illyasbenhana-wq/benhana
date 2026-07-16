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
 *
 * Animation self-containment: the default arc-draw uses the `ringDraw`
 * keyframe, which this component injects itself via a <style> tag, so
 * the gauge animates correctly on ANY page with no setup. If you pass a
 * custom `ringAnimation` string (e.g. the light theme's), you are
 * responsible for defining that keyframe on the page (the dashboard and
 * the investigation view both do). Either way the ring degrades
 * gracefully to its final state if a keyframe is missing.
 */
import React from 'react'
import { color as tokenColor, fontFamily, motion, keyframes as gaugeKeyframes, caseRiskColor } from '../../lib/design-system/tokens'

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
  /** Track (unfilled ring) color. Defaults to the dark theme's border color. */
  trackColor?: string
  /** Caption text color. Defaults to the dark theme's secondary text color. */
  captionColor?: string
  /** Font family for value/label/caption. Defaults to the dark theme's IBM Plex fonts. */
  fontFamilyOverride?: { mono: string; sans: string }
  /** Ring draw animation string. Defaults to the dark theme's ringDraw keyframe. */
  ringAnimation?: string
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
  trackColor,
  captionColor,
  fontFamilyOverride,
  ringAnimation,
}: PrecisionGaugeProps) {
  const ringColor = color ?? caseRiskColor(value)
  const track = trackColor ?? tokenColor.border
  const captionCol = captionColor ?? tokenColor.textSecondary
  const fonts = fontFamilyOverride ?? fontFamily
  const ringDraw = ringAnimation ?? motion.ringDraw
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
      {animate && ringAnimation === undefined && <style>{gaugeKeyframes}</style>}
      {caption && (
        <div
          style={{
            fontFamily: fonts.sans,
            fontSize: 12,
            color: captionCol,
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
            stroke={track}
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
                    animation: ringDraw,
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
              fontFamily: fonts.mono,
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
                fontFamily: fonts.sans,
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
