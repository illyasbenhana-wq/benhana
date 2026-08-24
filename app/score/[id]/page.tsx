'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ScoreResult } from '@/types'
import { readScoreSession, ScoreSessionPayload } from '@/lib/score-session'
import { computeRiskBand } from '@/lib/risk-band'
import { isPreviewDeployment } from '@/lib/preview-bypass'
import { Logo } from '@/app/components/Logo'
import { DashboardSidebar } from '@/app/components/DashboardSidebar'
import { EvidenceRow } from '@/app/components/EvidenceRow'
import { ScoreFigure } from '@/app/components/ScoreFigure'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  borderLine,
  googleFontsHref,
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

const BAND_CONFIG: Record<RiskBand, { label: string }> = {
  low:    { label: 'low risk' },
  medium: { label: 'medium risk' },
  high:   { label: 'higher risk' },
}

const REC_COLOR: Record<ScoreResult['recommendation'], string> = {
  approve: C.riskLow,
  review: C.riskMedium,
  decline: C.riskHigh,
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
    <div style={{ display: 'flex', height: '100vh', background: C.background, overflow: 'hidden' }}>
      <link href={googleFontsHref} rel="stylesheet" />
      <DashboardSidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: C.accent, fontFamily: F.sans }}>
          <div style={{ fontSize: FS.sm, letterSpacing: '0.1em', marginBottom: SP.lg, textTransform: 'uppercase' }}>Calculating your EthoScore™</div>
          <div style={{ width: 240, height: 2, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: C.accent, animation: 'load 1.5s ease-in-out infinite', width: '40%' }} />
          </div>
          <style>{`@keyframes load { 0%{transform:translateX(-100%)} 100%{transform:translateX(700%)} }`}</style>
        </div>
      </div>
    </div>
  )

  if (notFound || !view) {
    return (
      <div style={{ display: 'flex', height: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans, overflow: 'hidden' }}>
        <link href={googleFontsHref} rel="stylesheet" />
        <DashboardSidebar />
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: SP.xxl }}>
          <p style={{ marginBottom: SP.lg }}>Score not found.</p>
          <p style={{ fontSize: FS.sm, color: C.textSecondary, maxWidth: 420, lineHeight: 1.6 }}>
            Results are available right after you submit an application. If you opened this link in a new tab, submit again from the apply flow.
          </p>
          <a href="/apply" style={{ display: 'inline-block', marginTop: SP.lg, color: C.accent, fontSize: FS.sm }}>Go to apply →</a>
        </div>
      </div>
    )
  }

  const { fullName, score, pillars } = view
  const bandColor = RISK_BAND_COLOR[score.risk_band]
  const band = BAND_CONFIG[score.risk_band]
  const rec = score.recommendation
  const recColor = REC_COLOR[rec]

  const labelCss: React.CSSProperties = { fontFamily: F.sans, fontSize: FS.micro, fontWeight: FW.semibold, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textMuted }
  const monoCss: React.CSSProperties = { fontFamily: F.mono, fontVariantNumeric: 'tabular-nums' }
  // Section eyebrow paired with its step number in the chain — the same
  // numbered-sequence device the landing page uses for its pipeline
  // (Application/EthoScore/Case/Decision), applied here to Score's own
  // stated chain (Evidence -> Factors -> Analysis -> Conclusion ->
  // Decision -> Audit) so both pages read as the same process language.
  const StepLabel = ({ n, children, accent }: { n: string; children: React.ReactNode; accent?: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted }}>{n}</span>
      <span style={{ ...labelCss, color: accent ? C.accent : C.textMuted }}>{children}</span>
    </div>
  )
  // Prefer the structured 0-1000 conclusion (sum of the 4 pillars) — the
  // "current primary score" per the product's own scale. Only a v1-only
  // legacy record (no score_pillars) has nothing else to show; that case
  // is labeled explicitly as the 0-100 legacy scale rather than silently
  // implied to be the 1000-scale figure.
  const totalStructured = pillars ? (Object.values(pillars) as Pillar[]).reduce((s, p) => s + p.score, 0) : null
  const displayScore = totalStructured ?? score.etho_score
  const displayMax = totalStructured !== null ? 1000 : 100

  return (
    <>
      <link href={googleFontsHref} rel="stylesheet" />
    <div id="ethofi-screen" style={{ display: 'flex', height: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans, overflow: 'hidden' }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes ethosFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: no-preference) {
          .ethos-reveal { animation: ethosFadeUp .5s ease both; }
          .ethos-reveal-1 { animation-delay: .03s; }
          .ethos-reveal-2 { animation-delay: .09s; }
          .ethos-reveal-3 { animation-delay: .15s; }
          .ethos-reveal-4 { animation-delay: .21s; }
          .ethos-reveal-5 { animation-delay: .27s; }
        }

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

      <DashboardSidebar />

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: `${SP.xxxl}px ${SP.xl}px ${SP.huge}px` }}>

        {/* Logo */}
        <div style={{ marginBottom: SP.xxxl }}>
          <Logo size="sm" />
        </div>

        {/* Investigation context — not a celebratory greeting. Establishes
            who/what is being assessed before anything else is shown. */}
        <p style={labelCss}>Assessment · Application {score.application_id}</p>
        <h1 style={{ fontFamily: F.sans, fontSize: 24, fontWeight: FW.bold, letterSpacing: '-0.01em', margin: `10px 0 ${SP.huge}px`, lineHeight: 1.15 }}>
          {fullName}
        </h1>

        {/* Evidence — the signals, walked through first. Real section
            heading (matches the landing page's H2 scale), not just a
            micro-label — this is the page's substantial content. */}
        <div className="ethos-reveal ethos-reveal-1">
          <StepLabel n="01" accent>Evidence</StepLabel>
          <h2 style={{ fontFamily: F.sans, fontSize: FS.xl, fontWeight: FW.bold, letterSpacing: '-0.01em', margin: `${SP.sm}px 0 ${SP.xl}px` }}>
            {score.factors.length} signals assessed against this application
          </h2>
          <div style={{ marginBottom: SP.xxxl }}>
            {score.factors.map((f, i) => (
              <EvidenceRow key={i} label={f.name} score={f.score} color={RISK_BAND_COLOR[computeRiskBand(f.score)]} rationale={f.rationale} />
            ))}
          </div>
        </div>

        {/* Factors — how the signals above resolve into the structured
            0-1000 pillar model, when available. Secondary weight
            (eyebrow only, no H2) — detail under Evidence, not a peer to it. */}
        {pillars && (
          <div className="ethos-reveal ethos-reveal-2" style={{ marginBottom: SP.xxxl }}>
            <StepLabel n="02">Factors</StepLabel>
            <p style={{ fontSize: FS.sm, color: C.textSecondary, margin: `8px 0 ${SP.lg}px` }}>Resolved into 4 weighted pillars.</p>
            {/* Pillar-totals stat tiles — the one genuinely parallel,
                comparable dataset on this page (4 fixed-ceiling totals),
                given a fast-scan glance layer above the detailed
                per-pillar factor lists below, which are unchanged. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: SP.xl }}>
              {(Object.entries(pillars) as [string, Pillar][]).map(([key, pillar]) => {
                const meta = PILLAR_LABELS[key] ?? { label: key, color: C.textSecondary }
                return (
                  <div key={key} style={{ background: C.background, border: borderLine, borderRadius: R.control, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: meta.color, fontWeight: FW.semibold, marginBottom: 4 }}>{meta.label}</div>
                    <div style={{ ...monoCss, fontSize: FS.lg, fontWeight: FW.bold, color: C.textPrimary, lineHeight: 1 }}>{pillar.score}</div>
                    <div style={{ ...monoCss, fontSize: 10, color: C.textMuted, marginTop: 2 }}>/{pillar.max}</div>
                  </div>
                )
              })}
            </div>
            {(Object.entries(pillars) as [string, Pillar][]).map(([key, pillar]) => {
              const meta = PILLAR_LABELS[key] ?? { label: key, color: C.textSecondary }
              return (
                <div key={key} style={{ marginBottom: SP.lg }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.sm, marginBottom: 4 }}>
                    <span style={{ fontSize: FS.sm, fontWeight: FW.semibold, color: meta.color }}>{meta.label}</span>
                    <span style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted }}>{pillar.score}/{pillar.max}</span>
                  </div>
                  {pillar.factors.map((f: PillarFactor) => (
                    <EvidenceRow key={f.name} label={f.name} score={f.score} color={meta.color} rationale={f.rationale} />
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* Analysis — real H2 again (second primary section), editorial
            accent-rule treatment. */}
        <div className="ethos-reveal ethos-reveal-3" style={{ marginBottom: SP.huge }}>
          <StepLabel n="03" accent>Analysis</StepLabel>
          <div style={{ borderLeft: `2px solid ${C.accent}`, paddingLeft: SP.xl, marginTop: SP.md }}>
            <p style={{ margin: 0, fontSize: FS.md, lineHeight: 1.75, color: C.textPrimary }}>{score.ai_summary}</p>
          </div>
        </div>

        {/* Conclusion — the score, earned after the evidence above. A
            typographic figure, not a gauge widget. */}
        <div className="ethos-reveal ethos-reveal-4" style={{ marginBottom: SP.huge }}>
          <StepLabel n="04" accent>Conclusion</StepLabel>
          <div style={{ marginTop: SP.md }}>
            <ScoreFigure value={displayScore} max={displayMax} color={bandColor} bandLabel={band.label} size="lg" />
            {totalStructured === null && (
              <p style={{ fontSize: FS.xs, color: C.textMuted, margin: `6px 0 0` }}>Legacy factor-weighted score (0–100 scale) — no structured pillar assessment on record for this application.</p>
            )}
            <p style={{ margin: `${SP.xl}px 0 0`, fontSize: FS.base, color: recColor }}>
              {rec === 'approve' && '✓ Decision: Approve — this profile meets lending criteria.'}
              {rec === 'review' && '◎ Decision: Manual review — a lender will assess this application.'}
              {rec === 'decline' && '○ Decision: Not approved at this time — see improvement guidance above.'}
            </p>
          </div>
        </div>

        {/* Audit — the same dark technical-record surface the landing
            page uses for its API panel: the one deliberate "instrument"
            moment on an otherwise light page, reserved for the audit
            trail itself. Only real fields on ScoreResult are shown
            (model_version, created_at) — the richer multi-field
            provenance shown on /intelligence/score/[id]
            (model_requested/responded, prompt_version, confidence) isn't
            available on this data type without an API change, out of
            scope for this pass; flagged rather than faked. */}
        <div className="ethos-reveal ethos-reveal-5" style={{ marginBottom: SP.xl }}>
          <StepLabel n="05">Audit</StepLabel>
          <div style={{ background: C.textPrimary, borderRadius: R.control, padding: SP.xl, marginTop: SP.md }}>
            <div style={{ ...monoCss, fontSize: 11.5, color: 'rgba(226,232,240,0.85)', marginBottom: SP.md }}>
              <span style={{ color: '#60A5FA' }}>decision_recorded</span>
              <span style={{ color: 'rgba(226,232,240,0.4)' }}> · score-{score.id}</span>
              <div style={{ marginTop: 4, color: 'rgba(226,232,240,0.55)' }}>
                model: {score.model_version} · scored: {new Date(score.created_at).toLocaleString('en-GB')}
              </div>
            </div>
            <p style={{ fontSize: FS.sm, color: 'rgba(226,232,240,0.75)', lineHeight: 1.6, margin: 0, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: SP.md }}>
              <strong style={{ color: '#F8FAFC' }}>EU AI Act compliance.</strong> This assessment was made by an AI system. Under Article 22, you have the right to request human review of this decision. Contact <span style={{ color: '#60A5FA' }}>hello@ethosfi.co</span> within 30 days.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: SP.md }}>
          <a href="/apply" style={{ flex: 1, padding: '14px 20px', borderRadius: R.control, border: borderLine, color: C.textSecondary, textAlign: 'center', textDecoration: 'none', fontSize: FS.sm }}>Apply again</a>
          <button type="button" onClick={() => window.print()} style={{ flex: 1, padding: '14px 20px', borderRadius: R.control, background: C.accent, color: '#fff', border: 'none', cursor: 'pointer', fontSize: FS.sm, fontWeight: FW.medium, fontFamily: 'inherit' }}>Export PDF</button>
        </div>
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
          <strong>EU AI Act Compliance Notice (Article 22).</strong> This credit assessment was produced by an automated AI system (EthosFi AI, model: {score.model_version}). You have the right to request human review of this decision within 30 days of issue. To exercise this right, contact <strong>hello@ethosfi.co</strong> with your Application ID. You may also request a plain-language explanation of the factors that influenced this score.
        </div>

        {/* Footer */}
        <div className="pdf-footer">
          <span>EthosFi AI · ethosfi.co</span>
          <span>This report is confidential and intended solely for the named applicant.</span>
          <span>Generated {new Date().toLocaleDateString('en-GB')}</span>
        </div>
      </div>
    </>
  )
}
