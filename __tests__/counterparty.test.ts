import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BusinessProfile } from '../types'

// Mirrors the mocking convention already used in
// __tests__/anomaly-detector.test.ts: mock @supabase/supabase-js before
// importing the module under test, since lib/counterparty.ts constructs
// its own client via createClient() rather than accepting one as a param.
let behavior: {
  upsert: { data: any; error: any }
  update: { error: any }
  edgeInsert: { error: any }
  throwOnUpsert?: boolean
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'counterparties') {
        return {
          upsert: () => {
            if (behavior.throwOnUpsert) throw new Error('connection reset')
            return {
              select: () => ({
                single: async () => behavior.upsert,
              }),
            }
          },
        }
      }
      if (table === 'applications') {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => behavior.update,
            }),
          }),
        }
      }
      if (table === 'ontology_edges') {
        return {
          insert: async () => behavior.edgeInsert,
        }
      }
      throw new Error(`unexpected table in test mock: ${table}`)
    },
  }),
}))

import { linkApplicationCounterparty } from '../lib/counterparty'

const BUSINESS: BusinessProfile = {
  legal_name: 'Osei Catering Ltd',
  registration_number: '09123456',
  jurisdiction: 'England & Wales',
  trading_since_months: 60,
  annual_revenue: 120_000,
}

const BASE_PARAMS = {
  orgId: 'org-1',
  applicationId: 'app-1',
  business: BUSINESS,
  actorId: 'api_key:key-1',
}

describe('linkApplicationCounterparty', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'test-key')
    behavior = {
      upsert: { data: { id: 'cp-1' }, error: null },
      update: { error: null },
      edgeInsert: { error: null },
    }
  })

  it('links successfully on the happy path', async () => {
    const result = await linkApplicationCounterparty(BASE_PARAMS)
    expect(result).toEqual({ linked: true, counterpartyId: 'cp-1' })
  })

  it('returns linked:false, does not throw, when supabase is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_KEY', '')
    const result = await linkApplicationCounterparty(BASE_PARAMS)
    expect(result.linked).toBe(false)
  })

  it('returns linked:false, does not throw, when the counterparty upsert fails', async () => {
    behavior.upsert = { data: null, error: { message: 'unique violation' } }
    const result = await linkApplicationCounterparty(BASE_PARAMS)
    expect(result.linked).toBe(false)
    expect(result.error).toBe('unique violation')
  })

  it('returns linked:false, does not throw, when the application FK update fails', async () => {
    behavior.update = { error: { message: 'row not found' } }
    const result = await linkApplicationCounterparty(BASE_PARAMS)
    expect(result.linked).toBe(false)
    expect(result.counterpartyId).toBe('cp-1') // counterparty row did get created
  })

  it('still reports linked:true when the (best-effort) ontology_edges insert fails', async () => {
    behavior.edgeInsert = { error: { message: 'constraint violation' } }
    const result = await linkApplicationCounterparty(BASE_PARAMS)
    expect(result.linked).toBe(true)
  })

  it('never throws, even when the client itself throws', async () => {
    behavior.throwOnUpsert = true
    await expect(linkApplicationCounterparty(BASE_PARAMS)).resolves.toEqual(
      expect.objectContaining({ linked: false })
    )
  })
})
