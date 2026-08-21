/**
 * Merchant Intelligence Component
 * Displays a sample SME profile (Fatima Diallo) with AI trust score and alternative signals.
 */
import React from 'react'
import { scoreMerchant, MerchantProfile } from '../../../lib/merchant-scoring'
import { color as C, fontWeight as FW, radius as R, borderLine, shadowSm } from '../../../lib/design-system/tokens-light'

export function MerchantIntelligence() {
  // Sample SME profile: Fatima Diallo, cross-border apparel trader
  const fatima: MerchantProfile = {
    id: 'fatima-001',
    name: 'Fatima Diallo',
    country: 'Lagos, Nigeria',
    industry: 'Apparel & Textiles',
    annualRevenue: 120000,
    tradeCorridors: [
      { region: 'United Kingdom', volume: 80000 },
      { region: 'United Arab Emirates', volume: 30000 },
      { region: 'Ghana', volume: 50000 },
    ],
    paymentHistory: { onTimeRate: 0.92, avgDelayDays: 2 },
    esgScore: 68,
  }

  const result = scoreMerchant(fatima)

  const recColor =
    result.recommendation === 'approve'
      ? { bg: C.accentSubtle, border: `${C.riskLow}44`, text: C.riskLow, label: 'Approve' }
      : result.recommendation === 'review'
        ? { bg: C.accentSubtle, border: `${C.riskMedium}44`, text: C.riskMedium, label: 'Review' }
        : { bg: C.accentSubtle, border: `${C.riskHigh}44`, text: C.riskHigh, label: 'Decline' }

  return (
    <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm, padding: '20px 24px' }}>
      <div style={{ fontSize: 11, color: C.textSecondary, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
        Merchant Intelligence
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: FW.medium, marginBottom: 2 }}>{fatima.name}</div>
        <div style={{ fontSize: 11, color: C.textSecondary }}>{fatima.industry} • {fatima.country}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {/* Profile Info */}
        <div>
          <div style={{ fontSize: 10, color: C.textSecondary, marginBottom: 6 }}>PROFILE</div>
          <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 4 }}>
            <span style={{ color: C.textPrimary, fontWeight: FW.medium }}>Annual Revenue:</span> ${fatima.annualRevenue?.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: 4 }}>
            <span style={{ color: C.textPrimary, fontWeight: FW.medium }}>Trade Corridors:</span> {fatima.tradeCorridors.length} active
          </div>
          <div style={{ fontSize: 11, color: C.textSecondary }}>
            <span style={{ color: C.textPrimary, fontWeight: FW.medium }}>On-Time Payments:</span> {Math.round(fatima.paymentHistory.onTimeRate * 100)}%
          </div>
        </div>

        {/* AI Score Circle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 9, color: C.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Trust Score</div>
          <div
            style={{
              width: 70,
              height: 70,
              borderRadius: '50%',
              background: C.surface,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `2px solid ${C.border}`,
              fontSize: 24,
              fontWeight: FW.bold,
              color: result.score >= 75 ? C.riskLow : result.score >= 50 ? C.riskMedium : C.riskHigh,
            }}
          >
            {result.score}
          </div>
        </div>
      </div>

      {/* Alternative Data Signals */}
      <div style={{ marginBottom: 16, padding: '12px 0', borderTop: borderLine, borderBottom: borderLine }}>
        <div style={{ fontSize: 10, color: C.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: FW.medium }}>
          Alternative Signals
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { label: 'Payment', val: result.breakdown.paymentConsistency },
            { label: 'Trade', val: result.breakdown.tradeCorridors },
            { label: 'ESG', val: result.breakdown.esg },
          ].map((m) => (
            <div key={m.label} style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: C.textSecondary, marginBottom: 3 }}>{m.label}</div>
              <div
                style={{
                  height: 4,
                  background: C.border,
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${m.val}%`,
                    background: m.val >= 70 ? C.riskLow : m.val >= 40 ? C.riskMedium : C.riskHigh,
                    borderRadius: 2,
                  }}
                />
              </div>
              <div style={{ fontSize: 9, color: C.textSecondary, marginTop: 2 }}>{m.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: FW.medium }}>
          Recommendation
        </div>
        <div
          style={{
            padding: '6px 14px',
            borderRadius: R.control,
            background: recColor.bg,
            border: `1px solid ${recColor.border}`,
            color: recColor.text,
            fontSize: 11,
            fontWeight: FW.medium,
          }}
        >
          {recColor.label}
        </div>
      </div>
    </div>
  )
}
