'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getRoleFromSession, ROLE_LABEL, UserRole } from '../../lib/user-role'
import { MerchantIntelligence } from './components/MerchantIntelligence'
import { fatimaOkoyeComplianceCase, FATIMA_OKOYE_CASE_REF } from '../../lib/fatima-okoye-demo'

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
type AuditEvent = { time: string; analyst: string; action: string; case_ref: string; severity?: string }
type TxSignal = { label: string; value: string; trend: 'up' | 'down' | 'flat'; note: string }

// ─── Color / Label Maps ───────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: '#E24B4A',
  high: '#BA7517',
  medium: '#4a9eff',
  low: '#1D9E75',
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

const MOCK_AUDIT: AuditEvent[] = [
  { time: '10:02', analyst: 'R. Okonkwo',  action: 'Merchant corridor flag — Fatima Okoye', case_ref: FATIMA_OKOYE_CASE_REF, severity: 'medium' },
  { time: '09:41', analyst: 'S. Chen',     action: 'Escalated to Senior Compliance',   case_ref: 'INV-1047', severity: 'critical' },
  { time: '09:28', analyst: 'R. Okonkwo',  action: 'Evidence package uploaded',        case_ref: 'INV-1038' },
  { time: '09:15', analyst: 'M. Vasquez',  action: 'Information request sent',         case_ref: 'INV-1015' },
  { time: '08:54', analyst: 'L. Hartmann', action: 'Case notes updated',               case_ref: 'INV-1009' },
  { time: '08:37', analyst: 'S. Chen',     action: 'PEP match confirmed — Tier 1',     case_ref: 'INV-1021', severity: 'high' },
  { time: '08:12', analyst: 'R. Okonkwo',  action: 'Velocity threshold breach logged', case_ref: 'INV-1038' },
  { time: '07:58', analyst: 'M. Vasquez',  action: 'Case assigned from queue',         case_ref: 'INV-1015' },
  { time: '07:33', analyst: 'S. Chen',     action: 'Sanctions hit confirmed — OFAC',   case_ref: 'INV-1047', severity: 'critical' },
]

const MOCK_TX_SIGNALS: TxSignal[] = [
  { label: 'Transactions flagged (24h)', value: '143',   trend: 'up',   note: '+18% vs prior 24h' },
  { label: 'Avg. signal confidence',     value: '81.4%', trend: 'up',   note: '+2.1pp this week' },
  { label: 'High-risk jurisdictions',    value: '9',     trend: 'flat', note: 'Iran, Myanmar, Russia + 6 others' },
  { label: 'Threshold avoidance hits',   value: '27',    trend: 'up',   note: 'Up from 19 yesterday' },
  { label: 'Network clusters detected',  value: '4',     trend: 'down', note: '1 resolved since 08:00' },
]

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
  if (hours <= 0) return '#E24B4A'
  if (hours < 1) return '#E24B4A'           // under 1 hour → red
  const pct = hours / total
  if (pct < 0.3) return '#E24B4A'
  if (pct < 0.6) return '#BA7517'
  return '#1D9E75'
}

function riskColor(score: number) {
  if (score >= 75) return '#E24B4A'
  if (score >= 50) return '#BA7517'
  return '#1D9E75'
}

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
  const [audit, setAudit] = useState<AuditEvent[]>([])
  const [txSignals, setTxSignals] = useState<TxSignal[]>(MOCK_TX_SIGNALS)
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

    // Auth guard — redirect to /login if no active session
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
    supabase
      .from('audit_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error || !data?.length) {
          console.error('[EthosFi] audit_events query failed:', error)
          setAudit(MOCK_AUDIT)
          return
        }
        setAudit(data.map(e => ({
          time: new Date(e.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          analyst: e.analyst,
          action: e.action,
          case_ref: e.case_ref,
          severity: e.severity ?? undefined,
        })))
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
    const res = await fetch('/api/case-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId,
        caseRef: c?.case_ref ?? '',
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
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    setAudit(prev => [{ time: timeStr, analyst: 'analyst', action: actionLabel, case_ref: c?.case_ref ?? '', severity: act === 'escalate' ? c?.severity : undefined }, ...prev])
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

  const activeCount  = cases.filter(c => c.status === 'open' || c.status === 'escalated').length
  const critCount    = cases.filter(c => c.severity === 'critical').length
  const escalCount   = cases.filter(c => c.status === 'escalated').length
  const slaBreaching = cases.filter(c => liveSLA(c.sla_remaining_hours) / c.sla_hours < 0.3 && c.status !== 'cleared').length

  const kpis = [
    { label: 'Active Cases',  val: activeCount,  color: '#e8e6df' },
    { label: 'Critical',      val: critCount,    color: critCount > 0 ? '#E24B4A' : '#e8e6df' },
    { label: 'Escalated',     val: escalCount,   color: escalCount > 0 ? '#BA7517' : '#e8e6df' },
    { label: 'SLA Breaching', val: slaBreaching, color: slaBreaching > 0 ? '#E24B4A' : '#1D9E75' },
    { label: 'Cleared',       val: cases.filter(c => c.status === 'cleared').length, color: '#1D9E75' },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0f', color: '#e8e6df', fontFamily: '"DM Sans", sans-serif', overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Serif+Display&display=swap" rel="stylesheet" />
      <style>{`* { box-sizing: border-box; } ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0a0a0f; } ::-webkit-scrollbar-thumb { background: #2a2a38; border-radius: 2px; } .logout-btn { margin-left: 8px; background: none; border: 1px solid #2a2a38; border-radius: 4px; padding: 3px 8px; color: #555; font-size: 11px; cursor: pointer; font-family: inherit; transition: color 0.15s, border-color 0.15s; } .logout-btn:hover { color: #e24b4a; border-color: #3a1a1a; }`}</style>

      {/* ── Sidebar ── */}
      <div style={{ width: 320, borderRight: '1px solid #1a1a28', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Header */}
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #1a1a28' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: '#4a9eff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L14 5V8C14 11.31 11.46 14.42 8 15C4.54 14.42 2 11.31 2 8V5L8 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 15 }}>EthosFi</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4a9eff', background: '#0d1f33', border: '1px solid #1a3a5c', borderRadius: 4, padding: '2px 8px' }}>{ROLE_LABEL[userRole]}</span>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign out"
              className="logout-btn"
            >
              Sign out
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Active',    val: activeCount, color: '#e8e6df' },
              { label: 'Critical',  val: critCount,   color: critCount > 0 ? '#E24B4A' : '#e8e6df' },
              { label: 'Escalated', val: escalCount,  color: escalCount > 0 ? '#BA7517' : '#e8e6df' },
            ].map(m => (
              <div key={m.label} style={{ background: '#13131a', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 20, fontWeight: 500, color: m.color }}>{m.val}</div>
                <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 12px 0' }}>
          <div style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="#555" strokeWidth="1.5"/>
              <path d="M10 10L13.5 13.5" stroke="#555" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search entity or case ref…"
              style={{
                width: '100%', background: '#13131a', border: '1px solid #1e1e2e',
                borderRadius: 8, padding: '7px 10px 7px 28px', color: '#e8e6df',
                fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 12px 0' }}>
          {([
            { key: 'all',       label: 'All',       count: cases.length },
            { key: 'critical',  label: 'Critical',  count: cases.filter(c => c.severity === 'critical').length },
            { key: 'escalated', label: 'Escalated', count: cases.filter(c => c.status === 'escalated').length },
            { key: 'pending',   label: 'Pending',   count: cases.filter(c => c.status === 'pending_info').length },
          ] as const).map(({ key, label, count }) => {
            const active = filter === key
            return (
              <button key={key} type="button" onClick={() => setFilter(key)} style={{
                flex: 1, padding: '6px 4px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: active ? '#1a1a28' : 'transparent',
                color: active ? '#e8e6df' : '#555', fontFamily: 'inherit', transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: active ? '#e8e6df' : '#444', lineHeight: 1 }}>{count}</span>
                <span style={{ fontSize: 10, letterSpacing: '0.03em' }}>{label}</span>
              </button>
            )
          })}
        </div>

        {/* Case list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {filtered.length === 0 && (
            <p style={{ color: '#444', fontSize: 13, padding: '20px 8px' }}>No cases in this view.</p>
          )}
          {filtered.map(c => {
            const sc = SEV_COLOR[c.severity] || '#555'
            const isSelected = activeCase?.id === c.id
            const lsla = liveSLA(c.sla_remaining_hours)
            const slaCol = slaColor(lsla, c.sla_hours)
            return (
              <div key={c.id} onClick={() => setActiveCase(c)} style={{
                padding: '12px 14px', borderRadius: 10, marginBottom: 4, cursor: 'pointer',
                border: `1px solid ${isSelected ? '#4a9eff33' : 'transparent'}`,
                background: isSelected ? '#0d1f33' : 'transparent', transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{c.entity_name}</div>
                  <div style={{ fontSize: 20, fontWeight: 500, color: riskColor(c.risk_score), lineHeight: 1 }}>{c.risk_score}</div>
                </div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{c.case_type}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: '#555' }}>{c.case_ref} · {fmtCurrency(c.exposure_amount)}</div>
                  <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <div style={{ fontSize: 10, color: slaCol, fontVariantNumeric: 'tabular-nums' }}>SLA {fmtSLA(lsla)}</div>
                    <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: `${sc}22`, color: sc }}>{SEV_LABEL[c.severity]}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Main panel ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>

        {!activeCase ? (
          /* ── Operations overview ── */
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Operations Centre</div>
              <div style={{ fontSize: 20, fontWeight: 500 }}>Live Risk Overview</div>
            </div>

            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 28 }}>
              {kpis.map(k => (
                <div key={k.label} style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 26, fontWeight: 500, color: k.color, lineHeight: 1 }}>{k.val}</div>
                  <div style={{ fontSize: 11, color: '#555', marginTop: 5 }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Row 1: Critical Alerts + Analyst Workload */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, marginBottom: 20 }}>

              {/* Critical Alerts */}
              <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Critical Alerts</div>
                {cases
                  .filter(c => c.severity === 'critical' || c.severity === 'high')
                  .slice(0, 4)
                  .map((c, i, arr) => (
                    <div key={c.id} onClick={() => setActiveCase(c)} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 0', cursor: 'pointer',
                      borderBottom: i < arr.length - 1 ? '1px solid #1a1a28' : 'none',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[c.severity], flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{c.entity_name}</div>
                        <div style={{ fontSize: 11, color: '#555' }}>{c.case_ref} · {c.case_type}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, color: slaColor(liveSLA(c.sla_remaining_hours), c.sla_hours), fontVariantNumeric: 'tabular-nums' }}>SLA {fmtSLA(liveSLA(c.sla_remaining_hours))}</div>
                        <div style={{ fontSize: 11, color: '#555' }}>{fmtCurrency(c.exposure_amount)}</div>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Analyst Workload */}
              <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Analyst Workload</div>
                {analysts.map((a, i) => (
                  <div key={a.name} style={{ padding: '10px 0', borderBottom: i < analysts.length - 1 ? '1px solid #1a1a28' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                        <div style={{ fontSize: 11, color: '#555' }}>{a.role}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{a.open} open</div>
                        {a.critical > 0 && <div style={{ fontSize: 10, color: '#E24B4A' }}>{a.critical} critical</div>}
                        {a.sla_breaching > 0 && <div style={{ fontSize: 10, color: '#BA7517' }}>{a.sla_breaching} SLA breach</div>}
                      </div>
                    </div>
                    <div style={{ height: 2, background: '#1a1a28', borderRadius: 1, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min((a.open / 12) * 100, 100)}%`, background: a.open >= 8 ? '#E24B4A' : a.open >= 5 ? '#BA7517' : '#1D9E75', borderRadius: 1 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 2: Audit Activity + Transaction Intelligence */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

              {/* Audit Activity Stream */}
              <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Audit Activity Stream</div>
                {audit.map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: i < audit.length - 1 ? '1px solid #1a1a28' : 'none' }}>
                    <div style={{ fontSize: 11, color: '#444', flexShrink: 0, minWidth: 38 }}>{e.time}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: e.severity ? SEV_COLOR[e.severity] : '#e8e6df', lineHeight: 1.4 }}>{e.action}</div>
                      <div style={{ fontSize: 11, color: '#555' }}>{e.analyst} · {e.case_ref}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Transaction Intelligence Signals */}
              <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 14, padding: '20px 24px' }}>
                <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Transaction Intelligence</div>
                {txSignals.map((s, i) => (
                  <div key={i} style={{ padding: '11px 0', borderBottom: i < txSignals.length - 1 ? '1px solid #1a1a28' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ fontSize: 12, color: '#888' }}>{s.label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: s.trend === 'up' ? '#E24B4A' : s.trend === 'down' ? '#1D9E75' : '#888' }}>{s.value}</div>
                        <div style={{ fontSize: 12, color: s.trend === 'up' ? '#E24B4A' : s.trend === 'down' ? '#1D9E75' : '#555' }}>
                          {s.trend === 'up' ? '↑' : s.trend === 'down' ? '↓' : '→'}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#444' }}>{s.note}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Row 3: Merchant Intelligence */}
            <div style={{ maxWidth: 500 }}>
              <MerchantIntelligence />
            </div>
          </div>

        ) : (
          /* ── Case detail view ── */
          <div style={{ maxWidth: 680 }}>

            <button onClick={() => setActiveCase(null)} style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '0 0 24px', display: 'flex', alignItems: 'center', gap: 6 }}>
              ← Operations Overview
            </button>

            {/* Case header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 12, color: '#555', letterSpacing: '0.06em' }}>{activeCase.case_ref}</div>
                  <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: `${SEV_COLOR[activeCase.severity]}22`, color: SEV_COLOR[activeCase.severity], border: `1px solid ${SEV_COLOR[activeCase.severity]}44` }}>
                    {SEV_LABEL[activeCase.severity]}
                  </div>
                  <div style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#1a1a28', color: '#888' }}>
                    {STATUS_LABEL[activeCase.status]}
                  </div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 500, marginBottom: 3 }}>{activeCase.entity_name}</div>
                <div style={{ fontSize: 13, color: '#555' }}>{activeCase.case_type} · {activeCase.jurisdiction} · Opened {timeAgo(activeCase.opened_at)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 56, fontFamily: '"DM Serif Display", serif', color: riskColor(activeCase.risk_score), lineHeight: 1 }}>{activeCase.risk_score}</div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>Risk Score</div>
              </div>
            </div>

            {/* Case detail tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
              {[
                { label: 'Case Type',     val: activeCase.case_type },
                { label: 'Jurisdiction',  val: activeCase.jurisdiction },
                { label: 'Exposure',      val: fmtCurrency(activeCase.exposure_amount) },
                { label: 'SLA Remaining', val: fmtSLA(liveSLA(activeCase.sla_remaining_hours)), color: slaColor(liveSLA(activeCase.sla_remaining_hours), activeCase.sla_hours) },
              ].map(m => (
                <div key={m.label} style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: (m as any).color || '#e8e6df' }}>{m.val}</div>
                </div>
              ))}
            </div>

            {/* Risk Intelligence */}
            <div style={{ background: '#13131a', border: '1px solid #2a2a38', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <p style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Risk Intelligence</p>
                <div style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: `${SEV_COLOR[activeCase.severity]}22`, color: SEV_COLOR[activeCase.severity], border: `1px solid ${SEV_COLOR[activeCase.severity]}44` }}>
                  {SEV_LABEL[activeCase.severity]} Risk
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#bbb' }}>{activeCase.ai_summary}</p>
            </div>

            {/* Signal Breakdown */}
            <div style={{ marginBottom: 28 }}>
              <p style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>Signal Breakdown</p>
              {activeCase.signals.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{
                    minWidth: 36, height: 36, borderRadius: 8,
                    background: s.score >= 70 ? '#2a0d0d' : s.score >= 40 ? '#2a1e0a' : '#0d2a20',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 500,
                    color: s.score >= 70 ? '#E24B4A' : s.score >= 40 ? '#BA7517' : '#1D9E75',
                  }}>
                    {s.score}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{s.name}</div>
                    <div style={{ height: 3, background: '#1a1a28', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
                      <div style={{ height: '100%', width: `${s.score}%`, background: s.score >= 70 ? '#E24B4A' : s.score >= 40 ? '#BA7517' : '#1D9E75', borderRadius: 2 }} />
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#555', lineHeight: 1.5 }}>{s.rationale}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Analyst Actions */}
            {(activeCase.status === 'open' || activeCase.status === 'pending_info') && (
              <div>
                <p style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Analyst Actions</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button disabled={acting} onClick={() => action(activeCase.id, 'escalate')} style={{ flex: 1, padding: '14px', borderRadius: 10, border: '1px solid #E24B4A44', background: '#2a0d0d', color: '#E24B4A', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500 }}>
                    Escalate
                  </button>
                  <button disabled={acting} onClick={() => action(activeCase.id, 'request_info')} style={{ flex: 1, padding: '14px', borderRadius: 10, border: '1px solid #2a2a38', background: 'transparent', color: '#888', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                    Request Info
                  </button>
                  <button disabled={acting} onClick={() => action(activeCase.id, 'clear')} style={{ flex: 1, padding: '14px', borderRadius: 10, border: '1px solid #1D9E7544', background: '#0d2a20', color: '#1D9E75', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>
                    Clear
                  </button>
                </div>
                <p style={{ fontSize: 11, color: '#333', marginTop: 12 }}>
                  ✓ Action logged · Full audit trail maintained · FCA compliant
                </p>
              </div>
            )}

            {activeCase.status === 'escalated' && (
              <div style={{ padding: '14px 18px', borderRadius: 10, background: '#13131a', border: '1px solid #E24B4A44', fontSize: 13, color: '#555' }}>
                Status: <strong style={{ color: '#E24B4A' }}>Escalated to Senior Compliance</strong>
              </div>
            )}

            {activeCase.status === 'cleared' && (
              <div style={{ padding: '14px 18px', borderRadius: 10, background: '#13131a', border: '1px solid #1D9E7544', fontSize: 13, color: '#555' }}>
                Status: <strong style={{ color: '#1D9E75' }}>Cleared — No further action required</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
