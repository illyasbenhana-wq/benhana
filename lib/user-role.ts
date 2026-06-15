import type { Session } from '@supabase/supabase-js'

export type UserRole = 'analyst' | 'senior_analyst' | 'lender'

const VALID_ROLES = new Set<UserRole>(['analyst', 'senior_analyst', 'lender'])

export const ROLE_LABEL: Record<UserRole, string> = {
  analyst:        'Analyst',
  senior_analyst: 'Senior Analyst',
  lender:         'Lender',
}

export const ROLE_HOME: Record<UserRole, string> = {
  analyst:        '/dashboard',
  senior_analyst: '/dashboard',
  lender:         '/lender/dashboard',
}

// Reads role from app_metadata (set server-side / admin) with fallback to
// user_metadata (set at signup) so both storage paths work.
export function getRoleFromSession(session: Session | null): UserRole {
  if (!session) return 'analyst'

  const meta = session.user.app_metadata ?? {}
  const userMeta = session.user.user_metadata ?? {}
  const raw = meta['role'] ?? userMeta['role']

  return VALID_ROLES.has(raw) ? (raw as UserRole) : 'analyst'
}
