import Link from 'next/link'
import type { CSSProperties } from 'react'
import { Logo } from './components/Logo'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  borderLine,
  googleFontsHref,
} from '../lib/design-system/tokens-light'

// Institutional marketing landing — layout structure modeled on
// Fortress's own landing page (fortress-shadcn.dashboardpack.com) as a
// visual-quality REFERENCE, not a template. Rebuilt entirely on
// EthosFi's tokens and content.
//
// v3 — strategic repositioning (approved IA, see conversation): the
// page now leads with "EthosFi = intelligence infrastructure for
// explainable, auditable AI lending decisions," not "EthosFi = a
// scoring product." Answers three questions in order: what is it
// (hero) → what does it do (pipeline) → how does it fit into a lending
// stack (API panel). EthoScore is demoted out of the hero — the
// dominant visual there was previously a score+ring, which reads as
// "scoring product" regardless of surrounding copy. It now appears
// only as one inline artifact inside the pipeline mechanism, not as
// the page's primary visual.
//
// Copy is sourced from EthosFi's actual documented capabilities
// (README, CLAUDE.md, docs/openapi.yaml, EU AI Act notes) — nothing
// here is a speculative feature claim. The API panel below uses real
// route paths/scopes from docs/openapi.yaml (POST /api/v1/applications,
// GET /api/v1/applications/{id}/audit) and real ScoreResult field names
// (app/score/[id]/page.tsx) — not an invented example.

const AUDIT_LOG = [
  { event: 'ethoscore_assessed', ref: 'app-2201', detail: 'model: ethoscore-v2 · outcome: approve' },
  { event: 'case_escalated', ref: 'inv-1047', detail: 'severity: critical · sla: 4h' },
  { event: 'decision_recorded', ref: 'app-2201', detail: 'reviewer: analyst · audit: complete' },
]

const PIPELINE = [
  { n: '01', title: 'Application', body: 'Alternative-data intake — rent history, gig income, savings behaviour — for borrowers thin-file bureaus miss.' },
  { n: '02', title: 'EthoScore', body: 'A 4-pillar structured score (0–1000) with a plain-language rationale attached to every factor. No score enters a decision without one.', artifact: true },
  { n: '03', title: 'Case (if flagged)', body: 'Risk signals ranked by severity, SLA-tracked review, assigned to an analyst — a working file, not a queue entry.' },
  { n: '04', title: 'Decision', body: 'Logged as an immutable event — model, factors, reviewer, outcome — the record a regulator can be handed directly.' },
]

const PROOF_POINTS = [
  { value: '5', label: 'Explained factors / decision' },
  { value: '100%', label: 'Decisions with audit trail' },
  { value: '<30d', label: 'Article 22 review window' },
  { value: '0', label: 'Black-box scores issued' },
]

const API_RESPONSE = `POST /api/v1/applications
Authorization: Bearer sk_live_•••• · scope: applications:write

→ 201 Created
{
  "data": {
    "application": { "id": "app-2201", "status": "scored" },
    "score": {
      "etho_score": 780,
      "risk_band": "low",
      "recommendation": "approve",
      "model_version": "ethoscore-v2",
      "factors": [ /* 5 explained factors */ ]
    }
  }
}

GET /api/v1/applications/app-2201/audit
Authorization: Bearer sk_live_•••• · scope: audit_events:read

→ 200 OK
{ "data": { "events": [ /* full workflow_events history */ ] } }`

const navLinkCss: CSSProperties = {
  fontSize: FS.sm, color: C.textSecondary, textDecoration: 'none', fontFamily: F.sans,
}
const labelCss: CSSProperties = {
  fontSize: FS.xs, fontWeight: FW.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted,
}
const monoCss: CSSProperties = { fontFamily: F.mono, fontVariantNumeric: 'tabular-nums' }

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans }}>
      <link href={googleFontsHref} rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        .ethos-nav-link:hover { color: ${C.textPrimary} !important; }
        .ethos-pipe-step:hover { border-color: ${C.textSecondary} !important; }
        .ethos-cta-primary:hover { background: ${C.accentHover} !important; }
        @keyframes ethosFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: no-preference) {
          .ethos-reveal { animation: ethosFadeUp .5s ease both; }
          .ethos-reveal-1 { animation-delay: .05s; }
          .ethos-reveal-2 { animation-delay: .12s; }
          .ethos-reveal-3 { animation-delay: .19s; }
          .ethos-reveal-4 { animation-delay: .26s; }
        }
      `}</style>

      {/* ── Status strip ── */}
      <div style={{ borderBottom: borderLine, background: C.surface }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '7px 24px', display: 'flex', gap: SP.lg, flexWrap: 'wrap' }}>
          <span style={{ ...monoCss, fontSize: 10, color: C.textMuted, letterSpacing: '0.04em' }}>
            SYSTEM: <span style={{ color: C.riskLow }}>OPERATIONAL</span>
          </span>
          <span style={{ ...monoCss, fontSize: 10, color: C.textMuted, letterSpacing: '0.04em' }}>SCORING ENGINE: ETHOSCORE-V2</span>
          <span style={{ ...monoCss, fontSize: 10, color: C.textMuted, letterSpacing: '0.04em' }}>EU AI ACT: COMPLIANT</span>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${SP.lg}px ${SP.xxl}px`, maxWidth: 1180, margin: '0 auto' }}>
        <Logo size="sm" />
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.xl }}>
          <a href="#pipeline" className="ethos-nav-link" style={navLinkCss}>Platform</a>
          <a href="#integration" className="ethos-nav-link" style={navLinkCss}>Integration</a>
          <Link href="/apply" className="ethos-nav-link" style={navLinkCss}>Borrower experience</Link>
          <Link
            href="/login"
            style={{ padding: '9px 18px', borderRadius: R.control, border: borderLine, color: C.textPrimary, textDecoration: 'none', fontSize: FS.sm, fontWeight: FW.medium }}
          >
            Access Platform
          </Link>
        </div>
      </nav>

      {/* ── Hero — "What is EthosFi?" ── */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: `${SP.xxxl}px ${SP.xxl}px ${SP.xxl}px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: SP.xxxl, alignItems: 'center' }}>
          <div>
            <p style={{ ...labelCss, color: C.accent, marginBottom: SP.lg }}>
              Decision Intelligence Infrastructure
            </p>

            <h1 style={{ fontFamily: F.sans, fontSize: 44, fontWeight: FW.bold, letterSpacing: '-0.02em', lineHeight: 1.15, margin: `0 0 ${SP.xl}px` }}>
              Infrastructure for <span style={{ fontFamily: F.display, fontStyle: 'italic', fontWeight: FW.medium }}>explainable, auditable</span> AI lending decisions.
            </h1>

            <p style={{ fontSize: FS.md, color: C.textSecondary, lineHeight: 1.6, maxWidth: 480, margin: `0 0 ${SP.xxl}px` }}>
              Every score, flag, and decline is evidence — traceable to a model, a factor set, and a rationale. Not a black box.
            </p>

            <div style={{ display: 'flex', gap: SP.md, flexWrap: 'wrap', marginBottom: SP.lg }}>
              <Link
                href="/login"
                className="ethos-cta-primary"
                style={{ padding: '13px 28px', borderRadius: R.control, background: C.accent, color: '#fff', textDecoration: 'none', fontSize: FS.base, fontWeight: FW.medium, transition: 'background .15s' }}
              >
                Access Platform
              </Link>
              <Link
                href="/apply"
                style={{ padding: '13px 28px', borderRadius: R.control, border: borderLine, color: C.textPrimary, textDecoration: 'none', fontSize: FS.base, fontWeight: FW.medium }}
              >
                See the borrower experience
              </Link>
            </div>

            <p style={{ fontSize: FS.sm, color: C.textMuted, margin: 0 }}>
              Evaluating EthosFi as an investor or partner?{' '}
              <a href="mailto:hello@ethosfi.co?subject=Demo%20request" style={{ color: C.accent, textDecoration: 'none' }}>Request a demo</a>
            </p>
          </div>

          {/* Audit-log strip — replaces a score panel as the hero's product
              artifact. Communicates "records and audits decisions" on
              sight, not "computes scores." */}
          <div style={{ background: C.background, border: borderLine, borderRadius: R.control, padding: SP.xl, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.lg, paddingBottom: SP.md, borderBottom: borderLine }}>
              <span style={{ ...monoCss, fontSize: 10, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase' }}>workflow_events · live</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.riskLow, flexShrink: 0 }} />
            </div>
            {AUDIT_LOG.map(e => (
              <div key={e.ref + e.event} style={{ marginBottom: 12, fontSize: 12 }}>
                <div style={{ ...monoCss, color: C.textPrimary }}>
                  <span style={{ color: C.accent }}>{e.event}</span>
                  <span style={{ color: C.textMuted }}> · {e.ref}</span>
                </div>
                <div style={{ ...monoCss, fontSize: 11, color: C.textSecondary, marginTop: 2 }}>{e.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pipeline — "What does it actually do?" ── */}
      <section id="pipeline" style={{ borderTop: borderLine, borderBottom: borderLine, background: C.surface }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: `${SP.xxxl}px ${SP.xxl}px` }}>
          <p style={{ ...labelCss, color: C.accent, marginBottom: SP.sm }}>Platform</p>
          <h2 style={{ fontFamily: F.sans, fontSize: FS.xl, fontWeight: FW.bold, letterSpacing: '-0.01em', margin: `0 0 ${SP.xxxl}px`, maxWidth: 560 }}>
            Turns an AI lending decision into explainable, auditable evidence
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: SP.lg, marginBottom: SP.xxxl }}>
            {PIPELINE.map((step, i) => (
              <div key={step.n} className={`ethos-pipe-step ethos-reveal ethos-reveal-${i + 1}`} style={{ background: C.background, border: borderLine, borderRadius: R.control, padding: SP.lg, transition: 'border-color .15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.md }}>
                  <span style={{ ...monoCss, fontSize: FS.xs, color: C.textMuted }}>{step.n}</span>
                  {i < PIPELINE.length - 1 && <span style={{ color: C.border, fontSize: FS.sm }}>→</span>}
                </div>
                <h3 style={{ fontSize: FS.base, fontWeight: FW.semibold, margin: `0 0 6px` }}>{step.title}</h3>
                <p style={{ fontSize: FS.xs, color: C.textSecondary, lineHeight: 1.55, margin: step.artifact ? `0 0 ${SP.sm}px` : 0 }}>{step.body}</p>
                {step.artifact && (
                  <div style={{ borderTop: borderLine, paddingTop: SP.sm, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ ...monoCss, fontSize: 18, fontWeight: FW.bold, color: C.riskLow }}>780</span>
                    <span style={{ fontSize: 10, color: C.textMuted }}>/ 1000 · example evidence record</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', borderTop: borderLine, paddingTop: SP.xl }}>
            {PROOF_POINTS.map((s, i) => (
              <div key={s.label} style={{ flex: 1, padding: `0 ${SP.lg}px`, borderLeft: i > 0 ? borderLine : 'none' }}>
                <div style={{ ...monoCss, fontSize: 22, fontWeight: FW.semibold, color: C.textPrimary, lineHeight: 1, marginBottom: 6 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Integration — "How does it fit into a lending stack?" ── */}
      <section id="integration" style={{ maxWidth: 1180, margin: '0 auto', padding: `${SP.xxxl}px ${SP.xxl}px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: SP.xxxl, alignItems: 'start' }}>
          <div>
            <p style={{ ...labelCss, color: C.accent, marginBottom: SP.sm }}>Integration</p>
            <h2 style={{ fontFamily: F.sans, fontSize: FS.xl, fontWeight: FW.bold, letterSpacing: '-0.01em', margin: `0 0 ${SP.lg}px` }}>
              API-first, not a replacement
            </h2>
            <p style={{ fontSize: FS.base, color: C.textSecondary, lineHeight: 1.65, margin: `0 0 ${SP.xl}px` }}>
              EthosFi sits alongside your existing loan origination stack — LoanPro or otherwise — as a decision intelligence layer: scoped API keys, HMAC-signed webhooks, and a queryable event feed for every decision made.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: SP.sm }}>
              {['Scoped Partner API keys (read/write per resource)', 'HMAC-signed webhooks with retry + delivery headers', 'Article 22 human-review path on every automated outcome'].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: FS.sm, color: C.textPrimary }}>
                  <span style={{ ...monoCss, color: C.textMuted, fontSize: FS.xs }}>—</span>
                  {t}
                </div>
              ))}
            </div>
          </div>

          <div className="ethos-reveal ethos-reveal-2" style={{ background: C.textPrimary, borderRadius: R.control, padding: SP.xl, overflowX: 'auto' }}>
            <pre style={{ margin: 0, ...monoCss, fontSize: 11.5, lineHeight: 1.7, color: '#E2E8F0', whiteSpace: 'pre' }}>
              {API_RESPONSE.split('\n').map((line, i) => (
                <div key={i} style={{
                  color: line.startsWith('→') ? '#60A5FA'
                    : line.startsWith('POST') || line.startsWith('GET') ? '#F8FAFC'
                    : line.startsWith('Authorization') ? 'rgba(226,232,240,0.45)'
                    : 'rgba(226,232,240,0.85)',
                  fontWeight: line.startsWith('POST') || line.startsWith('GET') ? FW.semibold : FW.regular,
                }}>
                  {line || ' '}
                </div>
              ))}
            </pre>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section style={{ borderTop: borderLine, maxWidth: 720, margin: '0 auto', padding: `${SP.xxxl}px ${SP.xxl}px`, textAlign: 'center' }}>
        <h2 style={{ fontFamily: F.sans, fontSize: FS.xl, fontWeight: FW.bold, letterSpacing: '-0.01em', margin: `0 0 ${SP.md}px` }}>
          Integrate it, or see it on a real application.
        </h2>
        <p style={{ fontSize: FS.base, color: C.textSecondary, lineHeight: 1.6, margin: `0 0 ${SP.xl}px` }}>
          Walk through the borrower flow, or step straight into the lender platform.
        </p>
        <div style={{ display: 'flex', gap: SP.md, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/login"
            className="ethos-cta-primary"
            style={{ padding: '13px 28px', borderRadius: R.control, background: C.accent, color: '#fff', textDecoration: 'none', fontSize: FS.base, fontWeight: FW.medium, transition: 'background .15s' }}
          >
            Access Platform
          </Link>
          <Link
            href="/apply"
            style={{ padding: '13px 28px', borderRadius: R.control, border: borderLine, color: C.textPrimary, textDecoration: 'none', fontSize: FS.base, fontWeight: FW.medium }}
          >
            See the borrower experience
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: borderLine }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: `${SP.xl}px ${SP.xxl}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: SP.md }}>
          <Logo size="sm" />
          <span style={{ fontSize: FS.xs, color: C.textMuted }}>
            © {new Date().getFullYear()} EthosFi ·{' '}
            <a href="mailto:hello@ethosfi.co?subject=Demo%20request" style={{ color: C.textMuted }}>hello@ethosfi.co</a>
          </span>
        </div>
      </footer>
    </div>
  )
}
