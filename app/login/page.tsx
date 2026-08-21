'use client'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { redirect, useRouter } from 'next/navigation'
import { getRoleFromSession, ROLE_HOME } from '../../lib/user-role'
import { isPreviewDeployment } from '../../lib/preview-bypass'
import { Logo } from '../components/Logo'
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
} from '../../lib/design-system/tokens-light'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LoginPage() {
  // Preview-only auth bypass — safety net, not the primary mechanism.
  // app/dashboard and app/lender/dashboard already check
  // isPreviewDeployment() themselves before ever pushing here. This
  // exists for any route that forgets to: if it still lands here on a
  // preview deployment, bounce to /dashboard (which itself won't redirect
  // back) instead of rendering the real, still-dark login form. Do NOT
  // change the bounce target to a route that itself redirects back to
  // /login on preview — that would create a redirect loop.
  if (isPreviewDeployment()) {
    redirect('/dashboard')
  }

  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const role = getRoleFromSession(data.session)
    router.push(ROLE_HOME[role])
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: C.background,
      color: C.textPrimary,
      fontFamily: F.sans,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: SP.xxl,
    }}>
      <link href={googleFontsHref} rel="stylesheet" />
      <style>{`
        .ethos-login-input:focus { border-color: ${C.accent} !important; }
      `}</style>

      {/* Logo */}
      <div style={{ marginBottom: SP.xxxl }}>
        <Logo size="lg" />
      </div>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: C.surface,
        border: borderLine,
        borderRadius: R.card,
        boxShadow: shadowMd,
        padding: `${SP.xxl}px ${SP.xxl}px`,
      }}>
        <h1 style={{ margin: `0 0 8px`, fontSize: FS.lg, fontWeight: FW.semibold, fontFamily: F.sans }}>
          Sign in
        </h1>
        <p style={{ margin: `0 0 ${SP.xxl}px`, fontSize: FS.sm, color: C.textSecondary, lineHeight: 1.5 }}>
          Access the EthosFi compliance dashboard
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: SP.lg }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: FS.xs, color: C.textSecondary, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="ethos-login-input"
              style={{
                background: C.background,
                border: borderLine,
                borderRadius: R.control,
                padding: '11px 14px',
                color: C.textPrimary,
                fontSize: FS.base,
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: FS.xs, color: C.textSecondary, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="ethos-login-input"
              style={{
                background: C.background,
                border: borderLine,
                borderRadius: R.control,
                padding: '11px 14px',
                color: C.textPrimary,
                fontSize: FS.base,
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: `${C.riskHigh}11`,
              border: `1px solid ${C.riskHigh}44`,
              borderRadius: R.control,
              padding: '10px 14px',
              fontSize: FS.sm,
              color: C.riskHigh,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              background: loading ? C.border : C.accent,
              color: loading ? C.textMuted : '#fff',
              border: 'none',
              borderRadius: R.control,
              padding: '12px',
              fontSize: FS.base,
              fontWeight: FW.medium,
              fontFamily: 'inherit',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
