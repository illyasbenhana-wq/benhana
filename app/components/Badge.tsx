'use client'
/**
 * EthosFi — shared status badge.
 *
 * Consolidates three previously-independent pill/tag treatments (lender
 * dashboard's risk pill, dashboard's severity dot+label, landing page's
 * compliance tag) into one component, adopting the accent-tinted
 * background + colored-border-at-alpha + dot treatment originally proven
 * in app/intelligence/score/[id]/components/styles.ts's `pillCss`.
 */
import React from 'react'
import { color as C, fontFamily as F, fontWeight as FW } from '../../lib/design-system/tokens-light'

export type BadgeTone = 'low' | 'medium' | 'high' | 'neutral' | 'accent'

const TONE_COLOR: Record<BadgeTone, string> = {
  low: C.riskLow,
  medium: C.riskMedium,
  high: C.riskHigh,
  neutral: C.textSecondary,
  accent: C.accent,
}

export function Badge({ tone, children, title }: { tone: BadgeTone; children: React.ReactNode; title?: string }) {
  const color = TONE_COLOR[tone]
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 10px', borderRadius: 20,
        background: C.accentSubtle, border: `1px solid ${color}44`,
        fontFamily: F.sans, fontSize: 11.5, fontWeight: FW.semibold, color,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {children}
    </span>
  )
}

export default Badge
