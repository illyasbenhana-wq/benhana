'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return url && key ? createClient(url, key) : null
})()

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskBand = 'low' | 'medium' | 'high'
type Recommendation = 'approve' | 'review' | 'decline'

type Application = {
  id: string
  created_at: string
  full_name: string
  email: string
  loan_amount: number
  loan_purpose: string
  employment_type: string
  status: string
  scores: {
    etho_score: number
    risk_band: RiskBand
    recommendation: Recommendation
  } | null
}

// ─── Mock Data (no-DB mode) ───────────────────────────────────────────────────

const MOCK_APPS: Application[] = [
  { id: '1', created_at: new Date(Date.now() - 3600000).toISOString(),  full_name: 'Amara Diallo',    email: 'amara@example.com',   loan_amount: 8000,  loan_purpose: 'Equipment',   employment_type: 'self_employed', status: 'scored', scores: { etho_score: 78, risk_band: 'low',    recommendation: 'approve'  } },
  { id: '2', created_at: new Date(Date.now() - 7200000).toISOString(),  full_name: 'Lee Park',        email: 'lee@example.com',     loan_amount: 5000,  loan_purpose: 'Working capital', employment_type: 'gig',          status: 'scored', scores: { etho_score: 61, risk_band: 'medium', recommendation: 'review'   } },
  { id: '3', created_at: new Date(Date.now() - 14400000).toISOString(), full_name: 'Sofia Reyes',     email: 'sofia@example.com',   loan_amount: 12000, loan_purpose: 'Vehicle',     employment_type: 'employed',      status: 'scored', scores: { etho_score: 82, risk_band: 'low',    recommendation: 'approve'  } },
  { id: '4', created_at: new Date(Date.now() - 21600000).toISOString(), full_name: 'James Okafor',   email: 'james@example.com',   loan_amount: 3500,  loan_purpose: 'Education',   employment_type: 'freelance',     status: 'scored', scores: { etho_score: 44, risk_band: 'medium', recommendation: 'review'   } },
  { id: '5', created_at: new Date(Date.now() - 43200000).toISOString(), full_name: 'Nina Kowalski',  email: 'nina@example.com',    loan_amount: 2000,  loan_purpose: 'Emergency',   employment_type: 'unemployed',    status: 'scored', scores: { etho_score: 29, risk_band: 'high',   recommendation: 'decline'  } },
  { id: '6', created_at: new Date(Date.now() - 86400000).toISOString(), full_name: 'Marcus Webb',    email: 'marcus@example.com',  loan_amount: 15000, loan_purpose: 'Expansion',   employment_type: 'self_employed', status: 'scored', scores: { etho_score: 73, risk_band: 'low',    recommendation: 'approve'  } },
  { id: '7', created_at: new Date(Date.now() - 90000000).toISOString(), full_name: 'Priya Sharma',   email: 'priya@example.com',   loan_amount: 6500,  loan_purpose: 'Inventory',   employment_type: 'employed',      status: 'scored', scores: { etho_score: 38, risk_band: 'high',   recommendation: 'decline'  } },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BAND_COLOR: Record<RiskBand, string> = {
  low: '#1D9E75',
  medium: '#BA7517',
  high: '#E24B4A',
}

const REC_LABEL: Record<Recommendation, string> = {
  approve: 'Approve',
  review: 'Review',
  decline: 'Decline',
}

const REC_COLOR: Record<Recommendation, string> = {
  approve: '#1D9E75',
  review: '#BA7517',
  decline: '#E24B4A',
}

function fmt(n: number) {
  return n >= 1000 ? `£${(n / 1000).toFixed(0)}k` : `£${n}`
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor(diff / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d ago`
  if (h >= 1)  return `${h}h ago`
  return `${m}m ago`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LenderDashboard() {
  const router = useRouter()
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setApps(MOCK_APPS)
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }

      supabase!
        .from('applications')
        .select('id, created_at, full_name, email, loan_amount, loan_purpose, employment_type, status, scores(etho_score, risk_band, recommendation)')
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data, error }) => {
          if (error) console.error('[lender] applications query failed:', error)
          const rows: Application[] = (data ?? []).map((row: any) => ({
            ...row,
            scores: Array.isArray(row.scores) ? (row.scores[0] ?? null) : row.scores,
          }))
          setApps(rows.length ? rows : MOCK_APPS)
          setLoading(false)
        })
    })
  }, [router])

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut()
    router.push('/login')
  }

  // ── Derived metrics ────────────────────────────────────────────────────────

  const scored = apps.filter(a => a.scores)
  const totalVolume   = apps.reduce((s, a) => s + a.loan_amount, 0)
  const approvedCount = scored.filter(a => a.scores?.recommendation === 'approve').length
  const approvalRate  = scored.length ? Math.round((approvedCount / scored.length) * 100) : 0
  const avgScore      = scored.length ? Math.round(scored.reduce((s, a) => s + (a.scores?.etho_score ?? 0), 0) / scored.length) : 0
  const riskDist = {
    low:    scored.filter(a => a.scores?.risk_band === 'low').length,
    medium: scored.filter(a => a.scores?.risk_band === 'medium').length,
    high:   scored.filter(a => a.scores?.risk_band === 'high').length,
  }
  const riskTotal = riskDist.low + riskDist.medium + riskDist.high || 1

  const kpis = [
    { label: 'Total Loan Volume', value: totalVolume >= 1000 ? `£${(totalVolume / 1000).toFixed(0)}k` : `£${totalVolume}`, sub: `${apps.length} applications` },
    { label: 'Approval Rate',     value: `${approvalRate}%`, sub: `${approvedCount} of ${scored.length} scored` },
    { label: 'Average EthoScore', value: String(avgScore),   sub: avgScore >= 70 ? 'Low risk overall' : avgScore >= 50 ? 'Medium risk overall' : 'High risk overall' },
    { label: 'Pending Review',    value: String(scored.filter(a => a.scores?.recommendation === 'review').length), sub: 'Require human decision' },
  ]

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: #2a2a38; border-radius: 2px; }
        .row-hover:hover { background: #13131e !important; }
        .sign-out:hover { color: #e24b4a !important; border-color: #3a1a1a !important; }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid #1a1a28' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: '#4a9eff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L14 5V8C14 11.31 11.46 14.42 8 15C4.54 14.42 2 11.31 2 8V5L8 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 16 }}>EthosFi</span>
          <span style={{ fontSize: 11, color: '#555', background: '#13131a', border: '1px solid #1e1e2e', borderRadius: 4, padding: '2px 8px', marginLeft: 4 }}>Lender</span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="sign-out"
          style={{ background: 'none', border: '1px solid #2a2a38', borderRadius: 6, padding: '6px 14px', color: '#555', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s, border-color 0.15s' }}
        >
          Sign out
        </button>
      </nav>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 64px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 400, fontFamily: '"DM Serif Display", serif' }}>Lender Dashboard</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#555' }}>Loan applications · AI scoring · Risk overview</p>
        </div>

        {loading ? (
          <div style={{ color: '#555', fontSize: 13, paddingTop: 40, textAlign: 'center' }}>Loading…</div>
        ) : (
          <>
            {/* ── KPI Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
              {kpis.map(k => (
                <div key={k.label} style={{ background: '#0d0d14', border: '1px solid #1a1a28', borderRadius: 12, padding: '20px 22px' }}>
                  <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{k.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-0.02em', marginBottom: 4 }}>{k.value}</div>
                  <div style={{ fontSize: 12, color: '#444' }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* ── Risk Distribution ── */}
            <div style={{ background: '#0d0d14', border: '1px solid #1a1a28', borderRadius: 12, padding: '22px 24px', marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 18 }}>Risk Distribution</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
                {(['low', 'medium', 'high'] as RiskBand[]).map(band => (
                  <div key={band} style={{ background: '#13131e', borderRadius: 8, padding: '14px 16px', borderLeft: `3px solid ${BAND_COLOR[band]}` }}>
                    <div style={{ fontSize: 22, fontWeight: 500, color: BAND_COLOR[band] }}>{riskDist[band]}</div>
                    <div style={{ fontSize: 12, color: '#555', marginTop: 3, textTransform: 'capitalize' }}>{band} risk</div>
                    <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>{Math.round((riskDist[band] / riskTotal) * 100)}%</div>
                  </div>
                ))}
              </div>
              {/* Bar */}
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 }}>
                {(['low', 'medium', 'high'] as RiskBand[]).map(band => (
                  riskDist[band] > 0 && (
                    <div key={band} style={{ flex: riskDist[band], background: BAND_COLOR[band], borderRadius: 3 }} />
                  )
                ))}
              </div>
            </div>

            {/* ── Recent Applications ── */}
            <div style={{ background: '#0d0d14', border: '1px solid #1a1a28', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #1a1a28', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent Applications</div>
                <div style={{ fontSize: 11, color: '#444' }}>{apps.length} total</div>
              </div>

              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: 0, padding: '10px 24px', borderBottom: '1px solid #13131e' }}>
                {['Applicant', 'Amount', 'Purpose', 'Score', 'Risk', 'Decision'].map(h => (
                  <div key={h} style={{ fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                ))}
              </div>

              {/* Rows */}
              {apps.slice(0, 20).map((app, i) => {
                const score = app.scores
                return (
                  <div
                    key={app.id}
                    className="row-hover"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                      padding: '14px 24px',
                      borderBottom: i < apps.length - 1 ? '1px solid #0f0f18' : 'none',
                      background: 'transparent',
                      transition: 'background 0.12s',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{app.full_name}</div>
                      <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>{timeAgo(app.created_at)}</div>
                    </div>
                    <div style={{ fontSize: 13 }}>{fmt(app.loan_amount)}</div>
                    <div style={{ fontSize: 12, color: '#666', textTransform: 'capitalize' }}>{app.loan_purpose}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: score ? (score.etho_score >= 70 ? '#1D9E75' : score.etho_score >= 50 ? '#BA7517' : '#E24B4A') : '#444' }}>
                      {score ? score.etho_score : '—'}
                    </div>
                    <div>
                      {score ? (
                        <span style={{ fontSize: 11, color: BAND_COLOR[score.risk_band], background: `${BAND_COLOR[score.risk_band]}18`, border: `1px solid ${BAND_COLOR[score.risk_band]}40`, borderRadius: 4, padding: '2px 8px', textTransform: 'capitalize' }}>
                          {score.risk_band}
                        </span>
                      ) : <span style={{ color: '#444', fontSize: 12 }}>—</span>}
                    </div>
                    <div>
                      {score ? (
                        <span style={{ fontSize: 11, color: REC_COLOR[score.recommendation], background: `${REC_COLOR[score.recommendation]}18`, border: `1px solid ${REC_COLOR[score.recommendation]}40`, borderRadius: 4, padding: '2px 8px' }}>
                          {REC_LABEL[score.recommendation]}
                        </span>
                      ) : <span style={{ color: '#444', fontSize: 12 }}>Pending</span>}
                    </div>
                  </div>
                )
              })}

              {apps.length === 0 && (
                <div style={{ padding: '40px 24px', textAlign: 'center', color: '#444', fontSize: 13 }}>
                  No applications yet
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
