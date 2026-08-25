'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        {/* Kept deliberately dependency-free (hardcoded light-theme values,
            not imported from lib/design-system/tokens-light) — this
            boundary must render even if the app's own import graph is
            what crashed. Values below match color.background/textPrimary/
            textSecondary/accent in tokens-light.ts. */}
        <div style={{ minHeight: '100vh', background: '#FFFFFF', color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: '#64748B' }}>An unexpected error occurred. Please try again.</p>
          <button onClick={reset} style={{ padding: '10px 24px', borderRadius: 8, background: '#1D4ED8', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'inherit' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
