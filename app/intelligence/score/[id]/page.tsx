'use client'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { C, F, SP, cardCss, labelCss, googleFontsHref } from './components/styles'
import { ScoreGauge } from './components/ScoreGauge'
import { ProvenanceBar } from './components/ProvenanceBar'
import { PillarTable, pillarsFromFable5Assessment, type PillarDatum } from './components/PillarTable'
import { CounterfactualPanel } from './components/CounterfactualPanel'
import { ExplainabilityBadge, deriveExplainabilityStatus } from './components/ExplainabilityBadge'

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ ...labelCss, marginBottom: SP.md }}>{children}</p>
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
          if (!cancelled) setError(res.status === 404 ? 'No score found for this application.' : `Request failed (${res.status})`)
          return
        }
        const json = await res.json()
        if (!cancelled) setData(parsePanelData(json.application, json.score))
      } catch (e) {
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

  return (
    <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans }}>
      <link href={googleFontsHref} rel="stylesheet" />

      <div style={{ maxWidth: 880, margin: '0 auto', padding: `${SP.xxl}px ${SP.xl}px` }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: SP.xl }}>
          <div>
            <p style={{ fontFamily: F.mono, fontSize: 11, color: C.textMuted, marginBottom: SP.xs }}>
              APPLICATION {application.id}
            </p>
            <h1 style={{ fontFamily: F.sans, fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em', margin: 0 }}>{application.full_name}</h1>
          </div>
          <ExplainabilityBadge status={explainability} />
        </div>

        {/* Score + provenance */}
        <div style={{ ...cardCss, padding: SP.xl, marginBottom: SP.xl }}>
          <div style={{ marginBottom: SP.lg }}>
            <ScoreGauge score={gaugeScore} max={gaugeMax} riskBand={score.risk_band} />
          </div>
          <ProvenanceBar
            data={{
              model_requested: score.model_requested,
              model_responded: score.model_responded,
              prompt_version: score.prompt_version,
              created_at: score.created_at,
              confidence_overall: score.confidence_overall,
            }}
          />
        </div>

        {/* Pillar breakdown */}
        {pillars.length > 0 ? (
          <div style={{ marginBottom: SP.xl }}>
            <SectionLabel>4-Pillar Breakdown</SectionLabel>
            <PillarTable pillars={pillars} />
          </div>
        ) : (
          <div style={{ ...cardCss, padding: SP.lg, marginBottom: SP.xl }}>
            <SectionLabel>4-Pillar Breakdown</SectionLabel>
            <p style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.55, color: C.textMuted }}>
              No structured pillar assessment available for this score (scored under prompt v1).
            </p>
          </div>
        )}

        {/* Counterfactuals */}
        <div style={{ marginBottom: SP.xl }}>
          <CounterfactualPanel counterfactuals={counterfactuals} />
        </div>

        {/* AI summary, for reference */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: SP.lg }}>
          <SectionLabel>AI Summary</SectionLabel>
          <p style={{ fontFamily: F.sans, fontSize: 13, lineHeight: 1.55, color: C.textSecondary }}>{score.ai_summary}</p>
        </div>
      </div>
    </div>
  )
}
