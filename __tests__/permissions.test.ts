import { describe, it, expect } from 'vitest'
import { hasPermission, assertPermission, PermissionDeniedError } from '../lib/permissions'
import type { OrgRole, Action, Resource } from '../lib/permissions'

describe('RBAC permission matrix', () => {
  const ROLES: OrgRole[] = ['owner', 'admin', 'analyst', 'viewer', 'partner']
  const RESOURCES: Resource[] = ['applications', 'cases', 'scores', 'decisions', 'audit_events']
  const ACTIONS: Action[] = ['read', 'write', 'delete', 'approve']

  // Owner: full access except audit_events (read only)
  describe('owner', () => {
    it('can read/write/delete/approve all resources except audit_events', () => {
      for (const r of RESOURCES) {
        expect(hasPermission('owner', 'read', r)).toBe(true)
        if (r !== 'audit_events') {
          expect(hasPermission('owner', 'write', r)).toBe(true)
          expect(hasPermission('owner', 'delete', r)).toBe(true)
          expect(hasPermission('owner', 'approve', r)).toBe(true)
        }
      }
    })

    it('can only read audit_events', () => {
      expect(hasPermission('owner', 'read', 'audit_events')).toBe(true)
      expect(hasPermission('owner', 'write', 'audit_events')).toBe(false)
      expect(hasPermission('owner', 'delete', 'audit_events')).toBe(false)
      expect(hasPermission('owner', 'approve', 'audit_events')).toBe(false)
    })
  })

  // Admin: read + write + approve, no delete
  describe('admin', () => {
    it('can read/write/approve but not delete', () => {
      for (const r of ['applications', 'cases', 'scores', 'decisions'] as Resource[]) {
        expect(hasPermission('admin', 'read', r)).toBe(true)
        expect(hasPermission('admin', 'write', r)).toBe(true)
        expect(hasPermission('admin', 'approve', r)).toBe(true)
        expect(hasPermission('admin', 'delete', r)).toBe(false)
      }
    })
  })

  // Analyst: read + write on applications/cases, read-only on scores/decisions
  describe('analyst', () => {
    it('can read and write applications and cases', () => {
      expect(hasPermission('analyst', 'read', 'applications')).toBe(true)
      expect(hasPermission('analyst', 'write', 'applications')).toBe(true)
      expect(hasPermission('analyst', 'read', 'cases')).toBe(true)
      expect(hasPermission('analyst', 'write', 'cases')).toBe(true)
    })

    it('can only read scores and decisions', () => {
      expect(hasPermission('analyst', 'read', 'scores')).toBe(true)
      expect(hasPermission('analyst', 'write', 'scores')).toBe(false)
      expect(hasPermission('analyst', 'read', 'decisions')).toBe(true)
      expect(hasPermission('analyst', 'write', 'decisions')).toBe(false)
    })

    it('cannot approve or delete anything', () => {
      for (const r of RESOURCES) {
        expect(hasPermission('analyst', 'approve', r)).toBe(false)
        expect(hasPermission('analyst', 'delete', r)).toBe(false)
      }
    })
  })

  // Viewer: read-only everywhere
  describe('viewer', () => {
    it('can read all resources', () => {
      for (const r of RESOURCES) {
        expect(hasPermission('viewer', 'read', r)).toBe(true)
      }
    })

    it('cannot write/delete/approve anything', () => {
      for (const r of RESOURCES) {
        expect(hasPermission('viewer', 'write', r)).toBe(false)
        expect(hasPermission('viewer', 'delete', r)).toBe(false)
        expect(hasPermission('viewer', 'approve', r)).toBe(false)
      }
    })
  })

  // Partner: read applications + scores only
  describe('partner', () => {
    it('can read applications and scores', () => {
      expect(hasPermission('partner', 'read', 'applications')).toBe(true)
      expect(hasPermission('partner', 'read', 'scores')).toBe(true)
    })

    it('cannot read cases, decisions, or audit_events', () => {
      expect(hasPermission('partner', 'read', 'cases')).toBe(false)
      expect(hasPermission('partner', 'read', 'decisions')).toBe(false)
      expect(hasPermission('partner', 'read', 'audit_events')).toBe(false)
    })

    it('cannot write/delete/approve anything', () => {
      for (const r of RESOURCES) {
        expect(hasPermission('partner', 'write', r)).toBe(false)
        expect(hasPermission('partner', 'delete', r)).toBe(false)
        expect(hasPermission('partner', 'approve', r)).toBe(false)
      }
    })
  })
})

describe('assertPermission', () => {
  it('does not throw for valid permission', () => {
    expect(() => assertPermission('owner', 'read', 'applications')).not.toThrow()
  })

  it('throws PermissionDeniedError for denied permission', () => {
    expect(() => assertPermission('viewer', 'write', 'applications')).toThrow(PermissionDeniedError)
  })

  it('error message includes role, action, resource', () => {
    try {
      assertPermission('partner', 'write', 'cases')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionDeniedError)
      expect((e as Error).message).toContain('partner')
      expect((e as Error).message).toContain('write')
      expect((e as Error).message).toContain('cases')
    }
  })
})

describe('hasPermission edge cases', () => {
  it('returns false for unknown role', () => {
    expect(hasPermission('superadmin' as any, 'read', 'applications')).toBe(false)
  })

  it('returns false for unknown resource', () => {
    expect(hasPermission('owner', 'read', 'nonexistent' as any)).toBe(false)
  })

  it('returns false for unknown action', () => {
    expect(hasPermission('owner', 'execute' as any, 'applications')).toBe(false)
  })
})
