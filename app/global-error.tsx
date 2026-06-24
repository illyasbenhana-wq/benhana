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
        <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>Something went wrong</h2>
          <button onClick={reset} style={{ padding: '10px 24px', borderRadius: 8, background: '#4a9eff', color: '#000', border: 'none', cursor: 'pointer', fontSize: 14 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
