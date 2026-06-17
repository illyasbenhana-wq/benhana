'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return url && key ? createClient(url, key) : null
})()

export default function OrgLenderDashboardPage() {
  const params = useParams()
  const orgSlug = params.org as string
  const router = useRouter()
  const [orgValid, setOrgValid] = useState<boolean | null>(null)

  useEffect(() => {
    if (!supabase || !orgSlug) return
    supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('slug', orgSlug)
      .is('deleted_at', null)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setOrgValid(false)
        } else {
          setOrgValid(true)
        }
      })
  }, [orgSlug])

  if (orgValid === null) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif' }}>
        <p style={{ color: '#555' }}>Loading workspace...</p>
      </div>
    )
  }

  if (orgValid === false) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 18, fontWeight: 500 }}>Workspace not found</p>
        <p style={{ color: '#555', fontSize: 14 }}>The organization "{orgSlug}" does not exist.</p>
        <button onClick={() => router.push('/lender/dashboard')} style={{ marginTop: 8, padding: '10px 24px', borderRadius: 8, background: '#4a9eff', color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500 }}>
          Go to default dashboard
        </button>
      </div>
    )
  }

  router.replace('/lender/dashboard')
  return null
}
