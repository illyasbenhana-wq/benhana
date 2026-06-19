import type { Session } from '@supabase/supabase-js'
import type { OrgRole } from './permissions'

// ─── Phase 1 legacy roles (kept for backward compatibility) ──────────────────

export type LegacyRole = 'analyst' | 'senior_analyst' | 'lender'

const LEGACY_TO_ORG: Record<LegacyRole, OrgRole> = {
  analyst:        'analyst',
  senior_analyst: 'admin',
  lender:         'viewer',
}

const LEGACY_ROLES = new Set<string>(Object.keys(LEGACY_TO_ORG))

// ─── Phase 2 org roles ──────────────────────────────────────────────────────

export type UserRole = OrgRole

const VALID_ORG_ROLES = new Set<OrgRole>(['owner', 'admin', 'analyst', 'viewer', 'partner'])

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner:   'Owner',
  admin:   'Admin',
  analyst: 'Analyst',
  viewer:  'Viewer',
  partner: 'Partner',
}

export const ROLE_HOME: Record<OrgRole, string> = {
  owner:   '/dashboard',
  admin:   '/dashboard',
  analyst: '/dashboard',
  viewer:  '/dashboard',
  partner: '/lender/dashboard',
}

// ─── Role resolution ─────────────────────────────────────────────────────────

export function getRoleFromSession(session: Session | null): OrgRole {
  if (!session) return 'viewer'

  const meta = session.user.app_metadata ?? {}
  const userMeta = session.user.user_metadata ?? {}
  const raw = meta['role'] ?? userMeta['role']

  if (!raw) return 'viewer'

  if (VALID_ORG_ROLES.has(raw as OrgRole)) {
    return raw as OrgRole
  }

  if (LEGACY_ROLES.has(raw)) {
    return LEGACY_TO_ORG[raw as LegacyRole]
  }

  return 'viewer'
}
