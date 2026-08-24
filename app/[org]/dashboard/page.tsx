'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getRoleFromSession, ROLE_LABEL, UserRole } from '../../../lib/user-role'
import { MerchantIntelligence } from '../../dashboard/components/MerchantIntelligence'
import { fatimaOkoyeComplianceCase, FATIMA_OKOYE_CASE_REF } from '../../../lib/fatima-okoye-demo'
import { color as C, fontFamily as F, fontSize as FS, fontWeight as FW, radius as R, space as SP, borderLine, googleFontsHref } from '../../../lib/design-system/tokens-light'

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
      <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans }}>
        <link href={googleFontsHref} rel="stylesheet" />
        <p style={{ color: C.textSecondary, fontSize: FS.sm }}>Loading workspace…</p>
      </div>
    )
  }

  if (orgValid === false) {
    return (
      <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans, flexDirection: 'column', gap: SP.md }}>
        <link href={googleFontsHref} rel="stylesheet" />
        <p style={{ fontSize: FS.md, fontWeight: FW.medium }}>Workspace not found</p>
        <p style={{ color: C.textSecondary, fontSize: FS.sm }}>The organization "{orgSlug}" does not exist.</p>
        <button onClick={() => router.push('/dashboard')} style={{ marginTop: SP.xs, padding: '10px 24px', borderRadius: R.control, background: C.accent, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: F.sans, fontSize: FS.sm, fontWeight: FW.medium }}>
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
