'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ScoreResult } from '@/types'
import { readScoreSession, ScoreSessionPayload } from '@/lib/score-session'

type PillarFactor = { name: string; score: number; max: number; rationale: string }
type Pillar = { score: number; max: number; factors: PillarFactor[] }
type ScorePillars = { trust: Pillar; track_record: Pillar; financial_health: Pillar; esg: Pillar }

const PILLAR_LABELS: Record<string, { label: string; color: string }> = {
  trust:            { label: 'Trust',            color: '#4a9eff' },
  track_record:     { label: 'Track Record',     color: '#1D9E75' },
  financial_health: { label: 'Financial Health',  color: '#BA7517' },
  esg:              { label: 'ESG Alignment',    color: '#9b59b6' },
}

function PillarBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ height: 6, background: '#1a1a28', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.8s ease' }} />
    </div>
  )
}

function ScoreRing({ total, max }: { total: number; max: number }) {
  const pct = Math.round((total / max) * 100)
  const color = pct >= 70 ? '#1D9E75' : pct >= 45 ? '#BA7517' : '#E24B4A'
  return (
    <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto' }}>
      <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r="42" fill="none" stroke="#1a1a28" strokeWidth="8" />
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${pct * 2.64} 264`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: '"DM Serif Display", serif' }}>{total}</div>
        <div style={{ fontSize: 10, color: '#555' }}>/ {max}</div>
      </div>
    </div>
  )
}

const BAND_CONFIG = {
  low:    { color: '#1D9E75', bg: '#0d2a20', label: 'Low risk',    headline: 'Great news.' },
  medium: { color: '#BA7517', bg: '#2a1e0a', label: 'Medium risk', headline: 'Good standing.' },
  high:   { color: '#E24B4A', bg: '#2a0d0d', label: 'Higher risk', headline: 'We\'ve found a path.' }
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

      setNotFound(true)
      setLoading(false)
    }

    load()
  }, [id])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#4a9eff', fontFamily: '"DM Sans", sans-serif' }}>
        <div style={{ fontSize: 13, letterSpacing: '0.1em', marginBottom: 16 }}>CALCULATING YOUR ETHOSCORE™</div>
        <div style={{ width: 240, height: 2, background: '#1a1a28', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: '#4a9eff', animation: 'load 1.5s ease-in-out infinite', width: '40%' }} />
        </div>
        <style>{`@keyframes load { 0%{transform:translateX(-100%)} 100%{transform:translateX(700%)} }`}</style>
      </div>
    </div>
  )

  if (notFound || !view) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', fontFamily: '"DM Sans", sans-serif', padding: 40 }}>
        <p style={{ marginBottom: 16 }}>Score not found.</p>
        <p style={{ fontSize: 14, color: '#666', maxWidth: 420, lineHeight: 1.6 }}>
          Results are available right after you submit an application. If you opened this link in a new tab, submit again from the apply flow.
        </p>
        <a href="/apply" style={{ display: 'inline-block', marginTop: 20, color: '#4a9eff', fontSize: 14 }}>Go to apply →</a>
      </div>
    )
  }

  const { fullName, score, pillars } = view
  const band = BAND_CONFIG[score.risk_band]
  const rec = score.recommendation

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
    <div id="ethofi-screen" style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', fontFamily: '"DM Sans", sans-serif' }}>
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
        .pdf-logo { display: flex; align-items: center; gap: 8px; }
        .pdf-logo-icon { width: 28px; height: 28px; border-radius: 6px; background: #1a56db; display: flex; align-items: center; justify-content: center; }
        .pdf-brand { font-family: Georgia, serif; font-size: 17px; font-weight: 700; color: #111; }
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

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 24px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: '#4a9eff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 5V8C14 11.31 11.46 14.42 8 15C4.54 14.42 2 11.31 2 8V5L8 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 16 }}>EthosFi</span>
        </div>

        <p style={{ color: '#666', fontSize: 14, marginBottom: 8 }}>Hello {fullName.split(' ')[0]},</p>
        <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 36, fontWeight: 400, margin: '0 0 32px', lineHeight: 1.1 }}>
          {band.headline}
        </h1>

        {/* Score card */}
        <div style={{ background: band.bg, border: `1px solid ${band.color}33`, borderRadius: 20, padding: '32px', marginBottom: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 11, letterSpacing: '0.12em', color: band.color, margin: '0 0 12px', textTransform: 'uppercase' }}>Your EthoScore™</p>
          <div style={{ fontSize: 96, fontFamily: '"DM Serif Display", serif', color: band.color, lineHeight: 1, animation: 'countUp 0.6s ease forwards' }}>
            {score.etho_score}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${band.color}22`, border: `1px solid ${band.color}44`, borderRadius: 20, padding: '6px 16px', marginTop: 12 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: band.color }} />
            <span style={{ fontSize: 13, color: band.color }}>{band.label}</span>
          </div>

          {/* Score bar */}
          <div style={{ marginTop: 24, position: 'relative' }}>
            <div style={{ height: 6, background: '#1a1a28', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${score.etho_score}%`, background: band.color, borderRadius: 3, transition: 'width 1s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#444' }}>
              <span>0</span><span>50</span><span>100</span>
            </div>
          </div>
        </div>

        {/* Recommendation banner */}
        <div style={{
          background: rec === 'approve' ? '#0d2a20' : rec === 'review' ? '#2a1e0a' : '#2a0d0d',
          border: `1px solid ${rec === 'approve' ? '#1D9E7533' : rec === 'review' ? '#BA751733' : '#E24B4A33'}`,
          borderRadius: 12, padding: '16px 20px', marginBottom: 24
        }}>
          <p style={{ margin: 0, fontSize: 14, color: rec === 'approve' ? '#1D9E75' : rec === 'review' ? '#BA7517' : '#E24B4A' }}>
            {rec === 'approve' && '✓ AI recommendation: Approve — your profile meets lending criteria.'}
            {rec === 'review' && '◎ AI recommendation: Manual review — a lender will assess your application.'}
            {rec === 'decline' && '○ AI recommendation: Not approved at this time — see improvement tips below.'}
          </p>
        </div>

        {/* AI Summary */}
        <div style={{ background: '#13131a', border: '1px solid #2a2a38', borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>AI assessment</p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: '#ccc' }}>{score.ai_summary}</p>
        </div>

        {/* Factors */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Score breakdown — 5 factors</p>
          {score.factors.map((f, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{f.name}</span>
                <span style={{ fontSize: 14, color: f.score >= 70 ? '#1D9E75' : f.score >= 40 ? '#BA7517' : '#E24B4A', fontWeight: 500 }}>{f.score}/100</span>
              </div>
              <div style={{ height: 4, background: '#1a1a28', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${f.score}%`, background: f.score >= 70 ? '#1D9E75' : f.score >= 40 ? '#BA7517' : '#E24B4A', borderRadius: 2 }} />
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#666', lineHeight: 1.5 }}>{f.rationale}</p>
            </div>
          ))}
        </div>

        {/* Why This Score — v2 pillar breakdown */}
        {pillars && (
          <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 14, padding: '24px', marginBottom: 24 }}>
            <p style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>Why this score</p>

            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 20, alignItems: 'start' }}>
              <div style={{ textAlign: 'center' }}>
                <ScoreRing total={Object.values(pillars).reduce((s: number, p: Pillar) => s + p.score, 0)} max={1000} />
                <div style={{ marginTop: 8, fontSize: 11, color: '#555' }}>Structured Score</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(Object.entries(pillars) as [string, Pillar][]).map(([key, pillar]) => {
                  const meta = PILLAR_LABELS[key] ?? { label: key, color: '#888' }
                  return (
                    <div key={key} style={{ background: '#0a0a0f', border: '1px solid #1a1a28', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: meta.color }}>{meta.label}</span>
                        <span style={{ fontSize: 11, color: '#555' }}>{pillar.score}/{pillar.max}</span>
                      </div>
                      <PillarBar value={pillar.score} max={pillar.max} color={meta.color} />
                      <div style={{ marginTop: 8 }}>
                        {pillar.factors.map((f: PillarFactor) => (
                          <div key={f.name} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666', marginBottom: 2 }}>
                              <span>{f.name}</span>
                              <span>{f.score}/{f.max}</span>
                            </div>
                            <PillarBar value={f.score} max={f.max} color={meta.color} />
                            <div style={{ fontSize: 9, color: '#444', marginTop: 1 }}>{f.rationale}</div>
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
        <div style={{ borderTop: '1px solid #1a1a28', paddingTop: 24, marginBottom: 24 }}>
          <p style={{ fontSize: 12, color: '#444', lineHeight: 1.6 }}>
            <strong style={{ color: '#555' }}>EU AI Act compliance.</strong> This assessment was made by an AI system. Under Article 22, you have the right to request human review of this decision. Contact <span style={{ color: '#4a9eff' }}>review@ethosfai.com</span> within 30 days.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <a href="/apply" style={{ flex: 1, padding: '14px 20px', borderRadius: 10, border: '1px solid #2a2a38', color: '#888', textAlign: 'center', textDecoration: 'none', fontSize: 14 }}>Apply again</a>
          <button type="button" onClick={() => window.print()} style={{ flex: 1, padding: '14px 20px', borderRadius: 10, background: '#4a9eff', color: '#000', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'inherit' }}>Export PDF</button>
        </div>
      </div>

    </div>

      {/* ── Hidden PDF layout — visible only on print ── */}
      <div id="ethofi-pdf" style={{ fontFamily: 'Georgia, "Times New Roman", serif', color: '#111', background: '#fff', padding: '0 8px' }}>

        {/* Header */}
        <div className="pdf-header">
          <div className="pdf-logo">
            <div className="pdf-logo-icon">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 5V8C14 11.31 11.46 14.42 8 15C4.54 14.42 2 11.31 2 8V5L8 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            </div>
            <span className="pdf-brand">EthosFi AI</span>
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
            <div className="pdf-score-num" style={{ color: band.color }}>{score.etho_score}</div>
            <div>
              <div className="pdf-band-badge" style={{ color: band.color, borderColor: band.color }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: band.color }} />
                {band.label}
              </div>
            </div>
          </div>
          <div className="pdf-bar-track">
            <div className="pdf-bar-fill" style={{ width: `${score.etho_score}%`, background: band.color }} />
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
          <strong>EU AI Act Compliance Notice (Article 22).</strong> This credit assessment was produced by an automated AI system (EthosFi AI, model: {score.model_version}). You have the right to request human review of this decision within 30 days of issue. To exercise this right, contact <strong>review@ethosfai.com</strong> with your Application ID. You may also request a plain-language explanation of the factors that influenced this score.
        </div>

        {/* Footer */}
        <div className="pdf-footer">
          <span>EthosFi AI · ethosfiai.com</span>
          <span>This report is confidential and intended solely for the named applicant.</span>
          <span>Generated {new Date().toLocaleDateString('en-GB')}</span>
        </div>
      </div>
    </>
  )
}
