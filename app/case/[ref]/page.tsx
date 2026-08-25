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
import { DashboardSidebar } from '../../components/DashboardSidebar'
import { Badge } from '../../components/Badge'
import { EvidenceRow } from '../../components/EvidenceRow'
import { ScoreFigure } from '../../components/ScoreFigure'
import { PillarCompositionBar } from '../../components/PillarCompositionBar'
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
  keyframes as KF,
  googleFontsHref,
  caseRiskColor,
  ethoScoreColor,
} from '../../../lib/design-system/tokens-light'

// Same pillar legend colors as /score/[id]'s PILLAR_LABELS — one shared
// mapping so the same pillar always reads as the same color everywhere.
const PILLAR_COLOR: Record<string, string> = {
  'Trust': C.accent,
  'Track Record': C.riskLow,
  'Financial Health': C.riskMedium,
  'ESG': '#7C3AED',
}

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

      {/* ── Header — pure wayfinding, not a title bar ── */}
      <header style={{ borderBottom: borderLine, background: C.background, position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.md, padding: `${SP.md}px ${SP.xxl}px` }}>
          <Link href="/dashboard" className="ethos-back" style={{ ...labelCss, color: C.textSecondary, display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Back to Queue</Link>
          <span style={{ width: 1, height: 14, background: C.border }} />
          <span style={{ ...monoCss, fontSize: FS.sm, color: C.textSecondary }}>{dossier.caseRef}</span>
        </div>
      </header>

      {/* ── Identity zone — the page's real headline, full width ── */}
      <div style={{ padding: `${SP.xxl}px ${SP.xxl}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.md, marginBottom: SP.sm, flexWrap: 'wrap' }}>
          <Badge tone={dossier.severity === 'critical' || dossier.severity === 'high' ? 'high' : dossier.severity === 'medium' ? 'medium' : 'low'}>{dossier.severity}</Badge>
          <Badge tone="neutral">{STATUS_LABEL[dossier.status]}</Badge>
          <span style={{ ...labelCss, color: sc }}>{dossier.caseType}</span>
        </div>
        <h1 style={{ fontFamily: F.sans, fontSize: 24, fontWeight: FW.bold, letterSpacing: '-0.01em', margin: `0 0 ${SP.sm}px` }}>
          {dossier.entityName.split(' ').map((word, i) => i === 0
            ? <span key={i} style={{ fontFamily: F.display, fontStyle: 'italic', fontWeight: FW.medium }}>{word} </span>
            : word + ' ')}
        </h1>
        <p style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted, margin: 0 }}>
          {fmtCurrency(dossier.exposureAmount)} · {dossier.jurisdiction} · {dossier.assignedTo} · SLA{' '}
          <span style={{ color: slaColor(dossier.slaRemainingHours, dossier.slaHours) }}>{fmtSLA(dossier.slaRemainingHours)}</span>
        </p>
      </div>

      {/* ── Body: entity profile | risk timeline — no cards, asymmetric
          two-zone layout separated by whitespace, matching Score/Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 340px) 1fr', gap: SP.xxl, padding: `${SP.xxl}px ${SP.xxl}px ${SP.xxxl}px`, alignItems: 'start' }}>

        {/* ── Left: entity profile ── */}
        <div>
          {/* Case Risk — its own tinted zone (C.surface, no border/shadow)
              so it reads as the first thing to look at through background
              contrast alone, matching the landing page's flat-color
              section device rather than a bordered card. */}
          <div style={{ background: C.surface, padding: SP.xl, margin: `0 0 ${SP.xxl}px` }}>
            <p style={{ ...labelCss, color: caseRiskColor(dossier.riskScore), marginBottom: 10 }}>Case Risk</p>
            <ScoreFigure value={dossier.riskScore} max={100} color={caseRiskColor(dossier.riskScore)} bandLabel={SEV_LABEL[dossier.severity]} size="lg" />
          </div>

          <div style={{ borderTop: borderLine, marginTop: SP.xxl, paddingTop: SP.xxl }}>
            <p style={labelCss}>Connected Entities</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SP.md, marginTop: SP.lg }}>
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
              {graph?.person && (
                <div style={{ marginTop: SP.sm, paddingTop: SP.md, borderTop: borderLine, display: 'flex', alignItems: 'center', gap: SP.md }}>
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
            </div>
          </div>

          {/* EthoScore intelligence — illustrative preview; full breakdown is
              the EthoScore panel. Reuses ScoreFigure at the compact "sm"
              size built for exactly this — an inline preview, not this
              screen's main content. */}
          <div style={{ borderTop: borderLine, marginTop: SP.xxl, paddingTop: SP.xxl }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: SP.sm, marginBottom: SP.lg }}>
              <span style={labelCss}>EthoScore Intelligence</span>
              <span style={{ marginLeft: 'auto', ...monoCss, fontSize: FS.xs, color: C.textSecondary }}>PREVIEW</span>
            </div>
            <ScoreFigure value={dossier.ethoScore} max={1000} color={ethoScoreColor(dossier.ethoScore)} size="sm" />

            {/* Pillar-totals stat tiles — same at-a-glance device as
                /score/[id]'s Factors section, for the same 4-pillar
                fixed-ceiling dataset. Narrower column here wraps 2x2. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: SP.lg }}>
              {dossier.ethoPillars.map(p => {
                const col = PILLAR_COLOR[p.name] ?? C.textSecondary
                return (
                  <div key={p.name} style={{ background: C.background, border: borderLine, borderRadius: R.control, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: col, fontWeight: FW.semibold, marginBottom: 4 }}>{p.name}</div>
                    <div style={{ ...monoCss, fontSize: FS.lg, fontWeight: FW.bold, color: C.textPrimary, lineHeight: 1 }}>{p.value}</div>
                    <div style={{ ...monoCss, fontSize: 10, color: C.textMuted, marginTop: 2 }}>/{p.max}</div>
                  </div>
                )
              })}
            </div>

            {/* Composition bar — segment width = each pillar's fixed
                structural ceiling (300/300/200/200), segment fill = how
                much of that ceiling was earned. Shows the real shape of
                the scoring model, not a naive score/1000 proportion. */}
            <div style={{ marginTop: SP.lg }}>
              <PillarCompositionBar
                segments={dossier.ethoPillars.map(p => ({ label: p.name, color: PILLAR_COLOR[p.name] ?? C.textSecondary, score: p.value, max: p.max }))}
              />
            </div>

            <div style={{ marginTop: SP.lg }}>
              {dossier.ethoPillars.map(p => (
                <EvidenceRow key={p.name} label={p.name} context={`/ ${p.max}`} score={p.value} color={PILLAR_COLOR[p.name] ?? C.textSecondary} rationale={p.humanNote} />
              ))}
            </div>
            <p style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted, marginTop: SP.md }}>Full pillar breakdown → EthoScore panel.</p>
          </div>
        </div>

        {/* ── Right: risk timeline + analyst note ── */}
        <div>

          {/* Risk timeline — kept essentially as-is (already list/rail-based,
              not boxed-per-item); only the outer card border is removed. */}
          <div>
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
          </div>

          {/* Signal breakdown */}
          <div style={{ borderTop: borderLine, marginTop: SP.xxl, paddingTop: SP.xxl }}>
            <p style={labelCss}>Signal Breakdown</p>
            <div style={{ marginTop: SP.lg }}>
              {dossier.signals.map((s, i) => (
                <EvidenceRow
                  key={i}
                  label={s.name}
                  score={s.score}
                  color={caseRiskColor(s.score)}
                  rationale={s.rationale}
                  right={<Badge tone={s.score >= 75 ? 'high' : s.score >= 50 ? 'medium' : 'low'}>{s.score >= 75 ? 'Review required' : s.score >= 50 ? 'Monitor' : 'Low priority'}</Badge>}
                />
              ))}
            </div>
          </div>

          {/* Risk intelligence summary — same accent-rule editorial
              treatment as Score's Analysis and Dashboard's case detail */}
          <div style={{ borderLeft: `2px solid ${C.accent}`, paddingLeft: SP.xl, marginTop: SP.xxl }}>
            <p style={labelCss}>Risk Intelligence</p>
            <p style={{ margin: '8px 0 0', fontSize: FS.md, lineHeight: 1.75, color: C.textPrimary }}>{dossier.aiSummary}</p>
          </div>

          {/* Add analyst note + actions (design-only, local state) — a
              form, not a content card: separated by a rule, not a box. */}
          <div style={{ borderTop: borderLine, marginTop: SP.xxl, paddingTop: SP.xxl }}>
            <p style={{ ...labelCss, marginBottom: SP.md }}>Add Analyst Note</p>
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
          </div>

          {/* Audit — same dark technical-record panel as Score/Dashboard's
              Audit sections, using data this dossier already has. Case
              didn't have an "instrument moment" device before. */}
          <div style={{ marginTop: SP.xxl }}>
            <p style={labelCss}>Audit</p>
            <div style={{ background: C.textPrimary, borderRadius: R.control, padding: SP.xl, marginTop: SP.md }}>
              <div style={{ ...monoCss, fontSize: 11.5, color: 'rgba(226,232,240,0.85)', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: SP.md }}>
                <div><span style={{ color: 'rgba(226,232,240,0.5)' }}>case: </span>{dossier.caseRef}</div>
                <div><span style={{ color: 'rgba(226,232,240,0.5)' }}>analyst: </span>{dossier.assignedTo}</div>
                <div><span style={{ color: 'rgba(226,232,240,0.5)' }}>jurisdiction: </span>{dossier.jurisdiction}</div>
                <div><span style={{ color: 'rgba(226,232,240,0.5)' }}>opened: </span>{new Date(dossier.openedAt).toLocaleString('en-GB')}</div>
              </div>
              <div style={{ marginTop: SP.md, paddingTop: SP.md, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc, flexShrink: 0 }} />
                <span style={{ fontSize: FS.sm, color: sc, fontWeight: FW.semibold }}>{dossier.severity.toUpperCase()} · {STATUS_LABEL[dossier.status].toUpperCase()}</span>
              </div>
            </div>
            <p style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted, marginTop: SP.md }}>DESIGN PREVIEW · ACTIONS NOT WIRED · FULL AUDIT TRAIL MAINTAINED IN PRODUCTION</p>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
