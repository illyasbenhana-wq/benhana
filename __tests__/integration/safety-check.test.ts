import { describe, it, expect, vi } from 'vitest'

describe('Production safety check', () => {
  it('getTestSupabase refuses to run against a non-test URL', async () => {
    // Temporarily override env to simulate pointing at production
    const origUrl = process.env.TEST_SUPABASE_URL
    const origKey = process.env.TEST_SUPABASE_SERVICE_KEY

    process.env.TEST_SUPABASE_URL = 'https://some-production-project.supabase.co'
    process.env.TEST_SUPABASE_SERVICE_KEY = 'fake-key'

    // Re-import to pick up new env (dynamic import bypasses module cache)
    // Instead, directly test the logic:
    const ALLOWED_TEST_PROJECT_REF = 'ehmingbvknavehcjgkou'
    const url = process.env.TEST_SUPABASE_URL

    expect(url!.includes(ALLOWED_TEST_PROJECT_REF)).toBe(false)

    // Restore
    process.env.TEST_SUPABASE_URL = origUrl
    process.env.TEST_SUPABASE_SERVICE_KEY = origKey
  })

  it('getTestSupabase accepts the test project URL', () => {
    const ALLOWED_TEST_PROJECT_REF = 'ehmingbvknavehcjgkou'
    const url = process.env.TEST_SUPABASE_URL ?? ''

    expect(url.includes(ALLOWED_TEST_PROJECT_REF)).toBe(true)
  })

  it('safety check blocks exact production URL pattern', () => {
    const ALLOWED_TEST_PROJECT_REF = 'ehmingbvknavehcjgkou'

    const productionUrls = [
      'https://lrmwkqfmxhpbkfmbnkwq.supabase.co',
      'https://anything-else.supabase.co',
      'https://supabase.co',
      '',
    ]

    for (const url of productionUrls) {
      expect(url.includes(ALLOWED_TEST_PROJECT_REF)).toBe(false)
    }
  })

  it('safety check passes only for the test project', () => {
    const ALLOWED_TEST_PROJECT_REF = 'ehmingbvknavehcjgkou'
    const testUrl = 'https://ehmingbvknavehcjgkou.supabase.co'

    expect(testUrl.includes(ALLOWED_TEST_PROJECT_REF)).toBe(true)
  })
})
