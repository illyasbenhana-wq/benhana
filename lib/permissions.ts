export type OrgRole = 'owner' | 'admin' | 'analyst' | 'viewer' | 'partner'

export type Resource = 'applications' | 'cases' | 'scores' | 'decisions' | 'audit_events'

export type Action = 'read' | 'write' | 'delete' | 'approve'

const MATRIX: Record<OrgRole, Record<Resource, Set<Action>>> = {
  owner: {
    applications: new Set(['read', 'write', 'delete', 'approve']),
    cases:        new Set(['read', 'write', 'delete', 'approve']),
    scores:       new Set(['read', 'write', 'delete', 'approve']),
    decisions:    new Set(['read', 'write', 'delete', 'approve']),
    audit_events: new Set(['read']),
  },
  admin: {
    applications: new Set(['read', 'write', 'approve']),
    cases:        new Set(['read', 'write', 'approve']),
    scores:       new Set(['read', 'write', 'approve']),
    decisions:    new Set(['read', 'write', 'approve']),
    audit_events: new Set(['read']),
  },
  analyst: {
    applications: new Set(['read', 'write']),
    cases:        new Set(['read', 'write']),
    scores:       new Set(['read']),
    decisions:    new Set(['read']),
    audit_events: new Set(['read']),
  },
  viewer: {
    applications: new Set(['read']),
    cases:        new Set(['read']),
    scores:       new Set(['read']),
    decisions:    new Set(['read']),
    audit_events: new Set(['read']),
  },
  partner: {
    applications: new Set(['read']),
    cases:        new Set([]),
    scores:       new Set(['read']),
    decisions:    new Set([]),
    audit_events: new Set([]),
  },
}

export function hasPermission(role: OrgRole, action: Action, resource: Resource): boolean {
  const resourcePerms = MATRIX[role]?.[resource]
  if (!resourcePerms) return false
  return resourcePerms.has(action)
}

export class PermissionDeniedError extends Error {
  constructor(role: OrgRole, action: Action, resource: Resource) {
    super(`Role "${role}" cannot "${action}" on "${resource}"`)
    this.name = 'PermissionDeniedError'
  }
}

export function assertPermission(role: OrgRole, action: Action, resource: Resource): void {
  if (!hasPermission(role, action, resource)) {
    throw new PermissionDeniedError(role, action, resource)
  }
}
