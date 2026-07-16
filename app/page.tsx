import Link from 'next/link'
import { Logo } from './components/Logo'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  googleFontsHref,
} from '../lib/design-system/tokens-light'

// Screen 4 — institutional entry screen (per the UX-1 brief). Replaces
// the previous B2C marketing landing (hero copy, "How it works", social
// proof stats, a testimonial). One sentence, one primary action — the
// design communicates the rest, per the brief's explicit instruction.
export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: SP.xxl }}>
      <link href={googleFontsHref} rel="stylesheet" />

      <div style={{ marginBottom: SP.xxxl }}>
        <Logo size="lg" />
      </div>

      <div style={{ fontFamily: F.sans, fontSize: FS.xs, fontWeight: FW.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.textSecondary, marginBottom: SP.xl, textAlign: 'center' }}>
        Financial Intelligence Infrastructure
      </div>

      <h1 style={{ fontFamily: F.sans, fontSize: FS.display, fontWeight: FW.semibold, letterSpacing: '-0.01em', textAlign: 'center', maxWidth: 560, lineHeight: 1.25, margin: `0 0 ${SP.xxxl}px` }}>
        Risk intelligence for lenders who need to explain every decision.
      </h1>

      <Link
        href="/login"
        style={{
          padding: '14px 40px', borderRadius: R.control, background: C.accent, color: '#fff',
          textDecoration: 'none', fontSize: FS.base, fontWeight: FW.medium, fontFamily: F.sans,
          marginBottom: SP.xl,
        }}
      >
        Access Platform
      </Link>

      <p style={{ fontSize: FS.sm, color: C.textSecondary, textAlign: 'center', margin: 0 }}>
        Evaluating EthosFi as an investor or partner?{' '}
        <a
          href="mailto:hello@ethosfai.com?subject=Demo%20request"
          style={{ color: C.accent, textDecoration: 'none' }}
        >
          Request a demo
        </a>
      </p>
    </div>
  )
}
