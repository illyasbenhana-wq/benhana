'use client'
import { useEffect, useState } from 'react'

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
  trust:            { label: 'Trust',            color: '#4a9eff' },
  track_record:     { label: 'Track Record',     color: '#1D9E75' },
  financial_health: { label: 'Financial Health',  color: '#BA7517' },
  esg:              { label: 'ESG Alignment',    color: '#9b59b6' },
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
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
    <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto' }}>
      <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r="42" fill="none" stroke="#1a1a28" strokeWidth="8" />
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8" strokeDasharray={`${pct * 2.64} 264`} strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 36, fontWeight: 700, color, fontFamily: '"DM Serif Display", serif' }}>{total}</div>
        <div style={{ fontSize: 11, color: '#555' }}>/ {max}</div>
      </div>
    </div>
  )
}

export default function DemoPage() {
  const [data, setData] = useState<DemoData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/demo-data')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif' }}>
        <p style={{ color: '#555', fontSize: 14 }}>Loading demo...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif' }}>
        <p style={{ color: '#E24B4A' }}>Failed to load demo data.</p>
      </div>
    )
  }

  const { applicant, structured_score: ss, risk_snapshot: rs, anomalies, benchmark: bm } = data
  const pillars = ss.pillars
  const pillarEntries = Object.entries(pillars) as [string, Pillar][]

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: '1px solid #1a1a28', padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#4a9eff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 5V8C14 11.31 11.46 14.42 8 15C4.54 14.42 2 11.31 2 8V5L8 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18 }}>EthosFi</span>
        </div>
        <div style={{ fontSize: 12, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Decision Intelligence Platform</div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px' }}>

        {/* Applicant Summary */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Sample Application</div>
          <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 32, fontWeight: 400, margin: '0 0 8px' }}>{applicant.name}</h1>
          <p style={{ color: '#888', fontSize: 14, margin: 0 }}>
            {applicant.employment} &middot; £{applicant.income.toLocaleString()}/mo &middot; Requesting £{applicant.loan_amount.toLocaleString()} for {applicant.loan_purpose} over {applicant.loan_term_months} months
          </p>
        </div>

        {/* Section 1: Why This Score */}
        <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 16, padding: '32px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>Why This Score</div>

          <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 32, alignItems: 'start' }}>
            {/* Score Ring */}
            <div style={{ textAlign: 'center' }}>
              <ScoreRing total={ss.total} max={1000} />
              <div style={{ marginTop: 12, fontSize: 12, color: '#888' }}>Structured EthoScore</div>
            </div>

            {/* Pillars */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {pillarEntries.map(([key, pillar]) => {
                const meta = PILLAR_LABELS[key] ?? { label: key, color: '#888' }
                return (
                  <div key={key} style={{ background: '#0a0a0f', border: '1px solid #1a1a28', borderRadius: 12, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: meta.color }}>{meta.label}</span>
                      <span style={{ fontSize: 13, color: '#888' }}>{pillar.score} / {pillar.max}</span>
                    </div>
                    <Bar value={pillar.score} max={pillar.max} color={meta.color} />
                    <div style={{ marginTop: 12 }}>
                      {pillar.factors.map(f => (
                        <div key={f.name} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888', marginBottom: 3 }}>
                            <span>{f.name}</span>
                            <span>{f.score}/{f.max}</span>
                          </div>
                          <Bar value={f.score} max={f.max} color={meta.color} />
                          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{f.rationale}</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>

          {/* Section 2: Risk Snapshot */}
          <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 16, padding: '24px' }}>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Portfolio Risk Snapshot</div>
            {rs ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 24, fontFamily: '"DM Serif Display", serif', color: '#4a9eff' }}>£{(rs.total_exposure / 1_000_000).toFixed(1)}M</div>
                    <div style={{ fontSize: 11, color: '#555' }}>Total Exposure</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontFamily: '"DM Serif Display", serif', color: rs.avg_etho_score && rs.avg_etho_score >= 60 ? '#1D9E75' : '#BA7517' }}>{rs.avg_etho_score ?? 'N/A'}</div>
                    <div style={{ fontSize: 11, color: '#555' }}>Avg EthoScore</div>
                  </div>
                </div>

                {/* Distribution */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Risk Distribution</div>
                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                    {(() => {
                      const d = rs.risk_distribution
                      const total = d.low + d.medium + d.high || 1
                      return (
                        <>
                          <div style={{ width: `${(d.low / total) * 100}%`, background: '#1D9E75' }} />
                          <div style={{ width: `${(d.medium / total) * 100}%`, background: '#BA7517' }} />
                          <div style={{ width: `${(d.high / total) * 100}%`, background: '#E24B4A' }} />
                        </>
                      )
                    })()}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#555', marginTop: 4 }}>
                    <span>Low: {rs.risk_distribution.low}</span>
                    <span>Medium: {rs.risk_distribution.medium}</span>
                    <span>High: {rs.risk_distribution.high}</span>
                  </div>
                </div>

                {/* Top Risks */}
                {rs.top_risks.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Highest Risk Cases</div>
                    {rs.top_risks.slice(0, 3).map((r: TopRisk) => (
                      <div key={r.case_ref} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #1a1a28', fontSize: 12 }}>
                        <div>
                          <span style={{ color: '#e8e6df', fontWeight: 500 }}>{r.entity_name}</span>
                          <span style={{ color: '#555', marginLeft: 8 }}>{r.case_ref}</span>
                        </div>
                        <span style={{ color: r.risk_score >= 70 ? '#E24B4A' : r.risk_score >= 50 ? '#BA7517' : '#1D9E75', fontWeight: 600 }}>{r.risk_score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: '#555', fontSize: 13 }}>No risk data available.</p>
            )}
          </div>

          {/* Section 3: Anomalies */}
          <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 16, padding: '24px' }}>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Anomaly Detection</div>
            {anomalies.length > 0 ? (
              anomalies.slice(0, 3).map((a, i) => {
                const sevColor = a.severity === 'high' ? '#E24B4A' : a.severity === 'medium' ? '#BA7517' : '#1D9E75'
                return (
                  <div key={i} style={{ background: '#0a0a0f', border: '1px solid #1a1a28', borderRadius: 10, padding: '14px 16px', marginBottom: i < 2 ? 12 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#e8e6df' }}>{a.type.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${sevColor}22`, color: sevColor, fontWeight: 500, textTransform: 'uppercase' }}>{a.severity}</span>
                    </div>
                    <p style={{ fontSize: 12, color: '#888', margin: 0, lineHeight: 1.5 }}>{a.description}</p>
                  </div>
                )
              })
            ) : (
              <div style={{ background: '#0d2a20', border: '1px solid #1D9E7544', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#1D9E75', marginBottom: 4 }}>No anomalies detected</div>
                <p style={{ fontSize: 12, color: '#888', margin: 0 }}>All 5 detectors ran against live data. No velocity spikes, score drift, concentration risk, threshold clustering, or SLA breaches were flagged.</p>
              </div>
            )}
          </div>
        </div>

        {/* Section 4: Peer Comparison */}
        <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 16, padding: '24px 32px', marginBottom: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Peer Comparison</div>
              <div style={{ fontSize: 13, color: '#888' }}>vs {bm.peer_cohort.size} similar applicants (same employment type, similar loan size)</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 28, fontFamily: '"DM Serif Display", serif', color: bm.percentile >= 60 ? '#1D9E75' : bm.percentile >= 40 ? '#BA7517' : '#E24B4A' }}>
                {bm.percentile}<span style={{ fontSize: 14, color: '#555' }}>th</span>
              </div>
              <div style={{ fontSize: 11, color: '#555' }}>percentile</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {bm.comparisons.map(c => {
              const diff = c.applicant - c.cohort_avg
              const diffColor = diff >= 0 ? '#1D9E75' : '#E24B4A'
              return (
                <div key={c.factor} style={{ background: '#0a0a0f', border: '1px solid #1a1a28', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>{c.factor}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#e8e6df' }}>{c.applicant}</span>
                      <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>applicant</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>avg {c.cohort_avg}</div>
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
            <div style={{ marginTop: 12, fontSize: 11, color: '#555', fontStyle: 'italic' }}>
              Illustrative data shown. Live benchmarking activates with 12+ scored applications in the same segment.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '20px 0', borderTop: '1px solid #1a1a28' }}>
          <span style={{ fontSize: 12, color: '#333' }}>EthosFi Decision Intelligence Platform &middot; EU AI Act Compliant &middot; Explainable by Design</span>
        </div>
      </div>
    </div>
  )
}
