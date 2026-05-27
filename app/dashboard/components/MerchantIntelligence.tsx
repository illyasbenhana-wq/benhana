/**
 * Merchant Intelligence Component
 * Displays a sample SME profile (Fatima Diallo) with AI trust score and alternative signals.
 */
import React from 'react'
import { scoreMerchant, MerchantProfile } from '../../../lib/merchant-scoring'

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
      ? { bg: '#0d2a20', border: '#1D9E7544', text: '#1D9E75', label: 'Approve' }
      : result.recommendation === 'review'
        ? { bg: '#2a1e0a', border: '#BA751744', text: '#BA7517', label: 'Review' }
        : { bg: '#2a0d0d', border: '#E24B4A44', text: '#E24B4A', label: 'Decline' }

  return (
    <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 14, padding: '20px 24px' }}>
      <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
        Merchant Intelligence
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{fatima.name}</div>
        <div style={{ fontSize: 11, color: '#555' }}>{fatima.industry} • {fatima.country}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {/* Profile Info */}
        <div>
          <div style={{ fontSize: 10, color: '#555', marginBottom: 6 }}>PROFILE</div>
          <div style={{ fontSize: 11, color: '#bbb', marginBottom: 4 }}>
            <span style={{ color: '#e8e6df', fontWeight: 500 }}>Annual Revenue:</span> ${fatima.annualRevenue?.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: '#bbb', marginBottom: 4 }}>
            <span style={{ color: '#e8e6df', fontWeight: 500 }}>Trade Corridors:</span> {fatima.tradeCorridors.length} active
          </div>
          <div style={{ fontSize: 11, color: '#bbb' }}>
            <span style={{ color: '#e8e6df', fontWeight: 500 }}>On-Time Payments:</span> {Math.round(fatima.paymentHistory.onTimeRate * 100)}%
          </div>
        </div>

        {/* AI Score Circle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 9, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Trust Score</div>
          <div
            style={{
              width: 70,
              height: 70,
              borderRadius: '50%',
              background: '#0a0a0f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #1a1a28',
              fontSize: 24,
              fontWeight: 700,
              color: result.score >= 75 ? '#1D9E75' : result.score >= 50 ? '#BA7517' : '#E24B4A',
            }}
          >
            {result.score}
          </div>
        </div>
      </div>

      {/* Alternative Data Signals */}
      <div style={{ marginBottom: 16, padding: '12px 0', borderTop: '1px solid #1a1a28', borderBottom: '1px solid #1a1a28' }}>
        <div style={{ fontSize: 10, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
          Alternative Signals
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { label: 'Payment', val: result.breakdown.paymentConsistency },
            { label: 'Trade', val: result.breakdown.tradeCorridors },
            { label: 'ESG', val: result.breakdown.esg },
          ].map((m) => (
            <div key={m.label} style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: '#555', marginBottom: 3 }}>{m.label}</div>
              <div
                style={{
                  height: 4,
                  background: '#1a1a28',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${m.val}%`,
                    background: m.val >= 70 ? '#1D9E75' : m.val >= 40 ? '#BA7517' : '#E24B4A',
                    borderRadius: 2,
                  }}
                />
              </div>
              <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>{m.val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
          Recommendation
        </div>
        <div
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            background: recColor.bg,
            border: `1px solid ${recColor.border}`,
            color: recColor.text,
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          {recColor.label}
        </div>
      </div>
    </div>
  )
}
