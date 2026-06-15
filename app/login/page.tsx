'use client'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { getRoleFromSession, ROLE_HOME } from '../../lib/user-role'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LoginPage() {
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
      background: '#0a0a0f',
      color: '#e8e6df',
      fontFamily: '"DM Sans", sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#4a9eff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L14 5V8C14 11.31 11.46 14.42 8 15C4.54 14.42 2 11.31 2 8V5L8 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
        </div>
        <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 20 }}>EthosFi</span>
      </div>

      {/* Card */}
      <div style={{
        width: '100%',
        maxWidth: 400,
        background: '#0d0d14',
        border: '1px solid #1a1a28',
        borderRadius: 16,
        padding: '40px 36px',
      }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 500, fontFamily: '"DM Serif Display", serif' }}>
          Sign in
        </h1>
        <p style={{ margin: '0 0 32px', fontSize: 13, color: '#555', lineHeight: 1.5 }}>
          Access the EthosFi compliance dashboard
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#888', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                background: '#13131e',
                border: '1px solid #1e1e2e',
                borderRadius: 8,
                padding: '11px 14px',
                color: '#e8e6df',
                fontSize: 14,
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#4a9eff')}
              onBlur={e => (e.target.style.borderColor = '#1e1e2e')}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#888', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                background: '#13131e',
                border: '1px solid #1e1e2e',
                borderRadius: 8,
                padding: '11px 14px',
                color: '#e8e6df',
                fontSize: 14,
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#4a9eff')}
              onBlur={e => (e.target.style.borderColor = '#1e1e2e')}
            />
          </div>

          {error && (
            <div style={{
              background: '#1a0a0a',
              border: '1px solid #3a1a1a',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 13,
              color: '#e24b4a',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              background: loading ? '#1a2a3a' : '#4a9eff',
              color: loading ? '#555' : '#000',
              border: 'none',
              borderRadius: 8,
              padding: '12px',
              fontSize: 14,
              fontWeight: 500,
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
