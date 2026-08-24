'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { isPreviewDeployment } from '@/lib/preview-bypass'
import { C, F, FS, FW, SP, monoCss, labelCss, mapRiskBandToLevel, riskLevelColor, googleFontsHref } from './components/styles'
import { pillarsFromFable5Assessment, type PillarDatum } from './components/PillarTable'
import { FactorList } from './components/FactorList'
import { deriveExplainabilityStatus, type ExplainabilityStatus } from './components/ExplainabilityBadge'
import { Badge } from '@/app/components/Badge'
import { ScoreFigure } from '@/app/components/ScoreFigure'
import { EvidenceRow } from '@/app/components/EvidenceRow'
import { PillarCompositionBar } from '@/app/components/PillarCompositionBar'

// Explainability status -> Badge tone + label. Same low/medium/high/neutral
// mapping ExplainabilityBadge used locally, now driving the shared Badge.
const EXPLAINABILITY_CONFIG: Record<ExplainabilityStatus, { label: string; tone: 'low' | 'medium' | 'high' | 'neutral'; detail: string }> = {
  explainable: { label: 'Explainable — AI Act Ready', tone: 'low', detail: 'A Fable 5 assessment was parsed from raw_response: pillar rationale, key factors, and grounded counterfactuals available.' },
  fallback: { label: 'Explainable — Degraded', tone: 'medium', detail: 'A validation fallback occurred during scoring. Provenance recorded, but review before relying on this record.' },
  structured: { label: 'Structured — No Narrative', tone: 'medium', detail: 'Deterministic pillar scores (score_pillars) are available, but no Fable 5 narrative assessment or counterfactual guidance exists for this record.' },
  legacy: { label: 'Legacy — Narrative Only', tone: 'neutral', detail: 'Scored under prompt v1. No structured pillar breakdown or counterfactual guidance.' },
}

// Same numbered eyebrow device as /score/[id]'s StepLabel — kept local to
// this page (that component isn't shared across routes elsewhere either).
function StepLabel({ n, children, accent }: { n: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted }}>{n}</span>
      <span style={{ ...labelCss, color: accent ? C.accent : C.textMuted }}>{children}</span>
    </div>
  )
}

const CONFIDENCE_LEVEL: Record<'high' | 'medium' | 'low', 'low' | 'medium' | 'high'> = {
  high: 'low',   // high confidence -> green
  medium: 'medium',
  low: 'high',   // low confidence -> red
}

const BAND_LABEL: Record<string, string> = {
  very_low: 'Very Low Risk',
  low: 'Low Risk',
  moderate: 'Moderate Risk',
  medium: 'Medium Risk',
  elevated: 'Elevated Risk',
  high: 'High Risk',
}

interface ScoreRow {
  id: string
  application_id: string
  etho_score: number
  risk_band: string
  ai_summary: string
  created_at: string
  score_pillars: unknown
  prompt_version: string | null
  model_requested: string | null
  model_responded: string | null
  confidence_overall: 'high' | 'medium' | 'low' | null
  raw_response: string | null
}

interface ApplicationRow {
  id: string
  full_name: string
}

type PanelData = {
  application: ApplicationRow
  score: ScoreRow
  pillars: PillarDatum[]
  counterfactuals: string[]
  // The Fable 5 assessment reports its own 0-1000 total, which can differ
  // slightly from `scores.etho_score` (which is normalized/rounded onto a
  // 0-100 scale for v1-consumer compatibility — see lib/scoring-engine.ts).
  // The gauge shows the richer 0-1000 figure when a Fable 5 assessment is
  // present, since that's the scale the pillar breakdown is actually on.
  gaugeScore: number
  gaugeMax: number
  // True only when raw_response was actually JSON.parse'd successfully AND
  // yielded a pillars object — i.e. real evidence, not just a
  // prompt_version field claiming Fable 5 was used. Feeds
  // deriveExplainabilityStatus() so a malformed/unparseable raw_response
  // can never earn the green "AI Act Ready" badge (Finding 2).
  fable5PillarsParsed: boolean
}

function parsePanelData(application: ApplicationRow, score: ScoreRow): PanelData {
  const isFable5 = score.prompt_version === '2.0.0-fable5'

  if (isFable5 && score.raw_response) {
    try {
      const assessment = JSON.parse(score.raw_response)
      const pillars = pillarsFromFable5Assessment(assessment)
      return {
        application,
        score,
        pillars,
        counterfactuals: Array.isArray(assessment.counterfactuals) ? assessment.counterfactuals : [],
        gaugeScore: assessment.etho_score ?? score.etho_score,
        gaugeMax: 1000,
        fable5PillarsParsed: !!assessment.pillars,
      }
    } catch {
      // Falls through to the non-Fable5 branch below — a malformed
      // raw_response shouldn't take down the whole panel, just the
      // pillar-level detail (and, per Finding 2, must not claim the
      // 'explainable' badge state either).
    }
  }

  return {
    application,
    score,
    pillars: [],
    counterfactuals: [],
    gaugeScore: score.etho_score,
    gaugeMax: 100,
    fable5PillarsParsed: false,
  }
}

// Preview-only demo fallback — lets a reviewer reach a fully populated
// /intelligence/score/[id] via a direct link without a real
// INTELLIGENCE_ACCESS_TOKEN or a real DB-backed score. Never used
// outside isPreviewDeployment(). Mirrors /score/[id]'s DEMO_VIEW pattern.
const DEMO_PANEL_DATA: PanelData = {
  application: { id: 'demo-app', full_name: 'Amara Diallo' },
  score: {
    id: 'demo-score', application_id: 'demo-app', etho_score: 780, risk_band: 'low',
    ai_summary: 'Amara shows 22 months of consistent on-time rent payments and a stable gig-income trend across three platforms. Loan-to-income ratio is well within range, and savings buffer covers 4+ months of expenses. Strong candidate for approval.',
    created_at: '2026-08-20T14:32:00.000Z',
    score_pillars: {},
    prompt_version: '2.0.0-fable5',
    model_requested: 'claude-fable-5', model_responded: 'claude-fable-5',
    confidence_overall: 'high',
    raw_response: null,
  },
  pillars: [
    { key: 'trust', label: 'Trust', score: 245, max: 300, confidence: 'high', rationale: 'Identity and address cross-verified via two independent sources; no adverse network associations found.', key_factors: [
      { factor: 'Identity Verification', direction: 'positive', justification: 'Government ID and address verified via two independent sources.' },
      { factor: 'Network Signals', direction: 'neutral', justification: 'No adverse network associations found.' },
    ] },
    { key: 'track_record', label: 'Track Record', score: 260, max: 300, confidence: 'high', rationale: '22 consecutive on-time rent payments with zero disputes on file.', key_factors: [
      { factor: 'Payment History', direction: 'positive', justification: '22 months on-time, zero defaults.' },
      { factor: 'Dispute Rate', direction: 'positive', justification: 'No disputes on file.' },
    ] },
    { key: 'financial_health', label: 'Financial Health', score: 138, max: 200, confidence: 'medium', rationale: 'Gig income trending upward with a healthy savings buffer relative to expenses.', key_factors: [
      { factor: 'Income Trend', direction: 'positive', justification: 'Gig income up 12% over 6 months.' },
      { factor: 'Savings Ratio', direction: 'neutral', justification: '4.2 months of expenses in reserve.' },
    ] },
    { key: 'esg_alignment', label: 'ESG Alignment', score: 137, max: 200, confidence: 'medium', rationale: 'First-time credit access via alternative data, with full data-use consent on record.', key_factors: [
      { factor: 'Financial Inclusion', direction: 'positive', justification: 'First-time credit access via alternative data.' },
      { factor: 'Data Consent', direction: 'positive', justification: 'Full consent granted, no restricted data used.' },
    ] },
  ],
  counterfactuals: [
    'To improve this score, the applicant could: extend gig-income history on a fourth platform to strengthen the Financial Health pillar.',
    'To improve this score, the applicant could: increase savings buffer to 6+ months of expenses.',
  ],
  gaugeScore: 780,
  gaugeMax: 1000,
  fable5PillarsParsed: true,
}

export default function IntelligenceScorePage() {
  const params = useParams()
  const id = params?.id as string
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/intelligence/score/${id}`, {
          headers: { 'X-Intelligence-Token': token },
        })
        if (!res.ok) {
          if (isPreviewDeployment()) { if (!cancelled) setData(DEMO_PANEL_DATA); return }
          if (!cancelled) setError(res.status === 404 ? 'No score found for this application.' : `Request failed (${res.status})`)
          return
        }
        const json = await res.json()
        if (!cancelled) setData(parsePanelData(json.application, json.score))
      } catch (e) {
        if (isPreviewDeployment()) { if (!cancelled) setData(DEMO_PANEL_DATA); return }
        if (!cancelled) setError(e instanceof Error ? e.message : 'Request failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [id, token])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.background, color: C.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans, fontSize: 13 }}>
        Loading assessment…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans, padding: SP.xxl }}>
        <p style={{ fontSize: 14 }}>{error ?? 'Score not found.'}</p>
      </div>
    )
  }

  const { application, score, pillars, counterfactuals, gaugeScore, gaugeMax, fable5PillarsParsed } = data
  const explainability = deriveExplainabilityStatus({
    prompt_version: score.prompt_version,
    score_pillars: score.score_pillars,
    fable5PillarsParsed,
  })
  const explCfg = EXPLAINABILITY_CONFIG[explainability]
  const bandLevel = mapRiskBandToLevel(score.risk_band)
  const bandColor = riskLevelColor(bandLevel)
  const confColor = score.confidence_overall ? riskLevelColor(CONFIDENCE_LEVEL[score.confidence_overall]) : riskLevelColor('neutral')

  const nameWords = application.full_name.split(' ')

  return (
    <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans }}>
      <link href={googleFontsHref} rel="stylesheet" />

      <div style={{ maxWidth: 880, margin: '0 auto', padding: `${SP.xxl}px ${SP.xl}px` }}>

        {/* Header — same identity-moment treatment as Case's H1 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: SP.xxl, gap: SP.lg, flexWrap: 'wrap' }}>
          <div>
            <p style={{ ...monoCss, fontSize: 11, color: C.textMuted, marginBottom: SP.xs }}>
              APPLICATION {application.id}
            </p>
            <h1 style={{ fontFamily: F.sans, fontSize: 28, fontWeight: FW.bold, letterSpacing: '-0.01em', margin: 0 }}>
              {nameWords.map((word, i) => i === 0
                ? <span key={i} style={{ fontFamily: F.display, fontStyle: 'italic', fontWeight: FW.medium }}>{word} </span>
                : word + ' ')}
            </h1>
          </div>
          <Badge tone={explCfg.tone} title={explCfg.detail}>{explCfg.label}</Badge>
        </div>

        {/* 01 — Conclusion: typographic score figure, not a gauge */}
        <div style={{ marginBottom: SP.xxxl }}>
          <StepLabel n="01" accent>Conclusion</StepLabel>
          <div style={{ marginTop: SP.md }}>
            <ScoreFigure value={gaugeScore} max={gaugeMax} color={bandColor} bandLabel={BAND_LABEL[score.risk_band] ?? score.risk_band} size="lg" />
          </div>

          {/* Audit — same dark technical-record panel as Score's Audit
              section; this page's provenance data is the same kind of
              record (model/version/timestamp), not a summary card. */}
          <div style={{ background: C.textPrimary, borderRadius: 8, padding: SP.xl, marginTop: SP.xl }}>
            <div style={{ ...monoCss, fontSize: 11.5, color: 'rgba(226,232,240,0.85)', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: SP.md }}>
              <div><span style={{ color: 'rgba(226,232,240,0.5)' }}>model requested: </span>{score.model_requested ?? 'n/a'}</div>
              <div><span style={{ color: 'rgba(226,232,240,0.5)' }}>model responded: </span>{score.model_responded ?? 'n/a'}</div>
              <div><span style={{ color: 'rgba(226,232,240,0.5)' }}>prompt version: </span>{score.prompt_version ?? 'n/a'}</div>
              <div><span style={{ color: 'rgba(226,232,240,0.5)' }}>scored at (UTC): </span>{score.created_at}</div>
            </div>
            <div style={{ marginTop: SP.md, paddingTop: SP.md, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: confColor, flexShrink: 0 }} />
              <span style={{ fontSize: FS.sm, color: confColor, fontWeight: FW.semibold }}>
                {score.confidence_overall ? `${score.confidence_overall.toUpperCase()} CONFIDENCE` : 'CONFIDENCE N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* 02 — Factors: composition bar + EvidenceRow per pillar */}
        <div style={{ marginBottom: SP.xxxl }}>
          <StepLabel n="02">Factors</StepLabel>
          {pillars.length > 0 ? (
            <>
              <div style={{ marginTop: SP.lg, marginBottom: SP.xl }}>
                <PillarCompositionBar segments={pillars.map(p => ({ label: p.label, color: bandColor, score: p.score, max: p.max }))} />
              </div>
              {pillars.map(p => {
                const confTone = CONFIDENCE_LEVEL[p.confidence]
                return (
                  <div key={p.key} style={{ marginBottom: SP.sm }}>
                    <EvidenceRow
                      label={p.label}
                      score={p.score}
                      color={riskLevelColor(confTone === 'low' ? 'low' : confTone === 'medium' ? 'medium' : 'high')}
                      rationale={p.rationale}
                      right={<Badge tone={confTone}>{p.confidence} confidence</Badge>}
                    />
                    {p.key_factors.length > 0 && (
                      <div style={{ paddingLeft: 44, marginTop: 4 }}>
                        <FactorList factors={p.key_factors} />
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          ) : (
            <p style={{ fontFamily: F.sans, fontSize: FS.sm, lineHeight: 1.55, color: C.textMuted, marginTop: SP.md }}>
              No structured pillar assessment available for this score (scored under prompt v1).
            </p>
          )}
        </div>

        {/* 03 — Analysis: accent-rule editorial block */}
        <div style={{ marginBottom: SP.xxxl }}>
          <StepLabel n="03" accent>Analysis</StepLabel>
          <div style={{ borderLeft: `2px solid ${C.accent}`, paddingLeft: SP.xl, marginTop: SP.md }}>
            <p style={{ margin: 0, fontSize: FS.base, lineHeight: 1.75, color: C.textPrimary }}>{score.ai_summary}</p>
          </div>
        </div>

        {/* 04 — Guidance: accent-rule block, numbered list retained verbatim */}
        <div>
          <StepLabel n="04">Guidance</StepLabel>
          <div style={{ borderLeft: `2px solid ${C.border}`, paddingLeft: SP.xl, marginTop: SP.md }}>
            {counterfactuals.length === 0 ? (
              <p style={{ fontFamily: F.sans, fontSize: FS.sm, color: C.textMuted, margin: 0 }}>None recorded for this assessment.</p>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {counterfactuals.map((text, i) => (
                  <li key={i} style={{ display: 'flex', gap: SP.md, padding: `${SP.sm}px 0`, borderTop: i > 0 ? `1px solid ${C.border}` : 'none' }}>
                    <span style={{ ...monoCss, fontSize: FS.sm, color: C.textMuted, flexShrink: 0, width: 16 }}>{i + 1}.</span>
                    <span style={{ fontFamily: F.sans, fontSize: FS.sm, lineHeight: 1.55, color: C.textSecondary }}>{text}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
