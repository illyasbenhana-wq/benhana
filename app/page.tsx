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
  shadowMd,
  googleFontsHref,
} from '../lib/design-system/tokens-light'

// Institutional marketing landing — layout structure (nav, hero, data
// strip, capabilities, compliance, closing CTA) modeled on Fortress's
// own landing page (fortress-shadcn.dashboardpack.com) as a reference,
// rebuilt entirely on EthosFi's tokens and content. Copy is sourced
// from EthosFi's actual documented capabilities (README, EU AI Act
// compliance notes, /score's Article 22 notice) — no invented claims.
//
// Refinement pass (v2): the first pass read as generic-SaaS —
// rounded pill badges, a full serif headline, hover-lift glow cards.
// This pass pulls back to something more institutional: Fraunces is
// now a single accent touch (one word), not the headline voice; the
// hero carries an actual EthoScore panel so the product is visually
// present, not just claimed; stats are a thin bordered data strip
// (terminal-like) instead of big centered SaaS numbers; capabilities
// are a numbered list, not hover-glow cards; compliance markers are
// thin-bordered tags, not colored pill badges.

const DATA_STRIP = [
  { value: '5', label: 'Explained factors / decision' },
  { value: '100%', label: 'Decisions with audit trail' },
  { value: '<30d', label: 'Article 22 review window' },
  { value: '0', label: 'Black-box scores issued' },
]

const CAPABILITIES = [
  {
    n: '01',
    title: 'EthoScore™',
    body: 'Alternative-data credit scoring for borrowers thin-file bureaus miss — rent history, gig income, savings behaviour — reduced to one explained score with a plain-language rationale for every factor.',
  },
  {
    n: '02',
    title: 'Case investigation',
    body: 'Every flagged entity gets a working case: risk signals ranked by severity, SLA-tracked review, and an audit-logged decision trail your compliance team can hand to a regulator without translation.',
  },
  {
    n: '03',
    title: 'Explainability by design',
    body: 'No factor enters a decision without a rationale attached. The AI assessment a borrower sees is the same one your analysts see — nothing is summarized away between the model and the file.',
  },
  {
    n: '04',
    title: 'Built for oversight',
    body: 'Role-based access, full decision history, and a human-review path on every automated outcome — the infrastructure a lender needs before an AI system touches a real applicant.',
  },
]

const SAMPLE_FACTORS = [
  { name: 'Rent payment consistency', score: 92 },
  { name: 'Income stability', score: 81 },
  { name: 'Savings buffer', score: 74 },
]

const navLinkCss: CSSProperties = {
  fontSize: FS.sm, color: C.textSecondary, textDecoration: 'none', fontFamily: F.sans,
}
const labelCss: CSSProperties = {
  fontSize: FS.xs, fontWeight: FW.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textMuted,
}

// A real product surface, not a decorative illustration — the same
// score ring / factor-bar visual language as app/score/[id]/page.tsx,
// so a visitor sees the actual EthoScore output, not an abstraction.
function EthoScorePanel() {
  const score = 780
  const max = 1000
  const pct = (score / max) * 100
  const r = 46
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - pct / 100)

  return (
    <div style={{ background: C.background, border: borderLine, borderRadius: R.control, boxShadow: shadowMd, padding: SP.xl, width: '100%', maxWidth: 340 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP.lg, paddingBottom: SP.md, borderBottom: borderLine }}>
        <span style={labelCss}>EthoScore™ output</span>
        <span style={{ fontSize: 10, color: C.textMuted, border: borderLine, borderRadius: 3, padding: '2px 6px' }}>Sample</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: SP.lg, marginBottom: SP.lg }}>
        <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
          <svg viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r={r} fill="none" stroke={C.border} strokeWidth="6" />
            <circle cx="50" cy="50" r={r} fill="none" stroke={C.riskLow} strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="butt" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: FW.bold, color: C.riskLow, fontFamily: F.mono, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: 9, color: C.textMuted }}>/ {max}</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: FS.sm, fontWeight: FW.semibold, color: C.riskLow, marginBottom: 4 }}>Low risk</div>
          <div style={{ fontSize: FS.xs, color: C.textSecondary, lineHeight: 1.5 }}>Recommendation: Approve</div>
        </div>
      </div>

      <div>
        {SAMPLE_FACTORS.map(f => (
          <div key={f.name} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.textSecondary, marginBottom: 3 }}>
              <span>{f.name}</span>
              <span style={{ fontFamily: F.mono, color: C.textPrimary }}>{f.score}</span>
            </div>
            <div style={{ height: 3, background: C.border, borderRadius: 0, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${f.score}%`, background: C.riskLow }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans }}>
      <link href={googleFontsHref} rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        .ethos-nav-link:hover { color: ${C.textPrimary} !important; }
        .ethos-cap-row:hover { border-color: ${C.textSecondary} !important; }
        .ethos-cta-primary:hover { background: ${C.accentHover} !important; }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${SP.lg}px ${SP.xxl}px`, maxWidth: 1180, margin: '0 auto' }}>
        <Logo size="sm" />
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.xl }}>
          <a href="#capabilities" className="ethos-nav-link" style={navLinkCss}>Platform</a>
          <a href="#compliance" className="ethos-nav-link" style={navLinkCss}>Compliance</a>
          <Link href="/apply" className="ethos-nav-link" style={navLinkCss}>Borrower experience</Link>
          <Link
            href="/login"
            style={{ padding: '9px 18px', borderRadius: R.control, border: borderLine, color: C.textPrimary, textDecoration: 'none', fontSize: FS.sm, fontWeight: FW.medium }}
          >
            Access Platform
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1180, margin: '0 auto', padding: `${SP.xxxl}px ${SP.xxl}px ${SP.xxl}px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: SP.xxxl, alignItems: 'center' }}>
          <div>
            <p style={{ ...labelCss, color: C.accent, marginBottom: SP.lg }}>
              AI-powered risk &amp; underwriting intelligence for lending platforms
            </p>

            <h1 style={{ fontFamily: F.sans, fontSize: 46, fontWeight: FW.bold, letterSpacing: '-0.02em', lineHeight: 1.15, margin: `0 0 ${SP.xl}px` }}>
              Explain <span style={{ fontFamily: F.display, fontStyle: 'italic', fontWeight: FW.medium }}>every</span> lending decision your AI makes.
            </h1>

            <p style={{ fontSize: FS.md, color: C.textSecondary, lineHeight: 1.6, maxWidth: 480, margin: `0 0 ${SP.xxl}px` }}>
              Alternative credit scoring for underserved borrowers — built so every score, every flag, and every decline carries a rationale a regulator, a lender, and the borrower themselves can all read.
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

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <EthoScorePanel />
          </div>
        </div>
      </section>

      {/* ── Data strip ── */}
      <section style={{ borderTop: borderLine, borderBottom: borderLine }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: `${SP.lg}px ${SP.xxl}px`, display: 'flex' }}>
          {DATA_STRIP.map((s, i) => (
            <div key={s.label} style={{ flex: 1, padding: `0 ${SP.lg}px`, borderLeft: i > 0 ? borderLine : 'none' }}>
              <div style={{ fontFamily: F.mono, fontSize: 24, fontWeight: FW.semibold, color: C.textPrimary, lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Capabilities ── */}
      <section id="capabilities" style={{ maxWidth: 900, margin: '0 auto', padding: `${SP.xxxl}px ${SP.xxl}px` }}>
        <p style={{ ...labelCss, color: C.accent, marginBottom: SP.sm }}>Platform</p>
        <h2 style={{ fontFamily: F.sans, fontSize: FS.xl, fontWeight: FW.bold, letterSpacing: '-0.01em', margin: `0 0 ${SP.xxxl}px`, maxWidth: 520 }}>
          One system, from application to decision
        </h2>

        <div>
          {CAPABILITIES.map(f => (
            <div key={f.n} className="ethos-cap-row" style={{ display: 'flex', gap: SP.xl, padding: `${SP.xl}px 0`, borderTop: borderLine, transition: 'border-color .15s' }}>
              <div style={{ fontFamily: F.mono, fontSize: FS.sm, color: C.textMuted, flexShrink: 0, width: 28, paddingTop: 2 }}>{f.n}</div>
              <div>
                <h3 style={{ fontSize: FS.lg, fontWeight: FW.semibold, margin: `0 0 6px` }}>{f.title}</h3>
                <p style={{ fontSize: FS.base, color: C.textSecondary, lineHeight: 1.6, margin: 0, maxWidth: 620 }}>{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Compliance / trust section ── */}
      <section id="compliance" style={{ background: C.surface, borderTop: borderLine, borderBottom: borderLine }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: `${SP.xxxl}px ${SP.xxl}px` }}>
          <p style={{ ...labelCss, color: C.accent, marginBottom: SP.sm }}>Compliance</p>
          <h2 style={{ fontFamily: F.sans, fontSize: FS.xl, fontWeight: FW.bold, letterSpacing: '-0.01em', margin: `0 0 ${SP.lg}px`, maxWidth: 520 }}>
            Built for EU AI Act, from the ground up
          </h2>
          <p style={{ fontSize: FS.base, color: C.textSecondary, lineHeight: 1.65, maxWidth: 640, margin: `0 0 ${SP.xl}px` }}>
            Every automated decision is explained with 5 factors and a plain-language rationale. Borrowers are informed of their Article 22 right to human review. Every case, every score, and every AI prompt/response is retained in a full audit trail — not reconstructed after the fact.
          </p>
          <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', border: borderLine, borderRadius: R.control, overflow: 'hidden', width: 'fit-content' }}>
            {['Article 22 human review', 'Full audit trail', 'Explainability by design'].map((t, i) => (
              <div key={t} style={{ fontSize: FS.sm, color: C.textPrimary, padding: '10px 18px', borderLeft: i > 0 ? borderLine : 'none', background: C.background }}>
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: `${SP.xxxl}px ${SP.xxl}px`, textAlign: 'center' }}>
        <h2 style={{ fontFamily: F.sans, fontSize: FS.xl, fontWeight: FW.bold, letterSpacing: '-0.01em', margin: `0 0 ${SP.md}px` }}>
          See it on a real application.
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
