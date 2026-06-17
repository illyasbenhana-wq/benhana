import { createClient } from '@supabase/supabase-js'

export interface Organization {
  id: string
  name: string
  slug: string
  plan: 'starter' | 'professional' | 'enterprise'
  settings: Record<string, unknown>
}

const DEFAULT_ORG_ID = '8586cf15-4a9f-440c-8635-40bb8e4747bf'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, plan, settings')
    .eq('slug', slug)
    .is('deleted_at', null)
    .single()

  if (error || !data) return null
  return data as Organization
}

export async function getOrgById(id: string): Promise<Organization | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, plan, settings')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return null
  return data as Organization
}

export async function getDefaultOrg(): Promise<Organization | null> {
  return getOrgById(DEFAULT_ORG_ID)
}

export function getDefaultOrgId(): string {
  return DEFAULT_ORG_ID
}

export async function resolveOrg(slug?: string): Promise<Organization | null> {
  if (slug && slug !== 'default') {
    return getOrgBySlug(slug)
  }
  return getDefaultOrg()
}
