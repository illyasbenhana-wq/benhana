'use client'
/**
 * EthosFi — shared evidence row.
 *
 * One visual treatment for "a labeled data point with a score and a
 * rationale" — previously three different bespoke layouts across
 * Dashboard's active-signals list, Case's signal breakdown, and Score's
 * factor list. List-form, not boxed — matches the landing page's
 * narrative data treatment rather than a grid of cards.
 */
import React, { useState } from 'react'
import { color as C, fontFamily as F, fontSize as FS, fontWeight as FW } from '../../lib/design-system/tokens-light'

export function EvidenceRow({
  label,
  context,
  score,
  color,
  rationale,
  onClick,
  emphasized,
  right,
}: {
  label: string
  context?: string
  score: number
  color: string
  rationale?: string
  onClick?: () => void
  emphasized?: boolean
  /** Optional trailing element (e.g. a severity Badge) at the row's right edge. */
  right?: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: rationale ? 'flex-start' : 'center', gap: 12,
        padding: '10px 12px', cursor: onClick ? 'pointer' : 'default',
        borderLeft: `2px solid ${emphasized ? C.accent : 'transparent'}`,
        background: emphasized ? `${C.accentSubtle}22` : hover ? `${C.accentSubtle}14` : 'transparent',
        transition: 'background .15s', borderRadius: 4,
      }}
    >
      <span style={{
        fontFamily: F.mono, fontSize: FS.sm, fontWeight: FW.medium, color,
        minWidth: 32, textAlign: 'right', flexShrink: 0, paddingTop: rationale ? 2 : 0,
      }}>
        {score}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: FS.base, color: C.textPrimary, fontWeight: rationale ? FW.medium : FW.regular }}>{label}</span>
          {context && <span style={{ fontSize: FS.sm, color: C.textSecondary }}>{context}</span>}
          {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
        </div>
        {rationale && (
          <p style={{ margin: '4px 0 0', fontSize: FS.sm, color: C.textMuted, lineHeight: 1.55 }}>{rationale}</p>
        )}
      </div>
    </div>
  )
}

export default EvidenceRow
