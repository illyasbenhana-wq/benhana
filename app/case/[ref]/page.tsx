'use client'
/**
 * EthosFi — Screen 2: Case / Investigation View (UX-1)
 * ------------------------------------------------------------------
 * A timeline-centered investigation dossier, not a form. Built on the
 * light "Ramp" design tokens (lib/design-system/tokens-light.ts) and
 * the shared PrecisionGauge signature element. Design-only: data comes
 * from lib/investigation-demo.ts (frontend seed data). No backend,
 * no API routes, no DB access — the analyst-note field and action
 * buttons are intentionally local/presentational so the view is safe
 * to review with no session.
 */
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PrecisionGauge } from '../../components/PrecisionGauge'
import { DashboardSidebar } from '../../components/DashboardSidebar'
import { getDossier, TimelineEvent } from '../../../lib/investigation-demo'
import type { CaseGraph } from '../../../lib/ontology-graph'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  borderLine,
  shadowSm,
  motion as M,
  keyframes as KF,
  googleFontsHref,
  caseRiskColor,
} from '../../../lib/design-system/tokens-light'

const SEV_COLOR: Record<string, string> = {
  critical: C.riskHigh,
  high: C.riskMedium,
  medium: C.accent,
  low: C.riskLow,
}
const SEV_LABEL: Record<string, string> = {
  critical: 'Critical Risk',
  high: 'High Risk',
  medium: 'Medium Risk',
  low: 'Low Risk',
}
const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  escalated: 'Escalated',
  pending_info: 'Pending Info',
  cleared: 'Cleared',
}

// Timeline dot glyph + color by event kind.
const KIND: Record<TimelineEvent['kind'], { glyph: string; color: (sev: string) => string }> = {
  sanctions:  { glyph: '●', color: () => C.riskHigh },
  escalation: { glyph: '▲', color: () => C.riskHigh },
  anomaly:    { glyph: '▲', color: () => C.riskMedium },
  signal:     { glyph: '▲', color: () => C.riskMedium },
  note:       { glyph: '●', color: () => C.accent },
  opened:     { glyph: '○', color: () => C.textSecondary },
}

function fmtCurrency(n: number) {
  if (n >= 1000000) return `£${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `£${(n / 1000).toFixed(0)}K`
  return `£${n}`
}
function fmtSLA(hours: number) {
  if (hours <= 0) return 'OVERDUE'
  const total = Math.round(hours * 3600)
  const hh = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  return hh > 0 ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${mm}m`
}
function slaColor(hours: number, total: number) {
  if (hours <= 0 || hours < 1) return C.riskHigh
  const pct = hours / total
  if (pct < 0.3) return C.riskHigh
  if (pct < 0.6) return C.riskMedium
  return C.riskLow
}

export default function InvestigationPage() {
  const params = useParams<{ ref: string }>()
  const dossier = useMemo(() => getDossier(params?.ref), [params])
  const [note, setNote] = useState('')

  // Real ontology data (docs/PHASE4_ONTOLOGY_DESIGN.md §6/§7) — additive to
  // the static dossier, not a replacement. `graph` stays null for any
  // case_ref with no matching DB row (most dossiers are still mock-only),
  // in which case the section below falls back to dossier.connectedEntities
  // exactly as before.
  const [graph, setGraph] = useState<CaseGraph | null>(null)
  useEffect(() => {
    if (!dossier) return
    let cancelled = false
    fetch(`/api/cases/${dossier.caseRef}/graph`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: CaseGraph | null) => { if (!cancelled) setGraph(data) })
      .catch(() => { if (!cancelled) setGraph(null) })
    return () => { cancelled = true }
  }, [dossier])

  // Merge: real DB-backed connections first, then any mock connectedEntities
  // whose name isn't already covered by a real connection (e.g. "Director"
  // relations — deliberately not modeled as edges yet, see §6.6) — so
  // nothing already visible disappears, but facts we do have real data for
  // now come from the database instead of frozen mock text.
  const realNames = new Set((graph?.connections ?? []).map(c => c.name.toLowerCase()))
  const mergedConnections = [
    ...(graph?.connections ?? []),
    ...(dossier?.connectedEntities ?? []).filter(e => !realNames.has(e.name.toLowerCase())),
  ]

  const labelCss: React.CSSProperties = {
    fontFamily: F.sans, fontSize: FS.micro, fontWeight: FW.semibold,
    letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSecondary,
  }
  const monoCss: React.CSSProperties = { fontFamily: F.mono, fontVariantNumeric: 'tabular-nums' }
  const cardCss: React.CSSProperties = {
    background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm,
  }

  if (!dossier) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans }}>
        <link href={googleFontsHref} rel="stylesheet" />
        <DashboardSidebar />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: SP.lg, flex: 1 }}>
          <div style={{ ...labelCss }}>Case not found</div>
          <Link href="/dashboard" style={{ color: C.accent, fontSize: FS.base, textDecoration: 'none' }}>← Back to queue</Link>
        </div>
      </div>
    )
  }

  const sc = SEV_COLOR[dossier.severity] || C.textSecondary

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans }}>
      <link href={googleFontsHref} rel="stylesheet" />
      <DashboardSidebar />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${C.background}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        ${KF}
        .ethos-back { color: ${C.textSecondary}; text-decoration: none; transition: color .15s; }
        .ethos-back:hover { color: ${C.accent}; }
        .ethos-linkcase { color: ${C.accent}; text-decoration: none; }
        .ethos-linkcase:hover { text-decoration: underline; }
        .ethos-note:focus { outline: none; border-color: ${C.accent}; }
        .ethos-btn { border-radius: ${R.control}px; padding: 11px 16px; font-family: ${F.sans}; font-size: ${FS.base}px; font-weight: ${FW.medium}; cursor: pointer; transition: background .15s, border-color .15s, color .15s; }
      `}</style>

      {/* ── Header ── */}
      <header style={{ borderBottom: borderLine, background: C.background, position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.md, padding: `${SP.md}px ${SP.xxl}px ${SP.sm}px` }}>
          <Link href="/dashboard" className="ethos-back" style={{ ...labelCss, color: C.textSecondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Back to Queue</Link>
          <span style={{ width: 1, height: 14, background: C.border }} />
          <span style={{ ...monoCss, fontSize: FS.sm, color: C.textSecondary }}>{dossier.caseRef}</span>
          <span style={{ fontSize: FS.md, fontWeight: FW.semibold }}>{dossier.entityName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.md, padding: `0 ${SP.xxl}px ${SP.md}px` }}>
          <span style={{ ...labelCss, color: sc, letterSpacing: '0.14em' }}>{dossier.caseType}</span>
          <span style={{ marginLeft: 'auto', ...labelCss, color: sc, border: `1px solid ${sc}55`, borderRadius: R.control, padding: '3px 10px' }}>{dossier.severity}</span>
          <span style={{ ...labelCss, color: C.textSecondary, border: borderLine, borderRadius: R.control, padding: '3px 10px' }}>{STATUS_LABEL[dossier.status]}</span>
          <span style={{ ...monoCss, fontSize: FS.sm, color: slaColor(dossier.slaRemainingHours, dossier.slaHours) }}>SLA {fmtSLA(dossier.slaRemainingHours)}</span>
        </div>
      </header>

      {/* ── Body: entity profile | risk timeline ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: SP.xl, padding: `${SP.xl}px ${SP.xxl}px ${SP.xxxl}px`, alignItems: 'start' }}>

        {/* ── Left: entity profile ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.lg }}>

          {/* Entity profile card */}
          <section style={{ ...cardCss, padding: SP.xl }}>
            <div style={{ ...labelCss, marginBottom: SP.lg }}>Entity Profile</div>
            <div style={{ fontSize: FS.lg, fontWeight: FW.semibold, marginBottom: SP.lg }}>{dossier.entityName}</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: SP.lg }}>
              <PrecisionGauge
                value={dossier.riskScore}
                label={SEV_LABEL[dossier.severity]}
                size={148}
                trackColor={C.border}
                captionColor={C.textSecondary}
                fontFamilyOverride={{ mono: F.mono, sans: F.sans }}
                ringAnimation={M.ringDraw}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.sm }}>
              {[
                { label: 'Exposure', val: fmtCurrency(dossier.exposureAmount), mono: true },
                { label: 'Jurisdiction', val: dossier.jurisdiction },
                { label: 'Assigned', val: dossier.assignedTo },
                { label: 'SLA Remaining', val: fmtSLA(dossier.slaRemainingHours), mono: true, color: slaColor(dossier.slaRemainingHours, dossier.slaHours) },
              ].map(m => (
                <div key={m.label} style={{ padding: `${SP.sm}px ${SP.md}px`, background: C.background, border: borderLine, borderRadius: R.data }}>
                  <div style={{ ...labelCss, marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: FS.sm, fontWeight: FW.medium, color: (m as { color?: string }).color || C.textPrimary, fontFamily: (m as { mono?: boolean }).mono ? F.mono : F.sans }}>{m.val}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Connected entities */}
          <section style={{ ...cardCss, padding: SP.xl }}>
            <div style={{ ...labelCss, marginBottom: SP.lg }}>Connected Entities</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SP.md }}>
              {mergedConnections.map((e, i) => {
                const open = !!e.linkedCaseRef
                const note: string | undefined = 'note' in e ? (e as { note?: string }).note : undefined
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: SP.md }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: open ? C.riskMedium : 'transparent', border: `1.5px solid ${open ? C.riskMedium : C.textSecondary}` }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ ...labelCss, marginBottom: 2 }}>{e.relation}</div>
                      <div style={{ fontSize: FS.base, fontWeight: FW.medium }}>
                        {open
                          ? <Link href={`/case/${e.linkedCaseRef}`} className="ethos-linkcase">{e.name}</Link>
                          : e.name}
                        {note && <span style={{ ...monoCss, marginLeft: SP.sm, fontSize: FS.xs, color: open ? C.riskMedium : C.textSecondary }}>{open ? `↗ ${note}` : note}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {graph?.person && (
              <div style={{ marginTop: SP.lg, paddingTop: SP.lg, borderTop: borderLine, display: 'flex', alignItems: 'center', gap: SP.md }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: 'transparent', border: `1.5px solid ${C.accent}` }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...labelCss, marginBottom: 2 }}>Linked Applicant</div>
                  <div style={{ fontSize: FS.base, fontWeight: FW.medium }}>
                    {graph.person.full_name}
                    {graph.person.email && (
                      <span style={{ ...monoCss, marginLeft: SP.sm, fontSize: FS.xs, color: C.textSecondary }}>{graph.person.email}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* EthoScore intelligence — illustrative preview; full breakdown is Screen 3 */}
          <section style={{ ...cardCss, padding: SP.xl }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.sm, marginBottom: SP.lg }}>
              <span style={labelCss}>EthoScore Intelligence</span>
              <span style={{ marginLeft: 'auto', ...monoCss, fontSize: FS.xs, color: C.textSecondary }}>PREVIEW</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.sm, marginBottom: SP.lg }}>
              <span style={{ ...monoCss, fontSize: FS.xl, fontWeight: FW.semibold, color: C.accent }}>{dossier.ethoScore}</span>
              <span style={{ ...monoCss, fontSize: FS.sm, color: C.textSecondary }}>/ 1000</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SP.md }}>
              {dossier.ethoPillars.map(p => (
                <div key={p.name}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.sm, marginBottom: 4 }}>
                    <span style={{ fontSize: FS.sm, fontWeight: FW.medium }}>{p.name}</span>
                    <span style={{ marginLeft: 'auto', ...monoCss, fontSize: FS.xs, color: C.textSecondary }}>{p.value}</span>
                  </div>
                  <div style={{ height: 4, background: C.background, border: borderLine, borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
                    <div style={{ height: '100%', width: `${(p.value / 1000) * 100}%`, background: C.accent }} />
                  </div>
                  <div style={{ fontSize: FS.xs, color: C.textMuted }}>{p.humanNote}</div>
                </div>
              ))}
            </div>
            <div style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted, marginTop: SP.lg }}>FULL PILLAR BREAKDOWN → ETHOSCORE PANEL (SCREEN 3)</div>
          </section>
        </div>

        {/* ── Right: risk timeline + analyst note ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: SP.lg }}>

          {/* Risk timeline */}
          <section style={{ ...cardCss, padding: SP.xl }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm, marginBottom: SP.xl }}>
              <span style={labelCss}>Risk Timeline</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.riskLow }} />
              <span style={{ ...monoCss, marginLeft: 'auto', fontSize: FS.xs, color: C.textMuted }}>{dossier.timeline.length} EVENTS</span>
            </div>

            <div style={{ position: 'relative', paddingLeft: SP.xl }}>
              {/* rail */}
              <div style={{ position: 'absolute', left: 5, top: 4, bottom: 4, width: 1, background: C.border }} />
              {dossier.timeline.map((ev, i) => {
                const k = KIND[ev.kind]
                const col = k.color(dossier.severity)
                return (
                  <div key={i} style={{ position: 'relative', paddingBottom: i === dossier.timeline.length - 1 ? 0 : SP.xl }}>
                    <span style={{ position: 'absolute', left: -SP.xl + 1, top: 2, width: 11, height: 11, borderRadius: '50%', background: C.background, border: `2px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.md, marginBottom: 4 }}>
                      <span style={{ ...monoCss, fontSize: FS.sm, color: C.textPrimary, minWidth: 42 }}>{ev.time}</span>
                      <span style={{ ...labelCss, color: col, letterSpacing: '0.1em' }}>{ev.title}</span>
                      {ev.confidence != null && (
                        <span style={{ marginLeft: 'auto', ...monoCss, fontSize: FS.xs, color: C.textSecondary }}>{ev.confidence}% conf.</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: SP.md }}>
                      <span style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted, minWidth: 42 }}>{ev.day}</span>
                      <p style={{ margin: 0, fontSize: FS.sm, color: C.textSecondary, lineHeight: 1.55 }}>{ev.detail}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Signal breakdown */}
          <section style={{ ...cardCss, padding: SP.xl }}>
            <div style={{ ...labelCss, marginBottom: SP.lg }}>Signal Breakdown</div>
            {dossier.signals.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: SP.lg, alignItems: 'flex-start', marginBottom: i === dossier.signals.length - 1 ? 0 : SP.lg }}>
                <div style={{ ...monoCss, minWidth: 40, height: 40, border: `1px solid ${caseRiskColor(s.score)}55`, borderRadius: R.data, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: FS.base, fontWeight: FW.medium, color: caseRiskColor(s.score), flexShrink: 0 }}>{s.score}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: FS.base, fontWeight: FW.medium, marginBottom: 5 }}>{s.name}</div>
                  <div style={{ height: 3, background: C.background, borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
                    <div style={{ height: '100%', width: `${s.score}%`, background: caseRiskColor(s.score) }} />
                  </div>
                  <p style={{ margin: 0, fontSize: FS.sm, color: C.textMuted, lineHeight: 1.55 }}>{s.rationale}</p>
                </div>
              </div>
            ))}
          </section>

          {/* Risk intelligence summary */}
          <section style={{ ...cardCss, padding: SP.xl }}>
            <div style={{ ...labelCss, marginBottom: SP.md }}>Risk Intelligence</div>
            <p style={{ margin: 0, fontSize: FS.base, lineHeight: 1.65, color: C.textSecondary }}>{dossier.aiSummary}</p>
          </section>

          {/* Add analyst note + actions (design-only, local state) */}
          <section style={{ ...cardCss, padding: SP.xl }}>
            <div style={{ ...labelCss, marginBottom: SP.md }}>Add Analyst Note</div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Record your assessment for the audit trail…"
              rows={3}
              className="ethos-note"
              style={{ width: '100%', background: C.background, border: borderLine, borderRadius: R.data, padding: SP.md, color: C.textPrimary, fontSize: FS.base, fontFamily: F.sans, lineHeight: 1.5, resize: 'vertical', marginBottom: SP.lg }}
            />
            <div style={{ display: 'flex', gap: SP.md }}>
              <button type="button" className="ethos-btn" style={{ flex: 1, border: `1px solid ${C.riskHigh}55`, background: 'transparent', color: C.riskHigh }}>Escalate</button>
              <button type="button" className="ethos-btn" style={{ flex: 1, border: borderLine, background: 'transparent', color: C.textSecondary }}>Request Info</button>
              <button type="button" className="ethos-btn" style={{ border: borderLine, background: 'transparent', color: C.textSecondary, minWidth: 48 }} title="Open in new view">↗</button>
            </div>
            <p style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted, marginTop: SP.md }}>DESIGN PREVIEW · ACTIONS NOT WIRED · FULL AUDIT TRAIL MAINTAINED IN PRODUCTION</p>
          </section>
        </div>
      </div>
      </div>
    </div>
  )
}
