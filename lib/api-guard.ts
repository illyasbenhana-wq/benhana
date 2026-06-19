import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasPermission, OrgRole, Action, Resource } from './permissions'

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export interface ApiContext {
  userId: string
  orgId: string
  role: OrgRole
}

export async function resolveApiContext(req: NextRequest): Promise<ApiContext | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  const supabase = getServiceSupabase()
  if (!supabase) return null

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null

  const orgId = user.app_metadata?.org_id
  if (!orgId) return null

  const { data: membership, error: memErr } = await supabase
    .from('organization_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .single()

  if (memErr || !membership) return null

  const VALID_ROLES = new Set<OrgRole>(['owner', 'admin', 'analyst', 'viewer', 'partner'])
  const role = VALID_ROLES.has(membership.role as OrgRole)
    ? (membership.role as OrgRole)
    : null

  if (!role) return null

  return { userId: user.id, orgId, role }
}

export async function requirePermission(
  req: NextRequest,
  action: Action,
  resource: Resource
): Promise<{ context: ApiContext } | { error: NextResponse }> {
  const context = await resolveApiContext(req)

  if (!context) {
    return {
      error: NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated or not a member of any organization' } },
        { status: 401 }
      ),
    }
  }

  if (!hasPermission(context.role, action, resource)) {
    return {
      error: NextResponse.json(
        { error: { code: 'FORBIDDEN', message: `Role "${context.role}" cannot "${action}" on "${resource}"` } },
        { status: 403 }
      ),
    }
  }

  return { context }
}
