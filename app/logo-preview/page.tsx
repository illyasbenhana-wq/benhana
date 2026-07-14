'use client'
/**
 * EthosFi — Logo proposal comparison (TEMPORARY, preview-only)
 * ------------------------------------------------------------------
 * Side-by-side comparison of the three Logo.tsx wordmark variants, so a
 * direction can be chosen before the other variants are deleted from
 * Logo.tsx and this page is removed entirely. Gated behind
 * isPreviewDeployment() — not reachable outside a Vercel preview
 * deployment of a branch with NEXT_PUBLIC_PREVIEW_BYPASS set.
 */
import { redirect } from 'next/navigation'
import { isPreviewDeployment } from '../../lib/preview-bypass'
import { Logo, LogoVariant, LogoSize } from '../components/Logo'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  borderLine,
  shadowSm,
  googleFontsHref,
} from '../../lib/design-system/tokens-light'

const PROPOSALS: { variant: LogoVariant; title: string; note: string }[] = [
  {
    variant: 'mark',
    title: 'Proposal 1 — Mark + Wordmark',
    note: 'Sharp-edged accent square with a precision notch, beside the wordmark. Most similar to the original signature-gauge visual language.',
  },
  {
    variant: 'weight',
    title: 'Proposal 2 — Weight Contrast, No Mark',
    note: 'Pure typography: "ETHOS" bold, "FI" regular in accent blue. Confidence from type alone — closest to the Ramp reference.',
  },
  {
    variant: 'rule',
    title: 'Proposal 3 — Rule-Flanked Wordmark',
    note: 'Single accent bar, wide-tracked monochrome caps. Restrained, terminal/infrastructure feel.',
  },
]

const SIZES: { size: LogoSize; label: string }[] = [
  { size: 'sm', label: 'Small (nav bar)' },
  { size: 'md', label: 'Medium (header)' },
  { size: 'lg', label: 'Large (login / entry screen)' },
]

export default function LogoPreviewPage() {
  if (!isPreviewDeployment()) {
    redirect('/dashboard')
  }

  const labelCss: React.CSSProperties = {
    fontFamily: F.sans, fontSize: FS.micro, fontWeight: FW.semibold,
    letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textSecondary,
  }
  const cardCss: React.CSSProperties = {
    background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm,
  }

  return (
    <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans, padding: `${SP.xxl}px ${SP.xxxl}px` }}>
      <link href={googleFontsHref} rel="stylesheet" />

      <div style={{ marginBottom: SP.xxl }}>
        <div style={{ ...labelCss, marginBottom: SP.sm }}>Design Review — Temporary Page</div>
        <h1 style={{ margin: 0, fontSize: FS.display, fontWeight: FW.semibold, letterSpacing: '-0.01em' }}>Logo Proposals</h1>
        <p style={{ margin: `${SP.sm}px 0 0`, fontSize: FS.base, color: C.textSecondary, maxWidth: 640, lineHeight: 1.6 }}>
          Three wordmark directions, each at three sizes. All built on the same
          tokens-light.ts values (Inter, accent blue, no gradients). Pick one —
          the other two variants get deleted from Logo.tsx along with this page.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SP.xl }}>
        {PROPOSALS.map(p => (
          <section key={p.variant} style={{ ...cardCss, padding: SP.xl }}>
            <div style={{ marginBottom: SP.lg }}>
              <div style={{ fontSize: FS.lg, fontWeight: FW.semibold, marginBottom: 4 }}>{p.title}</div>
              <div style={{ fontSize: FS.sm, color: C.textSecondary, maxWidth: 620, lineHeight: 1.55 }}>{p.note}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: SP.xxxl, flexWrap: 'wrap' }}>
              {SIZES.map(({ size, label }) => (
                <div key={size} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: SP.sm }}>
                  <div style={{ ...labelCss }}>{label}</div>
                  <div style={{ padding: `${SP.md}px ${SP.lg}px`, background: C.background, border: borderLine, borderRadius: R.data, display: 'flex', alignItems: 'center' }}>
                    <Logo variant={p.variant} size={size} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p style={{ marginTop: SP.xl, fontSize: FS.xs, color: C.textMuted, maxWidth: 640, lineHeight: 1.6 }}>
        Note: Logo.tsx renders tokens-light colors only (dark navy text) — it
        is not yet tested against /login's still-dark background. That's a
        Screen 4 concern to revisit once /login itself is restyled; showing
        it here on a dark tile would just look broken, not informative.
      </p>
    </div>
  )
}
