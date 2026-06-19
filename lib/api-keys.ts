import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'crypto'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ApiKeyScope =
  | 'applications:read'
  | 'applications:write'
  | 'scores:read'
  | 'cases:read'
  | 'cases:write'
  | 'audit_events:read'

const VALID_SCOPES = new Set<ApiKeyScope>([
  'applications:read',
  'applications:write',
  'scores:read',
  'cases:read',
  'cases:write',
  'audit_events:read',
])

export interface ApiKeyRecord {
  id: string
  organizationId: string
  name: string
  scopes: ApiKeyScope[]
  rateLimitRpm: number
  expiresAt: string | null
}

// ─── Key Generation ──────────────────────────────────────────────────────────

function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

export async function generateApiKey(
  orgId: string,
  name: string,
  scopes: ApiKeyScope[],
  rateLimitRpm: number = 60,
  expiresAt?: string
): Promise<{ plaintext: string; record: ApiKeyRecord } | { error: string }> {
  const supabase = getSupabase()
  if (!supabase) return { error: 'Database not configured' }

  for (const s of scopes) {
    if (!VALID_SCOPES.has(s)) return { error: `Invalid scope: ${s}` }
  }

  const random = randomBytes(20).toString('hex')
  const plaintext = `etho_ak_${random}`
  const keyHash = hashKey(plaintext)
  const keyPrefix = plaintext.slice(0, 16)

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      organization_id: orgId,
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes,
      rate_limit_rpm: rateLimitRpm,
      expires_at: expiresAt ?? null,
    })
    .select()
    .single()

  if (error || !data) {
    return { error: `Failed to create API key: ${error?.message}` }
  }

  return {
    plaintext,
    record: {
      id: data.id,
      organizationId: data.organization_id,
      name: data.name,
      scopes: data.scopes as ApiKeyScope[],
      rateLimitRpm: data.rate_limit_rpm,
      expiresAt: data.expires_at,
    },
  }
}

// ─── Key Validation ──────────────────────────────────────────────────────────

export async function validateApiKey(
  plaintext: string
): Promise<ApiKeyRecord | null> {
  if (!plaintext.startsWith('etho_ak_')) return null

  const supabase = getSupabase()
  if (!supabase) return null

  const keyHash = hashKey(plaintext)

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, organization_id, name, scopes, rate_limit_rpm, expires_at, deleted_at')
    .eq('key_hash', keyHash)
    .single()

  if (error || !data) return null
  if (data.deleted_at) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null

  // Update last_used_at (fire-and-forget)
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then()

  return {
    id: data.id,
    organizationId: data.organization_id,
    name: data.name,
    scopes: data.scopes as ApiKeyScope[],
    rateLimitRpm: data.rate_limit_rpm,
    expiresAt: data.expires_at,
  }
}

// ─── Scope Check ─────────────────────────────────────────────────────────────

export function hasScope(scopes: ApiKeyScope[], required: ApiKeyScope): boolean {
  return scopes.includes(required)
}
