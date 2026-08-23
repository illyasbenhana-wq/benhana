'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getRoleFromSession, ROLE_LABEL, UserRole } from '../../lib/user-role'
import { isPreviewDeployment } from '../../lib/preview-bypass'
import { MerchantIntelligence } from './components/MerchantIntelligence'
import { fatimaOkoyeComplianceCase } from '../../lib/fatima-okoye-demo'
import { Logo } from '../components/Logo'
import { DashboardSidebar } from '../components/DashboardSidebar'
import { Badge } from '../components/Badge'
import { EvidenceRow } from '../components/EvidenceRow'
import { ScoreFigure } from '../components/ScoreFigure'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  borderLine,
  keyframes as KF,
  googleFontsHref,
  caseRiskColor,
} from '../../lib/design-system/tokens-light'

const _url = process.env.NEXT_PUBLIC_SUPABASE_URL
const _key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase: SupabaseClient | null = _url && _key ? createClient(_url, _key) : null

// ─── Types ────────────────────────────────────────────────────────────────────

type Signal = { name: string; score: number; rationale: string }

type ComplianceCase = {
  id: string
  case_ref: string
  entity_name: string
  case_type: string
  jurisdiction: string
  exposure_amount: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  sla_hours: number
  sla_remaining_hours: number
  status: 'open' | 'escalated' | 'pending_info' | 'cleared'
  assigned_to: string
  opened_at: string
  risk_score: number
  ai_summary: string
  signals: Signal[]
}

type Analyst = { name: string; role: string; open: number; critical: number; sla_breaching: number }

// ─── Color / Label Maps ───────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: C.riskHigh,
  high: C.riskMedium,
  medium: C.accent,
  low: C.riskLow,
}

const SEV_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  escalated: 'Escalated',
  pending_info: 'Pending Info',
  cleared: 'Cleared',
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CASES: ComplianceCase[] = [
  {
    id: 'case-1', case_ref: 'INV-1047', entity_name: 'Meridian Capital Ltd',
    case_type: 'Sanctions Match', jurisdiction: 'OFAC / EU',
    exposure_amount: 2400000, severity: 'critical', sla_hours: 4, sla_remaining_hours: 1.2,
    status: 'open', assigned_to: 'S. Chen',
    opened_at: new Date(Date.now() - 10800000).toISOString(),
    risk_score: 89,
    ai_summary: 'Meridian Capital Ltd has been flagged against two OFAC SDN list entries and one EU Consolidated Sanctions List entry. Transaction flows totalling £2.4M were routed through correspondent accounts in three jurisdictions over a 72-hour window. The entity\'s beneficial ownership structure presents opacity consistent with evasion typologies. Immediate escalation and account freeze recommended pending full investigation.',
    signals: [
      { name: 'Sanctions Exposure',    score: 94, rationale: 'Entity matches 2 OFAC SDN entries and 1 EU Consolidated List entry with 98.4% confidence. Mandatory review within 4-hour SLA.' },
      { name: 'Velocity Anomaly',      score: 82, rationale: '17 transactions within 6 hours on 3 May — 3.2× the 90-day baseline. Pattern consistent with layering behaviour.' },
      { name: 'Geographic Dispersion', score: 71, rationale: 'Counterparties across 8 jurisdictions including FATF high-risk: Iran, Myanmar, Russia.' },
      { name: 'Ownership Opacity',     score: 88, rationale: '4 shell layers across BVI, Seychelles, Malta. Ultimate beneficial owner not positively identified.' },
    ],
  },
  {
    id: 'case-2', case_ref: 'INV-1038', entity_name: 'Vega Trade Finance',
    case_type: 'Velocity Anomaly', jurisdiction: 'UK / UAE',
    exposure_amount: 890000, severity: 'high', sla_hours: 8, sla_remaining_hours: 3.5,
    status: 'open', assigned_to: 'R. Okonkwo',
    opened_at: new Date(Date.now() - 16200000).toISOString(),
    risk_score: 74,
    ai_summary: 'Vega Trade Finance has exhibited a sustained surge in transaction frequency over the past 5 days, with volumes 280% above the established baseline. Activity is concentrated between 01:00–04:00 UTC. Two counterparties were previously flagged in unrelated structuring investigations. Enhanced due diligence and ongoing account monitoring recommended.',
    signals: [
      { name: 'Velocity Anomaly',         score: 86, rationale: '280% above 90-day baseline; concentrated in low-activity hours (01:00–04:00 UTC) over 5 consecutive days.' },
      { name: 'Counterparty Risk',         score: 72, rationale: 'Two counterparties appear in historical structuring case files (INV-0891, INV-0934). No current sanctions designation.' },
      { name: 'Geographic Dispersion',    score: 61, rationale: 'Flows routed via UAE free-zone accounts before onward transfer to UK — common trade-based money laundering pathway.' },
      { name: 'Round-Sum Transactions',   score: 58, rationale: '14 transactions at £49,500–£49,900 — consistent with threshold avoidance below the £50,000 reporting trigger.' },
    ],
  },
  {
    id: 'case-3', case_ref: 'INV-1021', entity_name: 'Nakamura Holdings',
    case_type: 'PEP Relationship', jurisdiction: 'Japan / Singapore',
    exposure_amount: 1100000, severity: 'high', sla_hours: 24, sla_remaining_hours: 14.8,
    status: 'escalated', assigned_to: 'S. Chen',
    opened_at: new Date(Date.now() - 32400000).toISOString(),
    risk_score: 68,
    ai_summary: 'Nakamura Holdings is beneficially owned (32%) by a first-degree family member of a current Japanese cabinet minister — Tier 1 PEP under internal classification. Three inbound transfers totalling £1.1M from Singapore entities have no apparent commercial nexus to the entity\'s stated activities. Escalated to senior compliance review pending EDD completion.',
    signals: [
      { name: 'PEP Association',       score: 82, rationale: 'UBO holds 32% equity through a family member who is a sitting Japanese cabinet minister (Tier 1 PEP). Annual enhanced review required.' },
      { name: 'Unexplained Inflows',   score: 74, rationale: 'Three transfers totalling £1.1M from Singapore entities with no identifiable commercial nexus to stated activities (property management).' },
      { name: 'Source of Funds',       score: 61, rationale: 'SOF documentation received for 2 of 3 transfers. Outstanding request issued 8 days ago; no response received.' },
      { name: 'Counterparty Risk',     score: 44, rationale: 'One Singapore counterparty incorporated 3 months prior to transfer; no trading history identified. Possible shell vehicle.' },
    ],
  },
  {
    id: 'case-4', case_ref: 'INV-1015', entity_name: 'Atlas Logistics Co',
    case_type: 'Geographic Anomaly', jurisdiction: 'Netherlands / UAE / Nigeria',
    exposure_amount: 340000, severity: 'medium', sla_hours: 48, sla_remaining_hours: 31.0,
    status: 'pending_info', assigned_to: 'M. Vasquez',
    opened_at: new Date(Date.now() - 61200000).toISOString(),
    risk_score: 51,
    ai_summary: 'Atlas Logistics Co has initiated transfers to Nigerian counterparties, which falls outside the geographic risk profile established at onboarding (EU / UAE operations only). An information request was issued on 18 May 2026; response is pending. No sanctions or PEP matches identified at this time. Monitoring continued.',
    signals: [
      { name: 'Geographic Anomaly',  score: 68, rationale: 'Transfers to Nigeria fall outside account-opening profile (EU / UAE only). Updated customer risk assessment required.' },
      { name: 'Profile Deviation',   score: 62, rationale: 'Stated business is European freight logistics. Nigeria-directed payments are inconsistent with known activities.' },
      { name: 'Counterparty Risk',   score: 41, rationale: 'Nigerian counterparty incorporated 6 months ago; no verifiable trade history. KYC documentation outstanding.' },
      { name: 'Velocity Anomaly',    score: 29, rationale: 'Transaction frequency within normal parameters. No threshold avoidance patterns detected.' },
    ],
  },
  {
    id: 'case-5', case_ref: 'INV-1009', entity_name: 'Elara Commodities',
    case_type: 'Structuring Pattern', jurisdiction: 'UK / Switzerland',
    exposure_amount: 520000, severity: 'medium', sla_hours: 48, sla_remaining_hours: 22.4,
    status: 'open', assigned_to: 'R. Okonkwo',
    opened_at: new Date(Date.now() - 93600000).toISOString(),
    risk_score: 55,
    ai_summary: 'Elara Commodities has made 11 transactions over 7 days, each below the £50,000 automated reporting threshold. The aggregate value is £520,000. Statistical distribution of amounts is concentrated in the £45,000–£49,900 range, inconsistent with commodity trading payment patterns. Consistent with deliberate structuring to avoid detection. Enhanced monitoring initiated.',
    signals: [
      { name: 'Structuring Pattern',     score: 78, rationale: '11 transactions over 7 days, all below £50,000 threshold. Aggregate £520,000. Distribution inconsistent with legitimate trading.' },
      { name: 'Round-Sum Transactions',  score: 71, rationale: '9 of 11 transactions are exact multiples of £5,000 in the £45,000–£49,900 band. Probability of random occurrence: <0.3%.' },
      { name: 'Frequency Deviation',     score: 54, rationale: 'Average transaction count 220% above monthly baseline for this value band. No business justification provided.' },
      { name: 'Geographic Dispersion',   score: 32, rationale: 'Counterparties are UK and Switzerland domiciled — within expected profile. No high-risk jurisdiction exposure.' },
    ],
  },
  fatimaOkoyeComplianceCase,
]

const ANALYST_ROLES: Record<string, string> = {
  'S. Chen': 'Senior Analyst',
  'R. Okonkwo': 'Analyst',
  'M. Vasquez': 'Analyst',
  'L. Hartmann': 'Junior Analyst',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  if (n >= 1000000) return `£${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `£${(n / 1000).toFixed(0)}K`
  return `£${n}`
}

function fmtSLA(hours: number) {
  if (hours <= 0) return 'OVERDUE'
  const totalSecs = Math.round(hours * 3600)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function slaColor(hours: number, total: number) {
  if (hours <= 0) return C.riskHigh
  if (hours < 1) return C.riskHigh           // under 1 hour → red
  const pct = hours / total
  if (pct < 0.3) return C.riskHigh
  if (pct < 0.6) return C.riskMedium
  return C.riskLow
}

// Case-risk color (0–100, higher = more risk). Sourced from design tokens.
const riskColor = caseRiskColor

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m ago`
  return `${m}m ago`
}

// PanelCard — Fortress's real card shape: title + one-line muted
// subtitle in a header, content below. Border only, no shadow —
// the actual template doesn't shadow its cards.
function PanelCard({ title, subtitle, children, maxWidth }: { title: string; subtitle?: string; children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, padding: '18px 20px', marginBottom: SP.xl, maxWidth }}>
      <div style={{ fontFamily: F.sans, fontSize: FS.base, fontWeight: FW.semibold, color: C.textPrimary, marginBottom: subtitle ? 2 : 14 }}>{title}</div>
      {subtitle && <p style={{ fontSize: FS.xs, color: C.textMuted, margin: `0 0 14px` }}>{subtitle}</p>}
      {children}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [cases, setCases] = useState<ComplianceCase[]>([])
  const [activeCase, setActiveCase] = useState<ComplianceCase | null>(null)
  const [filter, setFilter] = useState('all')
  const [acting, setActing] = useState(false)
  const [userRole, setUserRole] = useState<UserRole>('analyst')
  const [search, setSearch] = useState('')
  const [elapsed, setElapsed] = useState(0) // seconds since cases loaded

  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Live SLA hours = snapshot value minus elapsed seconds
  function liveSLA(snapshotHours: number) {
    return snapshotHours - elapsed / 3600
  }

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut()
    router.push('/login')
  }

  const analysts = useMemo<Analyst[]>(() => {
    const map: Record<string, Analyst> = {}
    cases.forEach(c => {
      if (!c.assigned_to) return
      if (!map[c.assigned_to]) map[c.assigned_to] = {
        name: c.assigned_to,
        role: ANALYST_ROLES[c.assigned_to] ?? 'Analyst',
        open: 0, critical: 0, sla_breaching: 0,
      }
      if (c.status !== 'cleared') {
        map[c.assigned_to].open++
        if (c.severity === 'critical') map[c.assigned_to].critical++
        if (c.sla_remaining_hours / c.sla_hours < 0.3) map[c.assigned_to].sla_breaching++
      }
    })
    return Object.values(map).sort((a, b) => b.open - a.open)
  }, [cases])

  useEffect(() => {
    if (!supabase) {
      console.warn('[EthosFi] No Supabase client — NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing. Using mock data.')
      setCases(MOCK_CASES)
      return
    }

    // On a Vercel preview deployment, always render the demo dataset — an
    // anonymous preview visitor has no session, so a real Supabase query
    // below would be RLS-filtered to an empty (not errored) result, and
    // the existing `!supabase` mock-data fallback never triggers because
    // Supabase env vars ARE present in Preview. Force mock mode here
    // instead of relying on the query's own empty-result handling.
    if (isPreviewDeployment()) {
      setCases(MOCK_CASES)
      return
    }

    // Auth guard — redirect to /login if no active session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUserRole(getRoleFromSession(session))
    })
    console.log('[EthosFi] Supabase client initialised. Fetching cases...')
    supabase
      .from('cases')
      .select('*, signals(*)')
      .order('opened_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error('[EthosFi] cases query failed:', error)
          setCases(MOCK_CASES)
          return
        }
        console.log('[EthosFi] cases loaded:', data?.length ?? 0)
        setCases(data || [])
      })
  }, [])

  const action = async (caseId: string, act: string) => {
    setActing(true)
    const newStatus = act === 'escalate' ? 'escalated' : act === 'clear' ? 'cleared' : 'pending_info'
    const c = cases.find(c => c.id === caseId)
    const previousStatus = c?.status ?? 'open'
    const actionLabel = act === 'escalate' ? 'Escalated to Senior Compliance' : act === 'clear' ? 'Case cleared' : 'Information request sent'

    // Write to Supabase via server API route (uses service role key, checks errors)
    console.log('[dashboard] calling /api/case-action', { caseId, act, previousStatus, newStatus })
    const { data: { session: currentSession } } = await supabase!.auth.getSession()
    const res = await fetch('/api/case-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentSession?.access_token ? { 'Authorization': `Bearer ${currentSession.access_token}` } : {}),
      },
      body: JSON.stringify({
        caseId,
        caseRef:     c?.case_ref     ?? '',
        entityName:  c?.entity_name  ?? '',
        riskScore:   c?.risk_score   ?? null,
        analystName: c?.assigned_to  ?? 'Unknown',
        act,
        previousStatus,
        newStatus,
        severity: c?.severity ?? null,
      }),
    })

    const resBody = await res.json().catch(() => ({ error: 'Failed to parse response' }))
    console.log('[dashboard] /api/case-action response:', res.status, JSON.stringify(resBody))
    if (!res.ok) {
      console.error('[dashboard] case-action failed:', resBody)
    }

    // Re-fetch cases from Supabase to reflect persisted state
    if (supabase) {
      const { data, error } = await supabase
        .from('cases')
        .select('*, signals(*)')
        .order('opened_at', { ascending: false })
      if (!error && data) {
        setCases(data)
        if (activeCase?.id === caseId) {
          const updated = data.find((r: ComplianceCase) => r.id === caseId)
          if (updated) setActiveCase(updated)
        }
        setActing(false)
        return
      }
    }

    // Fallback: optimistic update if Supabase read unavailable
    setCases(prev => prev.map(c => c.id === caseId ? { ...c, status: newStatus } : c))
    if (activeCase?.id === caseId) setActiveCase(prev => prev ? { ...prev, status: newStatus } : null)
    setActing(false)
  }

  const q = search.trim().toLowerCase()
  const filtered = cases
    .filter(c => {
      if (filter === 'critical')  return c.severity === 'critical'
      if (filter === 'escalated') return c.status === 'escalated'
      if (filter === 'pending')   return c.status === 'pending_info' || c.status === 'open'
      return true
    })
    .filter(c => !q || c.entity_name.toLowerCase().includes(q) || c.case_ref.toLowerCase().includes(q))

  const labelCss: React.CSSProperties = {
    fontFamily: F.sans, fontSize: FS.micro, fontWeight: FW.semibold,
    letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSecondary,
  }
  const monoCss: React.CSSProperties = { fontFamily: F.mono, fontVariantNumeric: 'tabular-nums' }

  const activeCases = cases.filter(c => c.status !== 'cleared')
  const rankedCases = [...activeCases].sort((a, b) => b.risk_score - a.risk_score)
  const now = new Date()
  const dateStr = now
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()

  const criticalCount = activeCases.filter(c => c.severity === 'critical').length
  const slaBreachingCount = activeCases.filter(c => liveSLA(c.sla_remaining_hours) / c.sla_hours < 0.3).length
  const avgRiskScore = activeCases.length
    ? Math.round(activeCases.reduce((sum, c) => sum + c.risk_score, 0) / activeCases.length)
    : 0

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans, overflow: 'hidden' }}>
      <link href={googleFontsHref} rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: ${C.background}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; }
        ${KF}
        .ethos-logout { background: none; border: ${borderLine}; border-radius: ${R.control}px; padding: 4px 10px; color: ${C.textMuted}; font-size: ${FS.xs}px; cursor: pointer; font-family: ${F.sans}; transition: color .15s, border-color .15s; }
        .ethos-logout:hover { color: ${C.riskHigh}; border-color: ${C.riskHigh}55; }
        .ethos-queue-item:hover { background: ${C.accentSubtle}; }
        .ethos-signal:hover { background: ${C.accentSubtle}; }
      `}</style>

      <DashboardSidebar activeCaseCount={activeCases.length} roleLabel={ROLE_LABEL[userRole]} />

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>

      {/* ── Top command bar ── */}
      <header style={{ borderBottom: borderLine, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.md, padding: `${SP.md}px ${SP.xl}px ${SP.sm}px` }}>
          <Logo size="sm" />
          <span style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted }}>· INTELLIGENCE INFRASTRUCTURE</span>
          <span style={{ marginLeft: 'auto', ...labelCss, color: C.textSecondary }}>Northbridge Credit Union</span>
          <span style={{ width: 1, height: 14, background: C.border }} />
          <span style={{ fontSize: FS.sm, color: C.textPrimary }}>{ROLE_LABEL[userRole]}</span>
          <button type="button" onClick={handleLogout} title="Sign out" className="ethos-logout">Sign out</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.md, padding: `0 ${SP.xl}px ${SP.md}px` }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.riskLow, flexShrink: 0 }} />
          <span style={{ ...labelCss, color: C.textPrimary, letterSpacing: '0.16em' }}>Intelligence Layer Active</span>
          <span style={{ ...monoCss, fontSize: FS.xs, color: C.riskLow, letterSpacing: '0.1em' }}>LIVE</span>
          <span style={{ marginLeft: 'auto', ...monoCss, fontSize: FS.xs, color: C.textSecondary, letterSpacing: '0.1em' }}>{dateStr}</span>
        </div>
      </header>

      <div style={{ padding: `${SP.lg}px ${SP.xl}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: SP.xl }}>
          <h1 style={{ margin: 0, fontFamily: F.sans, fontSize: FS.lg, fontWeight: FW.bold, color: C.textPrimary }}>Risk Intelligence Overview</h1>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Active Cases', value: String(activeCases.length), color: C.textPrimary },
              { label: 'Critical', value: String(criticalCount), color: criticalCount > 0 ? C.riskHigh : C.textPrimary },
              { label: 'SLA Breaching', value: String(slaBreachingCount), color: slaBreachingCount > 0 ? C.riskMedium : C.textPrimary },
              { label: 'Avg Risk Score', value: String(avgRiskScore), color: avgRiskScore >= 75 ? C.riskHigh : avgRiskScore >= 50 ? C.riskMedium : C.riskLow },
            ].map(kpi => (
              <div key={kpi.label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: F.sans, fontSize: FS.xs, color: C.textMuted }}>{kpi.label}</span>
                <span style={{ fontFamily: F.mono, fontSize: FS.sm, fontWeight: FW.bold, color: kpi.color }}>{kpi.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body: case queue + working area ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Case queue rail ── */}
        <aside style={{ width: 320, borderRight: borderLine, display: 'flex', flexDirection: 'column', flexShrink: 0, background: C.background }}>
          <div style={{ padding: `${SP.lg}px ${SP.lg}px ${SP.sm}px`, display: 'flex', alignItems: 'center', gap: SP.sm }}>
            <span style={labelCss}>Case Queue</span>
            <span style={{ ...monoCss, marginLeft: 'auto', fontSize: FS.xs, color: C.textMuted }}>{activeCases.length} ACTIVE</span>
          </div>

          {/* Search */}
          <div style={{ padding: `0 ${SP.md}px ${SP.sm}px` }}>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search entity or case ref"
              style={{ width: '100%', background: C.surface, border: borderLine, borderRadius: R.data, padding: '7px 10px', color: C.textPrimary, fontSize: FS.sm, fontFamily: F.sans, outline: 'none' }}
            />
          </div>

          {/* Filters */}
          <div style={{ padding: `0 ${SP.md}px ${SP.sm}px`, display: 'flex', gap: SP.xs }}>
            {([
              { key: 'all', label: 'All', count: cases.length },
              { key: 'critical', label: 'Critical', count: cases.filter(c => c.severity === 'critical').length },
              { key: 'escalated', label: 'Escalated', count: cases.filter(c => c.status === 'escalated').length },
              { key: 'pending', label: 'Pending', count: cases.filter(c => c.status === 'pending_info').length },
            ] as const).map(({ key, label, count }) => {
              const active = filter === key
              return (
                <button key={key} type="button" onClick={() => setFilter(key)} style={{
                  flex: 1, padding: '6px 4px', borderRadius: R.data, cursor: 'pointer',
                  border: borderLine, borderColor: active ? C.textSecondary : C.border,
                  background: active ? C.accentSubtle : 'transparent',
                  color: active ? C.textPrimary : C.textMuted, fontFamily: F.sans,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <span style={{ ...monoCss, fontSize: FS.sm, fontWeight: FW.medium, color: active ? C.textPrimary : C.textSecondary, lineHeight: 1 }}>{count}</span>
                  <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
                </button>
              )
            })}
          </div>

          {/* Queue list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: `${SP.xs}px ${SP.sm}px ${SP.md}px` }}>
            {filtered.length === 0 && (
              <p style={{ color: C.textMuted, fontSize: FS.sm, padding: '20px 8px' }}>No cases in this view.</p>
            )}
            {filtered.map(c => {
              const sc = SEV_COLOR[c.severity] || C.textMuted
              const isSelected = activeCase?.id === c.id
              const lsla = liveSLA(c.sla_remaining_hours)
              const slaCol = slaColor(lsla, c.sla_hours)
              const badgeTone: 'high' | 'medium' | 'low' = c.severity === 'critical' || c.severity === 'high' ? 'high' : c.severity === 'medium' ? 'medium' : 'low'
              return (
                <div key={c.id} onClick={() => setActiveCase(c)} className="ethos-queue-item" style={{
                  padding: `${SP.md}px ${SP.md}px`, borderRadius: R.data, marginBottom: 3, cursor: 'pointer',
                  borderLeft: `2px solid ${isSelected ? sc : 'transparent'}`,
                  background: isSelected ? C.accentSubtle : 'transparent', transition: 'background .15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm, marginBottom: 6 }}>
                    <Badge tone={badgeTone}>{SEV_LABEL[c.severity]}</Badge>
                    <span style={{ ...monoCss, marginLeft: 'auto', fontSize: FS.xs, color: C.textMuted }}>{c.case_ref}</span>
                  </div>
                  <div style={{ fontSize: FS.base, fontWeight: FW.medium, marginBottom: 4 }}>{c.entity_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm }}>
                    <span style={{ ...monoCss, fontSize: FS.sm, fontWeight: FW.medium, color: riskColor(c.risk_score) }}>{c.risk_score}</span>
                    <span style={{ color: C.textMuted, fontSize: FS.xs }}>·</span>
                    <span style={{ ...monoCss, fontSize: FS.xs, color: slaCol }}>SLA {fmtSLA(lsla)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* ── Working area ── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: `${SP.xl}px ${SP.xxl}px` }}>
          {!activeCase ? (
            /* ── Risk Intelligence Overview — dense data grid, no headline sentence ── */
            <div>
              {/* Case table — dense data grid, Fortress Trade-Blotter shape */}
              <PanelCard title="Active Cases" subtitle={`${activeCases.length} cases requiring attention, ranked by risk score.`}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.3fr 0.9fr 1fr 1fr', gap: 0, padding: '8px 0', borderBottom: borderLine }}>
                  {['Entity', 'Case Type', 'Risk', 'SLA', 'Status'].map(h => (
                    <div key={h} style={{ fontSize: 10, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
                  ))}
                </div>
                {rankedCases.slice(0, 8).map((c, i) => {
                  const lsla = liveSLA(c.sla_remaining_hours)
                  const badgeTone: 'high' | 'medium' | 'low' = c.severity === 'critical' || c.severity === 'high' ? 'high' : c.severity === 'medium' ? 'medium' : 'low'
                  return (
                    <div
                      key={c.id}
                      className="ethos-signal"
                      onClick={() => setActiveCase(c)}
                      style={{
                        display: 'grid', gridTemplateColumns: '2fr 1.3fr 0.9fr 1fr 1fr',
                        padding: '11px 6px', borderBottom: i < 7 ? borderLine : 'none',
                        cursor: 'pointer', alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: FS.sm, fontWeight: FW.medium }}>{c.entity_name}</div>
                        <div style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted, marginTop: 1 }}>{c.case_ref}</div>
                      </div>
                      <div style={{ fontSize: FS.xs, color: C.textSecondary }}>{c.case_type}</div>
                      <div style={{ ...monoCss, fontSize: FS.sm, fontWeight: FW.medium, color: riskColor(c.risk_score) }}>{c.risk_score}</div>
                      <div style={{ ...monoCss, fontSize: FS.xs, color: slaColor(lsla, c.sla_hours) }}>{fmtSLA(lsla)}</div>
                      <div><Badge tone={badgeTone}>{SEV_LABEL[c.severity]}</Badge></div>
                    </div>
                  )
                })}
              </PanelCard>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.xl }}>
                {/* Severity breakdown — segmented bar, chart-equivalent */}
                <PanelCard title="Severity Breakdown" subtitle="Active cases by severity tier.">
                  <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2, marginBottom: 12 }}>
                    {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
                      const n = activeCases.filter(c => c.severity === sev).length
                      return n > 0 && <div key={sev} style={{ flex: n, background: SEV_COLOR[sev], borderRadius: 4 }} />
                    })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.lg }}>
                    {(['critical', 'high', 'medium', 'low'] as const).map(sev => {
                      const n = activeCases.filter(c => c.severity === sev).length
                      return (
                        <div key={sev} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: SEV_COLOR[sev], flexShrink: 0 }} />
                          <span style={{ fontSize: FS.sm, fontWeight: FW.medium, color: C.textPrimary }}>{n}</span>
                          <span style={{ fontSize: FS.xs, color: C.textMuted }}>{SEV_LABEL[sev]}</span>
                        </div>
                      )
                    })}
                  </div>
                </PanelCard>

                {/* Analyst load — compact stat tiles */}
                <PanelCard title="Analyst Load" subtitle="Open caseload by assigned analyst.">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {analysts.map(a => (
                      <div key={a.name} style={{ background: C.background, border: borderLine, borderRadius: R.control, padding: '10px 12px' }}>
                        <div style={{ fontSize: FS.xs, color: C.textSecondary, marginBottom: 4 }}>{a.name}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ ...monoCss, fontSize: FS.lg, fontWeight: FW.bold, color: C.textPrimary }}>{a.open}</span>
                          <span style={{ fontSize: 10, color: C.textMuted }}>open</span>
                        </div>
                        {a.critical > 0 && <div style={{ fontSize: 10, color: C.riskHigh, marginTop: 2 }}>{a.critical} critical</div>}
                      </div>
                    ))}
                  </div>
                </PanelCard>
              </div>

              {/* Merchant intelligence — featured panel (renders its own card) */}
              <div style={{ maxWidth: 460 }}>
                <MerchantIntelligence />
              </div>
            </div>

          ) : (
            /* ── Inline case readout (full investigation view is Screen 2) ── */
            <div style={{ maxWidth: 720 }}>
              <button onClick={() => setActiveCase(null)} style={{ background: 'transparent', border: 'none', color: C.textSecondary, fontSize: FS.sm, cursor: 'pointer', fontFamily: F.sans, padding: `0 0 ${SP.xl}px`, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={labelCss}>← Back to Overview</span>
              </button>

              <div style={{ marginBottom: SP.sm }}>
                <span style={{ ...monoCss, fontSize: FS.sm, color: C.textSecondary }}>{activeCase.case_ref}</span>{' '}
                <Badge tone={activeCase.severity === 'critical' || activeCase.severity === 'high' ? 'high' : activeCase.severity === 'medium' ? 'medium' : 'low'}>{SEV_LABEL[activeCase.severity]}</Badge>{' '}
                <Badge tone="neutral">{STATUS_LABEL[activeCase.status]}</Badge>
              </div>
              <div style={{ fontFamily: F.sans, fontSize: FS.xl, fontWeight: FW.semibold, marginBottom: 6 }}>{activeCase.entity_name}</div>
              <p style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted, margin: `0 0 ${SP.huge}px` }}>
                {activeCase.case_type} · {activeCase.jurisdiction} · Opened {timeAgo(activeCase.opened_at)} · Exposure {fmtCurrency(activeCase.exposure_amount)} · SLA{' '}
                <span style={{ color: slaColor(liveSLA(activeCase.sla_remaining_hours), activeCase.sla_hours) }}>{fmtSLA(liveSLA(activeCase.sla_remaining_hours))}</span>
              </p>

              {/* Conclusion — card carrying the score device; header color
                  tracks risk, so this stays custom rather than PanelCard */}
              <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, padding: '22px 24px', marginBottom: SP.xl }}>
                <p style={{ ...labelCss, color: riskColor(activeCase.risk_score), marginBottom: 10 }}>Case Risk Score</p>
                <ScoreFigure value={activeCase.risk_score} max={100} color={riskColor(activeCase.risk_score)} bandLabel={SEV_LABEL[activeCase.severity]} size="lg" />
              </div>

              {/* Analysis — accent-rule editorial treatment inside a card */}
              <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, padding: '22px 24px', marginBottom: SP.xl }}>
                <div style={{ borderLeft: `2px solid ${C.accent}`, paddingLeft: SP.xl }}>
                  <p style={labelCss}>Analysis</p>
                  <p style={{ margin: '8px 0 0', fontSize: FS.md, lineHeight: 1.75, color: C.textPrimary }}>{activeCase.ai_summary}</p>
                </div>
              </div>

              <PanelCard title="Signal Breakdown" subtitle={`${activeCase.signals.length} signals contributed to this score.`}>
                {activeCase.signals.map((s, i) => (
                  <EvidenceRow key={i} label={s.name} score={s.score} color={riskColor(s.score)} rationale={s.rationale} />
                ))}
              </PanelCard>

              {(activeCase.status === 'open' || activeCase.status === 'pending_info') && (
                <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, padding: '22px 24px' }}>
                  <p style={labelCss}>Analyst Actions</p>
                  <div style={{ display: 'flex', gap: SP.md, marginTop: SP.md }}>
                    <button disabled={acting} onClick={() => action(activeCase.id, 'escalate')} style={{ flex: 1, padding: '13px', borderRadius: R.control, border: `1px solid ${C.riskHigh}55`, background: 'transparent', color: C.riskHigh, cursor: 'pointer', fontFamily: F.sans, fontSize: FS.base, fontWeight: FW.medium }}>Escalate</button>
                    <button disabled={acting} onClick={() => action(activeCase.id, 'request_info')} style={{ flex: 1, padding: '13px', borderRadius: R.control, border: borderLine, background: 'transparent', color: C.textSecondary, cursor: 'pointer', fontFamily: F.sans, fontSize: FS.base }}>Request Info</button>
                    <button disabled={acting} onClick={() => action(activeCase.id, 'clear')} style={{ flex: 1, padding: '13px', borderRadius: R.control, border: `1px solid ${C.riskLow}55`, background: 'transparent', color: C.riskLow, cursor: 'pointer', fontFamily: F.sans, fontSize: FS.base }}>Clear</button>
                  </div>
                  <p style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted, marginTop: SP.md }}>ACTION LOGGED · FULL AUDIT TRAIL MAINTAINED · FCA COMPLIANT</p>
                </div>
              )}

              {activeCase.status === 'escalated' && (
                <p style={{ fontSize: FS.sm, color: C.textSecondary, margin: 0 }}>
                  Status: <strong style={{ color: C.riskHigh }}>Escalated to Senior Compliance</strong>
                </p>
              )}
              {activeCase.status === 'cleared' && (
                <p style={{ fontSize: FS.sm, color: C.textSecondary, margin: 0 }}>
                  Status: <strong style={{ color: C.riskLow }}>Cleared — No further action required</strong>
                </p>
              )}
            </div>
          )}
        </main>
      </div>
      </div>
    </div>
  )
}
