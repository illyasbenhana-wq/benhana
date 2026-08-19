'use client'
/**
 * KPI stat strip — layout pattern ported from Fortress's dashboard
 * "Row 0" (inline KPI row beside the page title). Metrics are EthosFi's
 * own (case/risk data), not P&L/AUM/VaR.
 */
import React from 'react'
import { color as C, fontFamily as F, fontSize as FS, fontWeight as FW } from '../../lib/design-system/tokens-light'

export type Kpi = { label: string; value: string; tone?: 'default' | 'danger' | 'warning' | 'success' }

const TONE_COLOR: Record<NonNullable<Kpi['tone']>, string> = {
  default: C.textPrimary,
  danger: C.riskHigh,
  warning: C.riskMedium,
  success: C.riskLow,
}

export function DashboardKpiRow({ title, kpis }: { title: string; kpis: Kpi[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
      <h1 style={{ margin: 0, fontFamily: F.sans, fontSize: FS.xl, fontWeight: FW.bold, color: C.textPrimary }}>{title}</h1>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: F.sans, fontSize: FS.xs, color: C.textSecondary }}>{k.label}</span>
            <span style={{ fontFamily: F.mono, fontSize: FS.sm, fontWeight: FW.bold, color: TONE_COLOR[k.tone ?? 'default'] }}>{k.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
