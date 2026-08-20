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
  shadowLg,
  googleFontsHref,
} from '../lib/design-system/tokens-light'

// Institutional marketing landing — visual structure (nav, hero, stats
// row, feature grid, trust/compliance section, closing CTA) modeled on
// Fortress's own landing page (fortress-shadcn.dashboardpack.com) as a
// layout reference, rebuilt entirely on EthosFi's design tokens with
// EthosFi's own content. Copy is sourced from EthosFi's actual
// capabilities (README, EU AI Act compliance notes, /score's Article 22
// notice) — nothing here is a speculative feature claim. Replaces the
// deliberately minimal "Screen 4" entry screen (see git history) per an
// explicit second design pass: a new visitor should read this page and
// perceive an institutional risk/underwriting platform, not a form.

const STATS = [
  { value: '5', label: 'Explained factors per decision' },
  { value: '100%', label: 'Decisions with audit trail' },
  { value: '<30 days', label: 'Article 22 human-review window' },
  { value: '0', label: 'Black-box scores issued' },
]

const FEATURES = [
  {
    title: 'EthoScore™',
    body: 'Alternative-data credit scoring for borrowers thin-file bureaus miss — rent history, gig income, savings behaviour — reduced to one explained score with a plain-language rationale for every factor.',
  },
  {
    title: 'Case investigation',
    body: 'Every flagged entity gets a working case: risk signals ranked by severity, SLA-tracked review, and an audit-logged decision trail your compliance team can hand to a regulator without translation.',
  },
  {
    title: 'Explainability by design',
    body: 'No factor enters a decision without a rationale attached. The AI assessment a borrower sees is the same one your analysts see — nothing is summarized away between the model and the file.',
  },
  {
    title: 'Built for oversight',
    body: 'Role-based access, full decision history, and a human-review path on every automated outcome — the infrastructure a lender needs before an AI system touches a real applicant.',
  },
]

const navLinkCss: CSSProperties = {
  fontSize: FS.sm, color: C.textSecondary, textDecoration: 'none', fontFamily: F.sans,
}

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans }}>
      <link href={googleFontsHref} rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; }
        .ethos-nav-link:hover { color: ${C.textPrimary} !important; }
        .ethos-feature-card { transition: box-shadow .2s ease, transform .2s ease; }
        .ethos-feature-card:hover { box-shadow: ${shadowLg}; transform: translateY(-2px); }
        .ethos-cta-primary:hover { background: ${C.accentHover} !important; }
      `}</style>

      {/* ── Nav ── */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${SP.lg}px ${SP.xxl}px`, maxWidth: 1180, margin: '0 auto' }}>
        <Logo size="sm" />
        <div style={{ display: 'flex', alignItems: 'center', gap: SP.xl }}>
          <a href="#platform" className="ethos-nav-link" style={navLinkCss}>Platform</a>
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
      <section style={{ maxWidth: 800, margin: '0 auto', padding: `${SP.huge}px ${SP.xxl}px ${SP.xxxl}px`, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.accentSubtle, border: `1px solid ${C.accent}33`, borderRadius: 20, padding: '5px 14px', marginBottom: SP.xxl }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent }} />
          <span style={{ fontSize: FS.xs, fontWeight: FW.semibold, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accentHover }}>Financial Intelligence Infrastructure</span>
        </div>

        <h1 style={{ fontFamily: F.display, fontSize: 56, fontWeight: FW.medium, letterSpacing: '-0.02em', lineHeight: 1.08, margin: `0 0 ${SP.xl}px` }}>
          Risk intelligence for lenders who need to explain every decision.
        </h1>

        <p style={{ fontSize: FS.md, color: C.textSecondary, lineHeight: 1.6, maxWidth: 560, margin: `0 auto ${SP.xxl}px` }}>
          Alternative credit scoring for underserved borrowers — built so every score, every flag, and every decline carries a rationale a regulator, a lender, and the borrower themselves can all read.
        </p>

        <div style={{ display: 'flex', gap: SP.md, justifyContent: 'center', flexWrap: 'wrap', marginBottom: SP.lg }}>
          <Link
            href="/login"
            className="ethos-cta-primary"
            style={{ padding: '14px 32px', borderRadius: R.control, background: C.accent, color: '#fff', textDecoration: 'none', fontSize: FS.base, fontWeight: FW.medium, boxShadow: shadowMd, transition: 'background .15s' }}
          >
            Access Platform
          </Link>
          <Link
            href="/apply"
            style={{ padding: '14px 32px', borderRadius: R.control, border: borderLine, color: C.textPrimary, textDecoration: 'none', fontSize: FS.base, fontWeight: FW.medium }}
          >
            See the borrower experience
          </Link>
        </div>

        <p style={{ fontSize: FS.sm, color: C.textMuted, margin: 0 }}>
          Evaluating EthosFi as an investor or partner?{' '}
          <a href="mailto:hello@ethosfi.co?subject=Demo%20request" style={{ color: C.accent, textDecoration: 'none' }}>Request a demo</a>
        </p>
      </section>

      {/* ── Stats row ── */}
      <section style={{ borderTop: borderLine, borderBottom: borderLine, background: C.surface }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: `${SP.xxl}px ${SP.xxl}px`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: SP.xl }}>
          {STATS.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: F.display, fontSize: 40, fontWeight: FW.medium, color: C.accent, lineHeight: 1, marginBottom: 8 }}>{s.value}</div>
              <div style={{ fontSize: FS.sm, color: C.textSecondary, lineHeight: 1.4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Feature grid ── */}
      <section id="platform" style={{ maxWidth: 1180, margin: '0 auto', padding: `${SP.huge}px ${SP.xxl}px` }}>
        <div style={{ textAlign: 'center', maxWidth: 620, margin: `0 auto ${SP.xxxl}px` }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, marginBottom: SP.md }}>Platform</div>
          <h2 style={{ fontFamily: F.display, fontSize: FS.xl, fontWeight: FW.medium, letterSpacing: '-0.01em', margin: `0 0 ${SP.md}px` }}>
            One system, from application to decision
          </h2>
          <p style={{ fontSize: FS.base, color: C.textSecondary, lineHeight: 1.6, margin: 0 }}>
            The same infrastructure scores a first-time borrower and investigates a flagged institutional entity — every output built to be read by a human, not just trusted on faith.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: SP.lg }}>
          {FEATURES.map(f => (
            <div key={f.title} className="ethos-feature-card" style={{ background: C.background, border: borderLine, borderRadius: R.card, boxShadow: shadowMd, padding: `${SP.xl}px ${SP.xl}px` }}>
              <h3 style={{ fontSize: FS.lg, fontWeight: FW.semibold, margin: `0 0 ${SP.sm}px` }}>{f.title}</h3>
              <p style={{ fontSize: FS.base, color: C.textSecondary, lineHeight: 1.6, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Compliance / trust section ── */}
      <section id="compliance" style={{ background: C.surface, borderTop: borderLine, borderBottom: borderLine }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: `${SP.xxxl}px ${SP.xxl}px`, textAlign: 'center' }}>
          <div style={{ fontSize: FS.xs, fontWeight: FW.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.accent, marginBottom: SP.md }}>Compliance</div>
          <h2 style={{ fontFamily: F.display, fontSize: FS.xl, fontWeight: FW.medium, letterSpacing: '-0.01em', margin: `0 0 ${SP.lg}px` }}>
            Built for EU AI Act, from the ground up
          </h2>
          <p style={{ fontSize: FS.base, color: C.textSecondary, lineHeight: 1.65, maxWidth: 640, margin: `0 auto ${SP.xxl}px` }}>
            Every automated decision is explained with 5 factors and a plain-language rationale. Borrowers are informed of their Article 22 right to human review. Every case, every score, and every AI prompt/response is retained in a full audit trail — not reconstructed after the fact.
          </p>
          <div style={{ display: 'flex', gap: SP.lg, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Article 22 human review', 'Full audit trail', 'Explainability by design'].map(t => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.background, border: borderLine, borderRadius: 20, padding: '8px 16px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.riskLow, flexShrink: 0 }} />
                <span style={{ fontSize: FS.sm, color: C.textPrimary }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: `${SP.huge}px ${SP.xxl}px`, textAlign: 'center' }}>
        <h2 style={{ fontFamily: F.display, fontSize: FS.xl, fontWeight: FW.medium, letterSpacing: '-0.01em', margin: `0 0 ${SP.md}px` }}>
          See it on a real application.
        </h2>
        <p style={{ fontSize: FS.base, color: C.textSecondary, lineHeight: 1.6, margin: `0 0 ${SP.xl}px` }}>
          Walk through the borrower flow, or step straight into the lender platform.
        </p>
        <div style={{ display: 'flex', gap: SP.md, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/login"
            className="ethos-cta-primary"
            style={{ padding: '14px 32px', borderRadius: R.control, background: C.accent, color: '#fff', textDecoration: 'none', fontSize: FS.base, fontWeight: FW.medium, boxShadow: shadowMd, transition: 'background .15s' }}
          >
            Access Platform
          </Link>
          <Link
            href="/apply"
            style={{ padding: '14px 32px', borderRadius: R.control, border: borderLine, color: C.textPrimary, textDecoration: 'none', fontSize: FS.base, fontWeight: FW.medium }}
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
