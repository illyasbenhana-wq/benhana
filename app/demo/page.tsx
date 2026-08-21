'use client'
import { useEffect, useState } from 'react'
import { Logo } from '../components/Logo'
import { DashboardSidebar } from '../components/DashboardSidebar'
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
} from '../../lib/design-system/tokens-light'

type PillarFactor = { name: string; score: number; max: number; rationale: string }
type Pillar = { score: number; max: number; factors: PillarFactor[] }
type Anomaly = { type: string; severity: string; description: string }
type TopRisk = { entity_name: string; risk_score: number; case_ref: string }
type Comparison = { factor: string; applicant: number; cohort_avg: number; percentile: number }

interface DemoData {
  applicant: { name: string; employment: string; income: number; loan_amount: number; loan_purpose: string; loan_term_months: number }
  structured_score: { total: number; normalized: number; pillars: { trust: Pillar; track_record: Pillar; financial_health: Pillar; esg: Pillar } }
  risk_snapshot: { total_exposure: number; avg_etho_score: number | null; risk_distribution: { low: number; medium: number; high: number }; top_risks: TopRisk[] } | null
  anomalies: Anomaly[]
  benchmark: { percentile: number; peer_cohort: { size: number; avg_score: number; median_score: number }; comparisons: Comparison[]; basis: string }
}

const PILLAR_LABELS: Record<string, { label: string; color: string }> = {
  trust:            { label: 'Trust',            color: C.accent },
  track_record:     { label: 'Track Record',     color: C.riskLow },
  financial_health: { label: 'Financial Health',  color: C.riskMedium },
  esg:              { label: 'ESG Alignment',    color: '#7C3AED' },
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.8s ease' }} />
    </div>
  )
}

function ScoreRing({ total, max }: { total: number; max: number }) {
  const pct = Math.round((total / max) * 100)
  const color = pct >= 70 ? C.riskLow : pct >= 45 ? C.riskMedium : C.riskHigh
  return (
    <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto' }}>
      <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r="42" fill="none" stroke={C.border} strokeWidth="8" />
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${pct * 2.64} 264`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 36, fontWeight: FW.bold, color, fontFamily: F.sans }}>{total}</div>
        <div style={{ fontSize: FS.xs, color: C.textMuted }}>/ {max}</div>
      </div>
    </div>
  )
}

export default function DemoPage() {
  const [data, setData] = useState<DemoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') ?? ''
    fetch(`/api/demo-data?token=${encodeURIComponent(token)}`)
      .then(r => {
        if (r.status === 401) { setAuthError(true); setLoading(false); return null }
        return r.json()
      })
      .then(d => { if (d) { setData(d); setLoading(false) } })
      .catch(() => setLoading(false))
  }, [])

  if (authError) {
    return (
      <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans, flexDirection: 'column', gap: SP.md }}>
        <link href={googleFontsHref} rel="stylesheet" />
        <div style={{ marginBottom: 8 }}>
          <Logo size="md" />
        </div>
        <p style={{ fontSize: FS.md, fontWeight: FW.medium }}>Demo Access</p>
        <p style={{ color: C.textSecondary, fontSize: FS.sm }}>This demo requires an access link. Please contact us for access.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans }}>
        <link href={googleFontsHref} rel="stylesheet" />
        <p style={{ color: C.textSecondary, fontSize: FS.base }}>Loading demo...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans }}>
        <link href={googleFontsHref} rel="stylesheet" />
        <p style={{ color: C.riskHigh }}>Failed to load demo data.</p>
      </div>
    )
  }

  const { applicant, structured_score: ss, risk_snapshot: rs, anomalies, benchmark: bm } = data
  const pillars = ss.pillars
  const pillarEntries = Object.entries(pillars) as [string, Pillar][]

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans, overflow: 'hidden' }}>
      <link href={googleFontsHref} rel="stylesheet" />

      <DashboardSidebar />

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ borderBottom: borderLine, padding: `${SP.lg}px ${SP.xxl}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo size="md" />
          <div style={{ fontSize: FS.xs, color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Decision Intelligence Platform</div>
        </div>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: `${SP.xxl}px ${SP.xl}px` }}>

          {/* Applicant Summary */}
          <div style={{ marginBottom: SP.xxxl }}>
            <div style={{ fontSize: FS.xs, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: SP.sm }}>Sample Application</div>
            <h1 style={{ fontFamily: F.sans, fontSize: FS.xl, fontWeight: FW.bold, margin: `0 0 8px` }}>{applicant.name}</h1>
            <p style={{ color: C.textSecondary, fontSize: FS.base, margin: 0 }}>
              {applicant.employment} &middot; £{applicant.income.toLocaleString()}/mo &middot; Requesting £{applicant.loan_amount.toLocaleString()} for {applicant.loan_purpose} over {applicant.loan_term_months} months
            </p>
          </div>

          {/* Section 1: Why This Score */}
          <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm, padding: SP.xxl, marginBottom: SP.lg }}>
            <div style={{ fontSize: FS.xs, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: SP.xl }}>Why This Score</div>

            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: SP.xxl, alignItems: 'start' }}>
              {/* Score Ring */}
              <div style={{ textAlign: 'center' }}>
                <ScoreRing total={ss.total} max={1000} />
                <div style={{ marginTop: SP.md, fontSize: FS.xs, color: C.textSecondary }}>Structured EthoScore</div>
              </div>

              {/* Pillars */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.lg }}>
                {pillarEntries.map(([key, pillar]) => {
                  const meta = PILLAR_LABELS[key] ?? { label: key, color: C.textSecondary }
                  return (
                    <div key={key} style={{ background: C.background, border: borderLine, borderRadius: R.data, padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SP.md }}>
                        <span style={{ fontSize: FS.sm, fontWeight: FW.medium, color: meta.color }}>{meta.label}</span>
                        <span style={{ fontSize: FS.sm, color: C.textSecondary }}>{pillar.score} / {pillar.max}</span>
                      </div>
                      <Bar value={pillar.score} max={pillar.max} color={meta.color} />
                      <div style={{ marginTop: SP.md }}>
                        {pillar.factors.map(f => (
                          <div key={f.name} style={{ marginBottom: SP.sm }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FS.xs, color: C.textSecondary, marginBottom: 3 }}>
                              <span>{f.name}</span>
                              <span>{f.score}/{f.max}</span>
                            </div>
                            <Bar value={f.score} max={f.max} color={meta.color} />
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{f.rationale}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Row: Risk Snapshot + Anomalies */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.lg, marginBottom: SP.lg }}>

            {/* Section 2: Risk Snapshot */}
            <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm, padding: SP.xl }}>
              <div style={{ fontSize: FS.xs, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: SP.lg }}>Portfolio Risk Snapshot</div>
              {rs ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.lg, marginBottom: SP.xl }}>
                    <div>
                      <div style={{ fontSize: FS.lg, fontFamily: F.sans, fontWeight: FW.bold, color: C.accent }}>£{(rs.total_exposure / 1_000_000).toFixed(1)}M</div>
                      <div style={{ fontSize: FS.xs, color: C.textMuted }}>Total Exposure</div>
                    </div>
                    <div>
                      <div style={{ fontSize: FS.lg, fontFamily: F.sans, fontWeight: FW.bold, color: rs.avg_etho_score && rs.avg_etho_score >= 60 ? C.riskLow : C.riskMedium }}>{rs.avg_etho_score ?? 'N/A'}</div>
                      <div style={{ fontSize: FS.xs, color: C.textMuted }}>Avg EthoScore</div>
                    </div>
                  </div>

                  {/* Distribution */}
                  <div style={{ marginBottom: SP.xl }}>
                    <div style={{ fontSize: FS.xs, color: C.textSecondary, marginBottom: 6 }}>Risk Distribution</div>
                    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                      {(() => {
                        const d = rs.risk_distribution
                        const total = d.low + d.medium + d.high || 1
                        return (
                          <>
                            <div style={{ width: `${(d.low / total) * 100}%`, background: C.riskLow }} />
                            <div style={{ width: `${(d.medium / total) * 100}%`, background: C.riskMedium }} />
                            <div style={{ width: `${(d.high / total) * 100}%`, background: C.riskHigh }} />
                          </>
                        )
                      })()}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.textMuted, marginTop: 4 }}>
                      <span>Low: {rs.risk_distribution.low}</span>
                      <span>Medium: {rs.risk_distribution.medium}</span>
                      <span>High: {rs.risk_distribution.high}</span>
                    </div>
                  </div>

                  {/* Top Risks */}
                  {rs.top_risks.length > 0 && (
                    <div>
                      <div style={{ fontSize: FS.xs, color: C.textSecondary, marginBottom: SP.sm }}>Highest Risk Cases</div>
                      {rs.top_risks.slice(0, 3).map((r: TopRisk) => (
                        <div key={r.case_ref} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: borderLine, fontSize: FS.xs }}>
                          <div>
                            <span style={{ color: C.textPrimary, fontWeight: FW.medium }}>{r.entity_name}</span>
                            <span style={{ color: C.textMuted, marginLeft: 8 }}>{r.case_ref}</span>
                          </div>
                          <span style={{ color: r.risk_score >= 70 ? C.riskHigh : r.risk_score >= 50 ? C.riskMedium : C.riskLow, fontWeight: FW.semibold }}>{r.risk_score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p style={{ color: C.textMuted, fontSize: FS.sm }}>No risk data available.</p>
              )}
            </div>

            {/* Section 3: Anomalies */}
            <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm, padding: SP.xl }}>
              <div style={{ fontSize: FS.xs, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: SP.lg }}>Anomaly Detection</div>
              {anomalies.length > 0 ? (
                anomalies.slice(0, 3).map((a, i) => {
                  const sevColor = a.severity === 'high' ? C.riskHigh : a.severity === 'medium' ? C.riskMedium : C.riskLow
                  return (
                    <div key={i} style={{ background: C.background, border: borderLine, borderRadius: R.control, padding: '14px 16px', marginBottom: i < 2 ? SP.md : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: FS.xs, fontWeight: FW.medium, color: C.textPrimary }}>{a.type.replace(/_/g, ' ')}</span>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: C.accentSubtle, color: sevColor, fontWeight: FW.medium, textTransform: 'uppercase' }}>{a.severity}</span>
                      </div>
                      <p style={{ fontSize: FS.xs, color: C.textSecondary, margin: 0, lineHeight: 1.5 }}>{a.description}</p>
                    </div>
                  )
                })
              ) : (
                <div style={{ background: `${C.riskLow}0d`, border: `1px solid ${C.riskLow}44`, borderRadius: R.control, padding: '14px 16px' }}>
                  <div style={{ fontSize: FS.xs, fontWeight: FW.medium, color: C.riskLow, marginBottom: 4 }}>No anomalies detected</div>
                  <p style={{ fontSize: FS.xs, color: C.textSecondary, margin: 0 }}>All 5 detectors ran against live data. No velocity spikes, score drift, concentration risk, threshold clustering, or SLA breaches were flagged.</p>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Peer Comparison */}
          <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm, padding: `${SP.xl}px ${SP.xxl}px`, marginBottom: SP.xxxl }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SP.xl }}>
              <div>
                <div style={{ fontSize: FS.xs, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Peer Comparison</div>
                <div style={{ fontSize: FS.sm, color: C.textSecondary }}>vs {bm.peer_cohort.size} similar applicants (same employment type, similar loan size)</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: FS.xl, fontFamily: F.sans, fontWeight: FW.bold, color: bm.percentile >= 60 ? C.riskLow : bm.percentile >= 40 ? C.riskMedium : C.riskHigh }}>
                  {bm.percentile}<span style={{ fontSize: FS.sm, color: C.textMuted }}>th</span>
                </div>
                <div style={{ fontSize: FS.xs, color: C.textMuted }}>percentile</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.md }}>
              {bm.comparisons.map(c => {
                const diff = c.applicant - c.cohort_avg
                const diffColor = diff >= 0 ? C.riskLow : C.riskHigh
                return (
                  <div key={c.factor} style={{ background: C.background, border: borderLine, borderRadius: R.control, padding: '12px 16px' }}>
                    <div style={{ fontSize: FS.xs, fontWeight: FW.medium, marginBottom: SP.sm }}>{c.factor}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <div>
                        <span style={{ fontSize: FS.lg, fontWeight: FW.bold, color: C.textPrimary }}>{c.applicant}</span>
                        <span style={{ fontSize: FS.xs, color: C.textMuted, marginLeft: 4 }}>applicant</span>
                      </div>
                      <div style={{ fontSize: FS.xs, color: C.textSecondary }}>avg {c.cohort_avg}</div>
                    </div>
                    <Bar value={c.applicant} max={100} color={diffColor} />
                    <div style={{ fontSize: 10, color: diffColor, marginTop: 4 }}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(1)} vs cohort &middot; {c.percentile}th percentile
                    </div>
                  </div>
                )
              })}
            </div>
            {bm.basis === 'illustrative' && (
              <div style={{ marginTop: SP.lg, padding: '12px 16px', background: C.accentSubtle, border: borderLine, borderRadius: R.control, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 24, minWidth: 24, height: 24, borderRadius: 6, background: `${C.riskMedium}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: C.riskMedium, fontSize: FS.base, fontWeight: FW.bold }}>!</span>
                </div>
                <div>
                  <div style={{ fontSize: FS.xs, fontWeight: FW.medium, color: C.riskMedium, marginBottom: 2 }}>Illustrative Comparison</div>
                  <div style={{ fontSize: FS.xs, color: C.textSecondary }}>This peer comparison uses representative data. Live benchmarking activates automatically once 12 or more applications have been scored in this segment.</div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', padding: '20px 0', borderTop: borderLine }}>
            <span style={{ fontSize: FS.xs, color: C.textMuted }}>EthosFi Decision Intelligence Platform &middot; EU AI Act Compliant &middot; Explainable by Design</span>
          </div>
        </div>
      </div>
    </div>
  )
}
