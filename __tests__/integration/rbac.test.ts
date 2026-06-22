import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash, randomBytes } from 'crypto'
import {
  getTestSupabase,
  ORG_A_ID, ORG_B_ID,
  ORG_A_APP_IDS, ORG_A_CASE_ID,
  createTestApiKey, cleanupTestApiKeys,
} from './test-helpers'
import { validateApiKey, hasScope } from '../../lib/api-keys'
import { hasPermission } from '../../lib/permissions'
import type { OrgRole } from '../../lib/permissions'

const supabase = getTestSupabase()

describe('RBAC integration — API key validation', () => {
  let orgAKey: string
  let orgBKey: string

  beforeAll(async () => {
    await cleanupTestApiKeys()
    orgAKey = await createTestApiKey(ORG_A_ID, ['applications:read', 'applications:write', 'scores:read', 'cases:read'])
    orgBKey = await createTestApiKey(ORG_B_ID, ['applications:read', 'scores:read'])
  })

  afterAll(async () => {
    await cleanupTestApiKeys()
  })

  it('validates Org A key and returns correct org ID', async () => {
    // We need to set env vars for validateApiKey to work
    const record = await validateApiKey(orgAKey)
    expect(record).not.toBeNull()
    expect(record!.organizationId).toBe(ORG_A_ID)
    expect(record!.scopes).toContain('applications:read')
    expect(record!.scopes).toContain('cases:read')
  })

  it('validates Org B key and returns correct org ID', async () => {
    const record = await validateApiKey(orgBKey)
    expect(record).not.toBeNull()
    expect(record!.organizationId).toBe(ORG_B_ID)
  })

  it('rejects invalid key', async () => {
    const record = await validateApiKey('etho_ak_invalid_key_that_does_not_exist')
    expect(record).toBeNull()
  })

  it('rejects key without etho_ak_ prefix', async () => {
    const record = await validateApiKey('not_a_valid_prefix_key')
    expect(record).toBeNull()
  })

  it('Org A key has write scope, Org B key does not', async () => {
    const recordA = await validateApiKey(orgAKey)
    const recordB = await validateApiKey(orgBKey)

    expect(hasScope(recordA!.scopes, 'applications:write')).toBe(true)
    expect(hasScope(recordB!.scopes, 'applications:write')).toBe(false)
  })

  it('Org B key cannot access cases (no scope)', async () => {
    const record = await validateApiKey(orgBKey)
    expect(hasScope(record!.scopes, 'cases:read')).toBe(false)
  })
})

describe('RBAC integration — permission matrix enforcement', () => {
  const ROLES: OrgRole[] = ['owner', 'admin', 'analyst', 'viewer', 'partner']

  it('only owner can delete applications', () => {
    for (const role of ROLES) {
      if (role === 'owner') {
        expect(hasPermission(role, 'delete', 'applications')).toBe(true)
      } else {
        expect(hasPermission(role, 'delete', 'applications')).toBe(false)
      }
    }
  })

  it('partner cannot read cases', () => {
    expect(hasPermission('partner', 'read', 'cases')).toBe(false)
  })

  it('viewer cannot write to any resource', () => {
    for (const resource of ['applications', 'cases', 'scores', 'decisions', 'audit_events'] as const) {
      expect(hasPermission('viewer', 'write', resource)).toBe(false)
    }
  })

  it('analyst can write cases but not approve', () => {
    expect(hasPermission('analyst', 'write', 'cases')).toBe(true)
    expect(hasPermission('analyst', 'approve', 'cases')).toBe(false)
  })

  it('nobody can write audit_events', () => {
    for (const role of ROLES) {
      expect(hasPermission(role, 'write', 'audit_events')).toBe(false)
    }
  })
})

describe('RBAC integration — org-scoped data access via API key', () => {
  let orgAKey: string

  beforeAll(async () => {
    await cleanupTestApiKeys()
    orgAKey = await createTestApiKey(ORG_A_ID, ['applications:read', 'scores:read', 'cases:read'])

  })

  afterAll(async () => {
    await cleanupTestApiKeys()
  })

  it('Org A key resolves to Org A, data queries scoped correctly', async () => {
    const record = await validateApiKey(orgAKey)
    expect(record).not.toBeNull()

    const orgId = record!.organizationId
    expect(orgId).toBe(ORG_A_ID)

    // Simulate what a v1 endpoint does: query with org scoping
    const { data: apps } = await supabase
      .from('applications')
      .select('id, full_name')
      .eq('organization_id', orgId)

    expect(apps!.every(a => !a.full_name.includes('Beta'))).toBe(true)
    expect(apps!.some(a => a.full_name === 'Alice Alpha')).toBe(true)
  })

  it('Org A key cannot see Org B cases even via direct query', async () => {
    const record = await validateApiKey(orgAKey)
    const orgId = record!.organizationId

    const { data } = await supabase
      .from('cases')
      .select('id, entity_name')
      .eq('organization_id', orgId)

    expect(data!.some(c => c.entity_name === 'Beta Entity')).toBe(false)
    expect(data!.some(c => c.entity_name === 'Alpha Entity')).toBe(true)
  })
})
