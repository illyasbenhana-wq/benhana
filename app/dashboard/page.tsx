'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getRoleFromSession, ROLE_LABEL, UserRole } from '../../lib/user-role'
import { isPreviewDeployment } from '../../lib/preview-bypass'
import { MerchantIntelligence } from './components/MerchantIntelligence'
import { fatimaOkoyeComplianceCase } from '../../lib/fatima-okoye-demo'
import { PrecisionGauge } from '../components/PrecisionGauge'
import { Logo } from '../components/Logo'
import { DashboardSidebar } from '../components/DashboardSidebar'
import { DashboardKpiRow } from '../components/DashboardKpiRow'
import { Badge } from '../components/Badge'
import { EvidenceRow } from '../components/EvidenceRow'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  borderLine,
  shadowSm,
  shadowMd,
  motion as M,
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
  const panelCss: React.CSSProperties = { background: C.surface, border: borderLine, borderRadius: R.data, boxShadow: shadowSm }

  const activeCases = cases.filter(c => c.status !== 'cleared')
  const rankedCases = [...activeCases].sort((a, b) => b.risk_score - a.risk_score)
  const gaugeCases = rankedCases.slice(0, 3)
  const activeSignals = rankedCases.slice(0, 5).map(c => {
    const top = [...c.signals].sort((x, y) => y.score - x.score)[0]
    return { c, name: top?.name ?? c.case_type, score: top?.score ?? c.risk_score }
  })
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
        <DashboardKpiRow
          title="Risk Intelligence Overview"
          kpis={[
            { label: 'Active Cases', value: String(activeCases.length) },
            { label: 'Critical', value: String(criticalCount), tone: criticalCount > 0 ? 'danger' : 'default' },
            { label: 'SLA Breaching', value: String(slaBreachingCount), tone: slaBreachingCount > 0 ? 'warning' : 'default' },
            { label: 'Avg Risk Score', value: String(avgRiskScore), tone: avgRiskScore >= 75 ? 'danger' : avgRiskScore >= 50 ? 'warning' : 'success' },
          ]}
        />
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
            /* ── Risk Intelligence Overview ── */
            <div>
              <div style={{ ...labelCss, letterSpacing: '0.16em', marginBottom: SP.xl }}>Risk Intelligence Overview</div>

              {/* Primary operational signal — the single case that needs attention
                  right now, promoted to Tier-3 (shadowMd). The next 2 highest-risk
                  cases are demoted to small inline chips beside it rather than
                  competing at equal visual weight. */}
              {gaugeCases.length > 0 && (
                <div style={{ display: 'flex', gap: SP.xl, alignItems: 'stretch', paddingBottom: SP.xl, borderBottom: borderLine, marginBottom: SP.xl, flexWrap: 'wrap' }}>
                  <div
                    onClick={() => setActiveCase(gaugeCases[0])}
                    style={{
                      display: 'flex', alignItems: 'center', gap: SP.xl,
                      background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowMd,
                      padding: `${SP.lg}px ${SP.xl}px`, cursor: 'pointer', flex: '1 1 380px',
                    }}
                  >
                    <PrecisionGauge
                      value={gaugeCases[0].risk_score}
                      label={SEV_LABEL[gaugeCases[0].severity]}
                      color={riskColor(gaugeCases[0].risk_score)}
                      size={92}
                      strokeWidth={5}
                      trackColor={C.border}
                      captionColor={C.textSecondary}
                      fontFamilyOverride={{ mono: F.mono, sans: F.sans }}
                      ringAnimation={M.ringDraw}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={labelCss}>Requires attention</div>
                      <div style={{ fontSize: FS.lg, fontWeight: FW.semibold, margin: '4px 0 6px' }}>{gaugeCases[0].entity_name}</div>
                      <div style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted }}>{gaugeCases[0].case_ref} · {gaugeCases[0].case_type}</div>
                    </div>
                  </div>

                  {gaugeCases.slice(1, 3).map(c => (
                    <div
                      key={c.id}
                      onClick={() => setActiveCase(c)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: SP.md,
                        border: borderLine, borderRadius: R.control,
                        padding: `${SP.sm}px ${SP.md}px`, cursor: 'pointer', flex: '0 1 200px',
                      }}
                    >
                      <PrecisionGauge
                        value={c.risk_score}
                        color={riskColor(c.risk_score)}
                        size={44}
                        strokeWidth={3}
                        trackColor={C.border}
                        fontFamilyOverride={{ mono: F.mono, sans: F.sans }}
                        ringAnimation={M.ringDraw}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: FS.sm, fontWeight: FW.medium, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.entity_name}</div>
                        <div style={{ ...monoCss, fontSize: 10, color: C.textMuted }}>{c.case_ref}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Active signals — live feed */}
              <div style={{ marginBottom: SP.xl, paddingBottom: SP.xl, borderBottom: borderLine }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm, marginBottom: SP.md }}>
                  <span style={labelCss}>Active Signals</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.riskLow }} />
                </div>
                {activeSignals.map((s, i) => (
                  <EvidenceRow
                    key={s.c.id}
                    onClick={() => setActiveCase(s.c)}
                    label={s.name}
                    context={`— ${s.c.entity_name} · ${s.c.case_ref}`}
                    score={s.score}
                    color={SEV_COLOR[s.c.severity] || C.textMuted}
                    emphasized={i === 0}
                  />
                ))}
              </div>

              {/* Analyst load */}
              <div style={{ marginBottom: SP.xl }}>
                <div style={{ ...labelCss, marginBottom: SP.md }}>Analyst Load</div>
                {analysts.map(a => (
                  <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: SP.lg, padding: `${SP.sm}px 0` }}>
                    <span style={{ fontSize: FS.base, minWidth: 140 }}>{a.name}</span>
                    <div style={{ flex: 1, maxWidth: 220, height: 8, background: C.surface, border: borderLine, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min((a.open / 8) * 100, 100)}%`, background: a.critical > 0 ? C.riskHigh : a.open >= 4 ? C.riskMedium : C.riskLow }} />
                    </div>
                    <span style={{ ...monoCss, fontSize: FS.sm, color: C.textSecondary }}>{a.open} {a.open === 1 ? 'case' : 'cases'}</span>
                    {a.critical > 0 && <span style={{ ...labelCss, color: C.riskHigh }}>{a.critical} critical</span>}
                  </div>
                ))}
              </div>

              {/* Merchant intelligence — the human side of credit */}
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

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: SP.xl, marginBottom: SP.xxl }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm, marginBottom: SP.sm }}>
                    <span style={{ ...monoCss, fontSize: FS.sm, color: C.textSecondary }}>{activeCase.case_ref}</span>
                    <Badge tone={activeCase.severity === 'critical' || activeCase.severity === 'high' ? 'high' : activeCase.severity === 'medium' ? 'medium' : 'low'}>{SEV_LABEL[activeCase.severity]}</Badge>
                    <Badge tone="neutral">{STATUS_LABEL[activeCase.status]}</Badge>
                  </div>
                  <div style={{ fontFamily: F.sans, fontSize: FS.xl, marginBottom: 4 }}>{activeCase.entity_name}</div>
                  <div style={{ fontSize: FS.sm, color: C.textSecondary }}>{activeCase.case_type} · {activeCase.jurisdiction} · Opened {timeAgo(activeCase.opened_at)}</div>
                </div>
                <PrecisionGauge
                  value={activeCase.risk_score}
                  label={SEV_LABEL[activeCase.severity]}
                  color={riskColor(activeCase.risk_score)}
                  size={128}
                  trackColor={C.border}
                  captionColor={C.textSecondary}
                  fontFamilyOverride={{ mono: F.mono, sans: F.sans }}
                  ringAnimation={M.ringDraw}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: SP.sm, marginBottom: SP.xl }}>
                {[
                  { label: 'Case Type', val: activeCase.case_type },
                  { label: 'Jurisdiction', val: activeCase.jurisdiction },
                  { label: 'Exposure', val: fmtCurrency(activeCase.exposure_amount), mono: true },
                  { label: 'SLA Remaining', val: fmtSLA(liveSLA(activeCase.sla_remaining_hours)), color: slaColor(liveSLA(activeCase.sla_remaining_hours), activeCase.sla_hours), mono: true },
                ].map(m => (
                  <div key={m.label} style={{ ...panelCss, padding: `${SP.md}px ${SP.lg}px` }}>
                    <div style={{ ...labelCss, marginBottom: 6 }}>{m.label}</div>
                    <div style={{ fontSize: FS.base, fontWeight: FW.medium, color: (m as { color?: string }).color || C.textPrimary, fontFamily: (m as { mono?: boolean }).mono ? F.mono : F.sans }}>{m.val}</div>
                  </div>
                ))}
              </div>

              <div style={{ ...panelCss, padding: `${SP.lg}px ${SP.xl}px`, marginBottom: SP.xl }}>
                <div style={{ ...labelCss, marginBottom: SP.md }}>Risk Intelligence</div>
                <p style={{ margin: 0, fontSize: FS.base, lineHeight: 1.65, color: C.textSecondary }}>{activeCase.ai_summary}</p>
              </div>

              <div style={{ marginBottom: SP.xxl }}>
                <div style={{ ...labelCss, marginBottom: SP.lg }}>Signal Breakdown</div>
                {activeCase.signals.map((s, i) => (
                  <EvidenceRow key={i} label={s.name} score={s.score} color={riskColor(s.score)} rationale={s.rationale} />
                ))}
              </div>

              {(activeCase.status === 'open' || activeCase.status === 'pending_info') && (
                <div>
                  <div style={{ ...labelCss, marginBottom: SP.md }}>Analyst Actions</div>
                  <div style={{ display: 'flex', gap: SP.md }}>
                    <button disabled={acting} onClick={() => action(activeCase.id, 'escalate')} style={{ flex: 1, padding: '13px', borderRadius: R.control, border: `1px solid ${C.riskHigh}55`, background: 'transparent', color: C.riskHigh, cursor: 'pointer', fontFamily: F.sans, fontSize: FS.base, fontWeight: FW.medium }}>Escalate</button>
                    <button disabled={acting} onClick={() => action(activeCase.id, 'request_info')} style={{ flex: 1, padding: '13px', borderRadius: R.control, border: borderLine, background: 'transparent', color: C.textSecondary, cursor: 'pointer', fontFamily: F.sans, fontSize: FS.base }}>Request Info</button>
                    <button disabled={acting} onClick={() => action(activeCase.id, 'clear')} style={{ flex: 1, padding: '13px', borderRadius: R.control, border: `1px solid ${C.riskLow}55`, background: 'transparent', color: C.riskLow, cursor: 'pointer', fontFamily: F.sans, fontSize: FS.base }}>Clear</button>
                  </div>
                  <p style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted, marginTop: SP.md }}>ACTION LOGGED · FULL AUDIT TRAIL MAINTAINED · FCA COMPLIANT</p>
                </div>
              )}

              {activeCase.status === 'escalated' && (
                <div style={{ ...panelCss, padding: `${SP.md}px ${SP.lg}px`, borderColor: `${C.riskHigh}55`, fontSize: FS.sm, color: C.textSecondary }}>
                  Status: <strong style={{ color: C.riskHigh }}>Escalated to Senior Compliance</strong>
                </div>
              )}
              {activeCase.status === 'cleared' && (
                <div style={{ ...panelCss, padding: `${SP.md}px ${SP.lg}px`, borderColor: `${C.riskLow}55`, fontSize: FS.sm, color: C.textSecondary }}>
                  Status: <strong style={{ color: C.riskLow }}>Cleared — No further action required</strong>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      </div>
    </div>
  )
}
