'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ScoreResult } from '@/types'
import { readScoreSession, ScoreSessionPayload } from '@/lib/score-session'
import { computeRiskBand } from '@/lib/risk-band'
import { isPreviewDeployment } from '@/lib/preview-bypass'
import { Logo } from '@/app/components/Logo'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  borderLine,
  shadowSm,
  googleFontsHref,
  ethoScoreColor,
} from '@/lib/design-system/tokens-light'

type PillarFactor = { name: string; score: number; max: number; rationale: string }
type Pillar = { score: number; max: number; factors: PillarFactor[] }
type ScorePillars = { trust: Pillar; track_record: Pillar; financial_health: Pillar; esg: Pillar }
type RiskBand = 'low' | 'medium' | 'high'

// Categorical legend colors for the 4 EthoScore pillars — these identify
// WHICH pillar a bar belongs to, not a risk/quality judgement, so they
// intentionally do NOT come from ethoScoreColor() or caseRiskColor().
const PILLAR_LABELS: Record<string, { label: string; color: string }> = {
  trust:            { label: 'Trust',            color: C.accent },
  track_record:     { label: 'Track Record',     color: C.riskLow },
  financial_health: { label: 'Financial Health',  color: C.riskMedium },
  esg:              { label: 'ESG Alignment',    color: '#7C3AED' },
}

// v1 legacy EthoScore (0–100, higher = better) risk-band display colors.
// The band itself is computed server-side via computeRiskBand() — this
// only maps that already-decided band to a color, so it neither
// reimplements computeRiskBand's thresholds nor conflates this 0–100
// legacy scale with the 0–1000 scale ethoScoreColor() covers.
const RISK_BAND_COLOR: Record<RiskBand, string> = {
  low: C.riskLow,
  medium: C.riskMedium,
  high: C.riskHigh,
}

const BAND_CONFIG: Record<RiskBand, { label: string; headline: string }> = {
  low:    { label: 'Low risk',    headline: 'Great news.' },
  medium: { label: 'Medium risk', headline: 'Good standing.' },
  high:   { label: 'Higher risk', headline: 'We\'ve found a path.' },
}

const REC_COLOR: Record<ScoreResult['recommendation'], string> = {
  approve: C.riskLow,
  review: C.riskMedium,
  decline: C.riskHigh,
}

function PillarBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.8s ease' }} />
    </div>
  )
}

// Structured (v2) EthoScore ring — the raw total is 0–1000, higher =
// better, so its color comes from ethoScoreColor(), NOT a re-derived
// percentage threshold (as this component previously computed inline).
function ScoreRing({ total, max }: { total: number; max: number }) {
  const pct = Math.round((total / max) * 100)
  const color = ethoScoreColor(total)
  return (
    <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto' }}>
      <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r="42" fill="none" stroke={C.border} strokeWidth="8" />
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${pct * 2.64} 264`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: FW.bold, color, fontFamily: F.sans, fontVariantNumeric: 'tabular-nums' }}>{total}</div>
        <div style={{ fontSize: 10, color: C.textSecondary }}>/ {max}</div>
      </div>
    </div>
  )
}

type ScoreView = {
  fullName: string
  score: ScoreResult
  pillars: ScorePillars | null
}

function fromSession(payload: ScoreSessionPayload): ScoreView {
  return {
    fullName: payload.full_name,
    score: {
      id: payload.score_id,
      application_id: payload.application_id,
      etho_score: payload.etho_score,
      risk_band: payload.risk_band,
      recommendation: payload.recommendation,
      ai_summary: payload.ai_summary,
      factors: payload.factors,
      model_version: payload.model_version || 'unknown',
      created_at: new Date().toISOString(),
    },
    pillars: null,
  }
}

function fromApi(application: { full_name: string }, score: any): ScoreView {
  return {
    fullName: application.full_name,
    score,
    pillars: score.score_pillars ?? null,
  }
}

// Preview-only demo fallback — lets a reviewer reach a fully populated
// /score/[id] via a direct link (any id) without going through /apply
// first or needing a real Supabase record. Exercises both the v1 legacy
// 5-factor view AND the v2 pillar breakdown ("Why this score") so both
// render for visual review. Never used outside isPreviewDeployment().
const DEMO_VIEW: ScoreView = {
  fullName: 'Amara Diallo',
  score: {
    id: 'demo-score', application_id: 'demo-app', etho_score: 78, risk_band: 'low',
    recommendation: 'approve', model_version: 'ethoscore-v1-demo', created_at: new Date().toISOString(),
    ai_summary: 'Amara shows 22 months of consistent on-time rent payments and a stable gig-income trend across three platforms. Loan-to-income ratio is well within range, and savings buffer covers 4+ months of expenses. Strong candidate for approval.',
    factors: [
      { name: 'Rent Payment Consistency', weight: 30, score: 92, rationale: '22 consecutive on-time payments, no missed months in the last 2 years.' },
      { name: 'Income Stability', weight: 25, score: 81, rationale: 'Gig income across 3 platforms, trending upward over the last 6 months.' },
      { name: 'Savings Buffer', weight: 20, score: 74, rationale: 'Average balance covers 4.2 months of stated expenses.' },
      { name: 'Loan-to-Income Ratio', weight: 15, score: 69, rationale: 'Requested amount is 1.8x monthly income — within accepted range.' },
      { name: 'Identity Verification', weight: 10, score: 88, rationale: 'Government ID and address verified via two independent sources.' },
    ],
  },
  pillars: {
    trust:            { score: 245, max: 300, factors: [{ name: 'Identity Verification', score: 132, max: 150, rationale: 'ID + address cross-verified.' }, { name: 'Network Signals', score: 113, max: 150, rationale: 'No adverse network associations found.' }] },
    track_record:     { score: 260, max: 300, factors: [{ name: 'Payment History', score: 140, max: 150, rationale: '22 months on-time, zero defaults.' }, { name: 'Dispute Rate', score: 120, max: 150, rationale: 'No disputes on file.' }] },
    financial_health:  { score: 138, max: 200, factors: [{ name: 'Income Trend', score: 78, max: 100, rationale: 'Gig income up 12% over 6 months.' }, { name: 'Savings Ratio', score: 60, max: 100, rationale: '4.2 months of expenses in reserve.' }] },
    esg:              { score: 137, max: 200, factors: [{ name: 'Financial Inclusion', score: 90, max: 100, rationale: 'First-time credit access via alternative data.' }, { name: 'Data Consent', score: 47, max: 100, rationale: 'Full consent granted, no restricted data used.' }] },
  },
}

export default function ScorePage() {
  const params = useParams()
  const id = params?.id as string
  const [view, setView] = useState<ScoreView | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return

    const load = async () => {
      setLoading(true)
      setNotFound(false)

      // 1. sessionStorage (immediate after apply — no Supabase client read)
      const cached = readScoreSession(id)
      if (cached) {
        setView(fromSession(cached))
        setLoading(false)
        return
      }

      // 2. API fetch (service role on server — RLS-safe)
      try {
        const res = await fetch(`/api/score/${id}`)
        if (res.ok) {
          const data = await res.json()
          setView(fromApi(data.application, data.score))
          setLoading(false)
          return
        }
      } catch (e) {
        console.error('Score fetch failed:', e)
      }

      // 3. Preview-only demo fallback — see DEMO_VIEW above. Lets a
      // reviewer reach a populated screen via any direct /score/[id]
      // link without a real record or the /apply flow.
      if (isPreviewDeployment()) {
        setView(DEMO_VIEW)
        setLoading(false)
        return
      }

      setNotFound(true)
      setLoading(false)
    }

    load()
  }, [id])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.background, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <link href={googleFontsHref} rel="stylesheet" />
      <div style={{ textAlign: 'center', color: C.accent, fontFamily: F.sans }}>
        <div style={{ fontSize: FS.sm, letterSpacing: '0.1em', marginBottom: SP.lg, textTransform: 'uppercase' }}>Calculating your EthoScore™</div>
        <div style={{ width: 240, height: 2, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: C.accent, animation: 'load 1.5s ease-in-out infinite', width: '40%' }} />
        </div>
        <style>{`@keyframes load { 0%{transform:translateX(-100%)} 100%{transform:translateX(700%)} }`}</style>
      </div>
    </div>
  )

  if (notFound || !view) {
    return (
      <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans, padding: SP.xxl }}>
        <link href={googleFontsHref} rel="stylesheet" />
        <p style={{ marginBottom: SP.lg }}>Score not found.</p>
        <p style={{ fontSize: FS.sm, color: C.textSecondary, maxWidth: 420, lineHeight: 1.6 }}>
          Results are available right after you submit an application. If you opened this link in a new tab, submit again from the apply flow.
        </p>
        <a href="/apply" style={{ display: 'inline-block', marginTop: SP.lg, color: C.accent, fontSize: FS.sm }}>Go to apply →</a>
      </div>
    )
  }

  const { fullName, score, pillars } = view
  const bandColor = RISK_BAND_COLOR[score.risk_band]
  const band = BAND_CONFIG[score.risk_band]
  const rec = score.recommendation
  const recColor = REC_COLOR[rec]

  const cardCss: React.CSSProperties = { background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm }
  const labelCss: React.CSSProperties = { fontFamily: F.sans, fontSize: FS.micro, fontWeight: FW.semibold, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSecondary }

  return (
    <>
      <link href={googleFontsHref} rel="stylesheet" />
    <div id="ethofi-screen" style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes countUp { from { opacity:0; transform:scale(0.8); } to { opacity:1; transform:scale(1); } }

        /* ── Print / PDF styles ── */
        #ethofi-pdf { display: none; }
        @media print {
          @page { margin: 18mm 16mm; size: A4; }
          #ethofi-screen { display: none !important; }
          #ethofi-pdf { display: block !important; color: #111 !important; background: #fff !important; font-family: Georgia, serif; padding: 0; margin: 0; width: 100%; }
        }

        /* PDF internal styles */
        .pdf-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 14px; border-bottom: 2px solid #111; margin-bottom: 24px; }
        .pdf-logo { display: flex; align-items: center; }
        .pdf-meta { font-size: 11px; color: #888; text-align: right; line-height: 1.6; }
        .pdf-section { margin-bottom: 22px; }
        .pdf-label { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #888; margin-bottom: 6px; }
        .pdf-score-row { display: flex; align-items: flex-end; gap: 16px; margin-bottom: 6px; }
        .pdf-score-num { font-size: 56px; font-family: Georgia, serif; font-weight: 700; line-height: 1; }
        .pdf-band-badge { display: inline-flex; align-items: center; gap: 5px; border: 1.5px solid; border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 600; margin-bottom: 6px; }
        .pdf-bar-track { height: 6px; background: #e5e5e5; border-radius: 3px; overflow: hidden; margin-top: 8px; }
        .pdf-bar-fill { height: 100%; border-radius: 3px; }
        .pdf-rec-box { border-radius: 8px; padding: 12px 16px; font-size: 13px; font-weight: 500; border: 1.5px solid; margin-bottom: 6px; }
        .pdf-summary { font-size: 13px; color: #333; line-height: 1.65; background: #f7f7f9; border-radius: 8px; padding: 14px 16px; }
        .pdf-factor { margin-bottom: 14px; }
        .pdf-factor-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
        .pdf-factor-bar { height: 4px; background: #e5e5e5; border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
        .pdf-factor-rationale { font-size: 12px; color: #555; line-height: 1.5; }
        .pdf-divider { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
        .pdf-compliance { font-size: 11px; color: #666; line-height: 1.7; background: #f7f7f9; border-radius: 8px; padding: 12px 16px; border-left: 3px solid #1a56db; }
        .pdf-footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 10px; color: #aaa; }
      `}</style>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: `${SP.xxl}px ${SP.xl}px` }}>

        {/* Logo */}
        <div style={{ marginBottom: SP.xxxl }}>
          <Logo size="sm" />
        </div>

        <p style={{ color: C.textSecondary, fontSize: FS.base, marginBottom: SP.sm }}>Hello {fullName.split(' ')[0]},</p>
        <h1 style={{ fontFamily: F.sans, fontSize: FS.display, fontWeight: FW.semibold, letterSpacing: '-0.01em', margin: `0 0 ${SP.xxl}px`, lineHeight: 1.1 }}>
          {band.headline}
        </h1>

        {/* Score card */}
        <div style={{ ...cardCss, padding: SP.xxl, marginBottom: SP.xl, textAlign: 'center' }}>
          <p style={{ ...labelCss, color: bandColor, margin: `0 0 ${SP.md}px` }}>Your EthoScore™</p>
          <div style={{ fontSize: 96, fontFamily: F.sans, fontWeight: FW.bold, color: bandColor, lineHeight: 1, fontVariantNumeric: 'tabular-nums', animation: 'countUp 0.6s ease forwards' }}>
            {score.etho_score}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.accentSubtle, border: `1px solid ${bandColor}44`, borderRadius: 20, padding: '6px 16px', marginTop: SP.md }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: bandColor }} />
            <span style={{ fontSize: FS.sm, color: bandColor }}>{band.label}</span>
          </div>

          {/* Score bar */}
          <div style={{ marginTop: SP.xl, position: 'relative' }}>
            <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${score.etho_score}%`, background: bandColor, borderRadius: 3, transition: 'width 1s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: FS.xs, color: C.textMuted }}>
              <span>0</span><span>50</span><span>100</span>
            </div>
          </div>
        </div>

        {/* Recommendation banner */}
        <div style={{ background: C.accentSubtle, border: `1px solid ${recColor}44`, borderRadius: R.card, padding: `${SP.lg}px ${SP.xl}px`, marginBottom: SP.xl }}>
          <p style={{ margin: 0, fontSize: FS.base, color: recColor }}>
            {rec === 'approve' && '✓ AI recommendation: Approve — your profile meets lending criteria.'}
            {rec === 'review' && '◎ AI recommendation: Manual review — a lender will assess your application.'}
            {rec === 'decline' && '○ AI recommendation: Not approved at this time — see improvement tips below.'}
          </p>
        </div>

        {/* AI Summary */}
        <div style={{ ...cardCss, padding: `${SP.lg}px ${SP.xl}px`, marginBottom: SP.xl }}>
          <p style={{ ...labelCss, marginBottom: SP.md }}>AI assessment</p>
          <p style={{ margin: 0, fontSize: FS.base, lineHeight: 1.6, color: C.textSecondary }}>{score.ai_summary}</p>
        </div>

        {/* Factors */}
        <div style={{ marginBottom: SP.xxl }}>
          <p style={{ ...labelCss, marginBottom: SP.lg }}>Score breakdown — 5 factors</p>
          {score.factors.map((f, i) => {
            const fColor = RISK_BAND_COLOR[computeRiskBand(f.score)]
            return (
              <div key={i} style={{ marginBottom: SP.lg }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: FS.base, fontWeight: FW.medium }}>{f.name}</span>
                  <span style={{ fontSize: FS.base, color: fColor, fontWeight: FW.medium, fontVariantNumeric: 'tabular-nums' }}>{f.score}/100</span>
                </div>
                <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${f.score}%`, background: fColor, borderRadius: 2 }} />
                </div>
                <p style={{ margin: 0, fontSize: FS.sm, color: C.textSecondary, lineHeight: 1.5 }}>{f.rationale}</p>
              </div>
            )
          })}
        </div>

        {/* Why This Score — v2 pillar breakdown */}
        {pillars && (
          <div style={{ ...cardCss, padding: SP.xl, marginBottom: SP.xl }}>
            <p style={{ ...labelCss, marginBottom: SP.xl }}>Why this score</p>

            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: SP.xl, alignItems: 'start' }}>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing total={Object.values(pillars).reduce((s: number, p: Pillar) => s + p.score, 0)} max={1000} />
                <div style={{ marginTop: SP.sm, fontSize: FS.xs, color: C.textSecondary }}>Structured Score</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.md }}>
                {(Object.entries(pillars) as [string, Pillar][]).map(([key, pillar]) => {
                  const meta = PILLAR_LABELS[key] ?? { label: key, color: C.textSecondary }
                  return (
                    <div key={key} style={{ background: C.background, border: borderLine, borderRadius: R.data, padding: `${SP.md}px ${SP.lg}px` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SP.sm }}>
                        <span style={{ fontSize: FS.sm, fontWeight: FW.medium, color: meta.color }}>{meta.label}</span>
                        <span style={{ fontSize: FS.xs, color: C.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{pillar.score}/{pillar.max}</span>
                      </div>
                      <PillarBar value={pillar.score} max={pillar.max} color={meta.color} />
                      <div style={{ marginTop: SP.sm }}>
                        {pillar.factors.map((f: PillarFactor) => (
                          <div key={f.name} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FS.xs, color: C.textSecondary, marginBottom: 2 }}>
                              <span>{f.name}</span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{f.score}/{f.max}</span>
                            </div>
                            <PillarBar value={f.score} max={f.max} color={meta.color} />
                            <div style={{ fontSize: 9, color: C.textMuted, marginTop: 1 }}>{f.rationale}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* EU AI Act notice */}
        <div style={{ borderTop: borderLine, paddingTop: SP.xl, marginBottom: SP.xl }}>
          <p style={{ fontSize: FS.sm, color: C.textMuted, lineHeight: 1.6 }}>
            <strong style={{ color: C.textSecondary }}>EU AI Act compliance.</strong> This assessment was made by an AI system. Under Article 22, you have the right to request human review of this decision. Contact <span style={{ color: C.accent }}>hello@ethosfiai.co</span> within 30 days.
          </p>
        </div>

        <div style={{ display: 'flex', gap: SP.md }}>
          <a href="/apply" style={{ flex: 1, padding: '14px 20px', borderRadius: R.control, border: borderLine, color: C.textSecondary, textAlign: 'center', textDecoration: 'none', fontSize: FS.sm }}>Apply again</a>
          <button type="button" onClick={() => window.print()} style={{ flex: 1, padding: '14px 20px', borderRadius: R.control, background: C.accent, color: '#fff', border: 'none', cursor: 'pointer', fontSize: FS.sm, fontWeight: FW.medium, fontFamily: 'inherit' }}>Export PDF</button>
        </div>
      </div>

    </div>

      {/* ── Hidden PDF layout — visible only on print ── */}
      <div id="ethofi-pdf" style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: '#111', background: '#fff', padding: '0 8px' }}>

        {/* Header */}
        <div className="pdf-header">
          <div className="pdf-logo">
            <Logo size="sm" />
          </div>
          <div className="pdf-meta">
            <div>Credit Score Report</div>
            <div>Application ID: {score.application_id}</div>
            <div>{new Date(score.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
        </div>

        {/* Applicant */}
        <div className="pdf-section">
          <div className="pdf-label">Applicant</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{fullName}</div>
        </div>

        {/* Score & band */}
        <div className="pdf-section">
          <div className="pdf-label">EthoScore™</div>
          <div className="pdf-score-row">
            <div className="pdf-score-num" style={{ color: bandColor }}>{score.etho_score}</div>
            <div>
              <div className="pdf-band-badge" style={{ color: bandColor, borderColor: bandColor }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: bandColor }} />
                {band.label}
              </div>
            </div>
          </div>
          <div className="pdf-bar-track">
            <div className="pdf-bar-fill" style={{ width: `${score.etho_score}%`, background: bandColor }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#aaa', marginTop: 4 }}>
            <span>0</span><span>50</span><span>100</span>
          </div>
        </div>

        {/* Decision */}
        <div className="pdf-section">
          <div className="pdf-label">AI Decision</div>
          <div className="pdf-rec-box" style={{
            color:       rec === 'approve' ? '#166534' : rec === 'review' ? '#92400e' : '#991b1b',
            borderColor: rec === 'approve' ? '#bbf7d0' : rec === 'review' ? '#fde68a' : '#fecaca',
            background:  rec === 'approve' ? '#f0fdf4'  : rec === 'review' ? '#fffbeb'  : '#fef2f2',
          }}>
            {rec === 'approve' && '✓ Approved — profile meets lending criteria'}
            {rec === 'review'  && '◎ Manual review required — lender assessment pending'}
            {rec === 'decline' && '○ Not approved at this time'}
          </div>
        </div>

        {/* AI Summary */}
        <div className="pdf-section">
          <div className="pdf-label">AI Assessment</div>
          <div className="pdf-summary">{score.ai_summary}</div>
        </div>

        {/* Risk factors */}
        <div className="pdf-section">
          <div className="pdf-label">Score Breakdown — 5 Factors</div>
          {score.factors.map((f, i) => {
            const fc = f.score >= 70 ? '#166534' : f.score >= 40 ? '#92400e' : '#991b1b'
            return (
              <div key={i} className="pdf-factor">
                <div className="pdf-factor-row">
                  <span>{f.name}</span>
                  <span style={{ color: fc }}>{f.score}/100</span>
                </div>
                <div className="pdf-factor-bar">
                  <div style={{ height: '100%', width: `${f.score}%`, background: fc, borderRadius: 2 }} />
                </div>
                <div className="pdf-factor-rationale">{f.rationale}</div>
              </div>
            )
          })}
        </div>

        <hr className="pdf-divider" />

        {/* EU AI Act */}
        <div className="pdf-compliance">
          <strong>EU AI Act Compliance Notice (Article 22).</strong> This credit assessment was produced by an automated AI system (EthosFi AI, model: {score.model_version}). You have the right to request human review of this decision within 30 days of issue. To exercise this right, contact <strong>hello@ethosfiai.co</strong> with your Application ID. You may also request a plain-language explanation of the factors that influenced this score.
        </div>

        {/* Footer */}
        <div className="pdf-footer">
          <span>EthosFi AI · ethosfiai.co</span>
          <span>This report is confidential and intended solely for the named applicant.</span>
          <span>Generated {new Date().toLocaleDateString('en-GB')}</span>
        </div>
      </div>
    </>
  )
}
