'use client'
/**
 * EthosFi — EthoScore pillar composition bar.
 *
 * Visualizes the real structure of the v2 scoring model (lib/ethoscore-v2.ts):
 * four pillars with FIXED, unequal ceilings (Trust 300, Track Record 300,
 * Financial Health 200, ESG 200 — summing to exactly 1000) that sum
 * linearly to the total EthoScore. Segment WIDTH encodes each pillar's
 * fixed structural ceiling (its share of the model, not its score) —
 * segments always sum to the full bar width regardless of any
 * application's actual scores. Segment FILL encodes how much of that
 * pillar's own ceiling was earned on this application. This is
 * deliberately not a naive "score / 1000" proportional bar, which would
 * conflate structural weight with earned performance and could visually
 * imply a relationship the model doesn't have.
 */
import React from 'react'
import { color as C, fontFamily as F, fontSize as FS, fontWeight as FW } from '../../lib/design-system/tokens-light'

export type PillarBarSegment = { label: string; color: string; score: number; max: number }

export function PillarCompositionBar({ segments, totalMax = 1000 }: { segments: PillarBarSegment[]; totalMax?: number }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, height: 10, marginBottom: 8 }}>
        {segments.map(seg => {
          const widthPct = (seg.max / totalMax) * 100
          const fillPct = seg.max > 0 ? Math.max(0, Math.min(100, (seg.score / seg.max) * 100)) : 0
          return (
            <div key={seg.label} style={{ width: `${widthPct}%`, background: `${seg.color}22`, position: 'relative', overflow: 'hidden' }} title={`${seg.label}: ${seg.score}/${seg.max}`}>
              <div style={{ position: 'absolute', inset: 0, width: `${fillPct}%`, background: seg.color }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {segments.map(seg => {
          const widthPct = (seg.max / totalMax) * 100
          return (
            <div key={seg.label} style={{ width: `${widthPct}%`, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: FW.semibold, color: seg.color, fontFamily: F.sans, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{seg.label}</div>
              <div style={{ fontFamily: F.mono, fontSize: 10, color: C.textMuted }}>{seg.score}/{seg.max}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PillarCompositionBar
