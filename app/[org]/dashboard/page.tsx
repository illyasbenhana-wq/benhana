'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getRoleFromSession, ROLE_LABEL, UserRole } from '../../../lib/user-role'
import { MerchantIntelligence } from '../../dashboard/components/MerchantIntelligence'
import { fatimaOkoyeComplianceCase, FATIMA_OKOYE_CASE_REF } from '../../../lib/fatima-okoye-demo'

const _url = process.env.NEXT_PUBLIC_SUPABASE_URL
const _key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase: SupabaseClient | null = _url && _key ? createClient(_url, _key) : null

export default function OrgDashboardPage() {
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
        <button onClick={() => router.push('/dashboard')} style={{ marginTop: 8, padding: '10px 24px', borderRadius: 8, background: '#4a9eff', color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500 }}>
          Go to default dashboard
        </button>
      </div>
    )
  }

  // Org is valid — redirect to the existing dashboard
  // RLS ensures the user only sees data for their org
  router.replace('/dashboard')
  return null
}
