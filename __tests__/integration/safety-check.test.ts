import { describe, it, expect, vi, afterEach } from 'vitest'

describe('Production safety check', () => {
  const ORIGINAL_URL = process.env.TEST_SUPABASE_URL
  const ORIGINAL_KEY = process.env.TEST_SUPABASE_SERVICE_KEY

  afterEach(() => {
    process.env.TEST_SUPABASE_URL = ORIGINAL_URL
    process.env.TEST_SUPABASE_SERVICE_KEY = ORIGINAL_KEY
    vi.resetModules()
  })

  it('getTestSupabase() throws when URL points at a non-test project', async () => {
    process.env.TEST_SUPABASE_URL = 'https://some-production-project.supabase.co'
    process.env.TEST_SUPABASE_SERVICE_KEY = 'fake-key'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://some-production-project.supabase.co'
    process.env.SUPABASE_SERVICE_KEY = 'fake-key'

    const { getTestSupabase } = await import('./test-helpers')
    expect(() => getTestSupabase()).toThrow('FATAL')
  })

  it('getTestSupabase() throws when credentials are empty', async () => {
    process.env.TEST_SUPABASE_URL = ''
    process.env.TEST_SUPABASE_SERVICE_KEY = ''
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_KEY = ''

    const { getTestSupabase } = await import('./test-helpers')
    expect(() => getTestSupabase()).toThrow('credentials not set')
  })

  it('getTestSupabase() succeeds for the real test project URL', async () => {
    // Uses the actual env vars from .env.test (loaded by vitest config)
    const { getTestSupabase } = await import('./test-helpers')
    const client = getTestSupabase()
    expect(client).toBeDefined()
  })

  it('the allowlisted project ref matches the test env URL', () => {
    const url = process.env.TEST_SUPABASE_URL ?? ''
    expect(url).toContain('ehmingbvknavehcjgkou')
  })
})
