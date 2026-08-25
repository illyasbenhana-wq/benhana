'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getRoleFromSession, ROLE_LABEL, UserRole } from '../../../lib/user-role'
import { isPreviewDeployment } from '../../../lib/preview-bypass'
import { Logo } from '../../components/Logo'
import { DashboardSidebar } from '../../components/DashboardSidebar'
import { DashboardKpiRow } from '../../components/DashboardKpiRow'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  borderLine,
  googleFontsHref,
} from '../../../lib/design-system/tokens-light'

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
  low: C.riskLow,
  medium: C.riskMedium,
  high: C.riskHigh,
}

const REC_LABEL: Record<Recommendation, string> = {
  approve: 'Approve',
  review: 'Review',
  decline: 'Decline',
}

const REC_COLOR: Record<Recommendation, string> = {
  approve: C.riskLow,
  review: C.riskMedium,
  decline: C.riskHigh,
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
  const [userRole, setUserRole] = useState<UserRole>('viewer')

  useEffect(() => {
    if (!supabase) {
      setApps(MOCK_APPS)
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // Preview-only auth bypass for design review (mirrors app/dashboard/page.tsx):
        // skip the redirect to the unrestyled /login screen and fall through
        // to the applications query below, which already falls back to
        // MOCK_APPS on an empty/RLS-denied result. Production/dev behavior
        // (both non-preview) is unchanged.
        if (!isPreviewDeployment()) {
          router.push('/login')
          return
        }
      } else {
        setUserRole(getRoleFromSession(session))
      }

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
    { label: 'Total Loan Volume', value: totalVolume >= 1000 ? `£${(totalVolume / 1000).toFixed(0)}k` : `£${totalVolume}` },
    { label: 'Approval Rate',     value: `${approvalRate}%` },
    { label: 'Average EthoScore', value: String(avgScore), tone: (avgScore >= 70 ? 'success' : avgScore >= 50 ? 'warning' : 'danger') as 'success' | 'warning' | 'danger' },
    { label: 'Pending Review',    value: String(scored.filter(a => a.scores?.recommendation === 'review').length) },
  ]

  const labelCss: React.CSSProperties = {
    fontFamily: F.sans, fontSize: FS.micro, fontWeight: FW.semibold,
    letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSecondary,
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans, overflow: 'hidden' }}>
      <link href={googleFontsHref} rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: ${C.background}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; }
        .row-hover:hover { background: ${C.accentSubtle} !important; }
        .sign-out:hover { color: ${C.riskHigh} !important; border-color: ${C.riskHigh}55 !important; }
      `}</style>

      <DashboardSidebar roleLabel={ROLE_LABEL[userRole]} />

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>

        {/* ── Top bar — same two-row shell as /dashboard: identity row +
            status strip, so both screens read as the same product. ── */}
        <header style={{ borderBottom: borderLine, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: SP.md, padding: `${SP.md}px ${SP.xl}px ${SP.sm}px` }}>
            <Logo size="sm" />
            <span style={{ fontFamily: F.mono, fontVariantNumeric: 'tabular-nums', fontSize: FS.xs, color: C.textMuted }}>· INTELLIGENCE INFRASTRUCTURE</span>
            <span style={{ marginLeft: 'auto', ...labelCss, color: C.textSecondary }}>Northbridge Credit Union</span>
            <span style={{ width: 1, height: 14, background: C.border }} />
            <span style={{ fontSize: FS.sm, color: C.textPrimary }}>{ROLE_LABEL[userRole]}</span>
            <button type="button" onClick={handleLogout} className="sign-out" style={{ background: 'none', border: borderLine, borderRadius: R.control, padding: '4px 10px', color: C.textMuted, fontSize: FS.xs, cursor: 'pointer', fontFamily: F.sans, transition: 'color .15s, border-color .15s' }}>
              Sign out
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: SP.md, padding: `0 ${SP.xl}px ${SP.md}px` }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.riskLow, flexShrink: 0 }} />
            <span style={{ ...labelCss, color: C.textPrimary, letterSpacing: '0.16em' }}>Intelligence Layer Active</span>
            <span style={{ fontFamily: F.mono, fontVariantNumeric: 'tabular-nums', fontSize: FS.xs, color: C.riskLow, letterSpacing: '0.1em' }}>LIVE</span>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', padding: `${SP.lg}px ${SP.xl}px ${SP.xxl}px` }}>
          <DashboardKpiRow title="Lender Dashboard" kpis={kpis} />
          <p style={{ margin: `-${SP.md}px 0 ${SP.xl}px`, fontSize: FS.sm, color: C.textSecondary }}>Loan applications · AI scoring · Risk overview</p>

          {loading ? (
            <div style={{ color: C.textMuted, fontSize: FS.sm, paddingTop: 40, textAlign: 'center' }}>Loading…</div>
          ) : (
            <>
              {/* ── Risk Distribution — single composition bar, no card, no duplication ── */}
              <div style={{ marginBottom: SP.xxl }}>
                <div style={{ ...labelCss, marginBottom: 14 }}>Risk Distribution</div>
                <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2, marginBottom: 10 }}>
                  {(['low', 'medium', 'high'] as RiskBand[]).map(band => (
                    riskDist[band] > 0 && (
                      <div key={band} style={{ flex: riskDist[band], background: BAND_COLOR[band], borderRadius: 4 }} />
                    )
                  ))}
                </div>
                <div style={{ display: 'flex', gap: SP.xl }}>
                  {(['low', 'medium', 'high'] as RiskBand[]).map(band => (
                    <div key={band} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: BAND_COLOR[band], flexShrink: 0 }} />
                      <span style={{ fontSize: FS.sm, fontWeight: FW.medium, color: C.textPrimary }}>{riskDist[band]}</span>
                      <span style={{ fontSize: FS.xs, color: C.textMuted, textTransform: 'capitalize' }}>{band} · {Math.round((riskDist[band] / riskTotal) * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Recent Applications — flat section, no card wrapper ── */}
              <div>
                <div style={{ paddingBottom: 14, borderBottom: borderLine, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Blue brand-accent marker on the page's primary
                        section — this whole page was otherwise neutral +
                        semantic-only, carrying no brand-blue thread. */}
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />
                    <div style={labelCss}>Recent Applications</div>
                  </div>
                  <div style={{ fontSize: FS.xs, color: C.textMuted }}>{apps.length} total</div>
                </div>

                {/* Table header */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', gap: 0, padding: '10px 4px', borderBottom: borderLine }}>
                  {['Applicant', 'Amount', 'Purpose', 'Score', 'Decision'].map(h => (
                    <div key={h} style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                  ))}
                </div>

                {/* Rows */}
                {apps.slice(0, 20).map((app, i) => {
                  const score = app.scores
                  const decisionColor = score ? REC_COLOR[score.recommendation] : C.textMuted
                  return (
                    <div
                      key={app.id}
                      className="row-hover"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr',
                        padding: '14px 4px 14px 14px',
                        borderBottom: i < apps.length - 1 ? borderLine : 'none',
                        borderLeft: `2px solid ${score ? `${decisionColor}66` : 'transparent'}`,
                        background: 'transparent',
                        transition: 'background 0.12s, border-color 0.12s',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: FS.sm, fontWeight: FW.medium }}>{app.full_name}</div>
                        <div style={{ fontSize: FS.xs, color: C.textMuted, marginTop: 2 }}>{timeAgo(app.created_at)}</div>
                      </div>
                      <div style={{ fontSize: FS.sm }}>{fmt(app.loan_amount)}</div>
                      <div style={{ fontSize: FS.xs, color: C.textSecondary, textTransform: 'capitalize' }}>{app.loan_purpose}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontFamily: F.mono, fontSize: 18, fontWeight: FW.bold, color: score ? (score.etho_score >= 70 ? C.riskLow : score.etho_score >= 50 ? C.riskMedium : C.riskHigh) : C.textMuted }}>
                          {score ? score.etho_score : '—'}
                        </span>
                        {score && <span style={{ width: 5, height: 5, borderRadius: '50%', background: BAND_COLOR[score.risk_band], flexShrink: 0 }} title={`${score.risk_band} risk`} />}
                      </div>
                      <div>
                        {score ? (
                          <span style={{ fontSize: FS.xs, fontWeight: FW.medium, color: decisionColor, background: `${decisionColor}14`, border: `1px solid ${decisionColor}40`, borderRadius: 4, padding: '3px 9px' }}>
                            {REC_LABEL[score.recommendation]}
                          </span>
                        ) : <span style={{ color: C.textMuted, fontSize: FS.xs }}>Pending</span>}
                      </div>
                    </div>
                  )
                })}

                {apps.length === 0 && (
                  <div style={{ padding: '40px 4px', textAlign: 'center', color: C.textMuted, fontSize: FS.sm }}>
                    No applications yet
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
