'use client'
/**
 * EthosFi — shared score conclusion device.
 *
 * A typographic figure, not a gauge widget: the value set large in the
 * display face, inline with its scale and band, followed by a thin
 * architectural tick-scale (not a colored progress bar/ring) showing
 * where the value sits between 0 and max. Originally built for
 * /score/[id]'s conclusion; shared here so Dashboard's case-detail score
 * uses the exact same visual device rather than a second bespoke one —
 * the score is the same kind of thing wherever it appears in the product.
 */
import React from 'react'
import { color as C, fontFamily as F, fontSize as FS, fontWeight as FW } from '../../lib/design-system/tokens-light'

export function ScoreFigure({
  value,
  max,
  color,
  bandLabel,
  size = 'lg',
  numSize: numSizeOverride,
}: {
  value: number
  max: number
  color: string
  bandLabel?: string
  size?: 'lg' | 'sm'
  /** Optional override for the figure's font size, when a specific
   * placement needs to sit below its default (e.g. secondary to a
   * page's own H1) without changing the shared 'lg'/'sm' defaults
   * used everywhere else this component appears. */
  numSize?: number
}) {
  const pct = Math.max(0, Math.min(1, value / max))
  const numSize = numSizeOverride ?? (size === 'lg' ? 64 : 36)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: F.display, fontStyle: 'italic', fontWeight: FW.medium, fontSize: numSize, color, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: size === 'lg' ? FS.md : FS.sm, color: C.textMuted }}>/ {max}</span>
        {bandLabel && <span style={{ fontSize: size === 'lg' ? FS.base : FS.sm, color: C.textSecondary }}>— {bandLabel}</span>}
      </div>
      <div style={{ position: 'relative', height: 1, background: C.border, margin: '10px 0 4px', minWidth: size === 'lg' ? 220 : 140 }}>
        <div style={{ position: 'absolute', top: -3, left: `${pct * 100}%`, width: 2, height: 7, background: color, transform: 'translateX(-1px)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.textMuted }}>
        <span>0</span><span>{max}</span>
      </div>
    </div>
  )
}

export default ScoreFigure
