import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'crypto'

// Read test credentials from environment (.env.test)
// NEVER hardcode Supabase keys in source files
const TEST_URL = process.env.TEST_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const TEST_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? ''

// SAFETY: allowlist approach — only the test project ref is permitted
const ALLOWED_TEST_PROJECT_REF = 'ehmingbvknavehcjgkou'

export function getTestSupabase() {
  if (!TEST_URL || !TEST_SERVICE_KEY) {
    throw new Error('Test Supabase credentials not set. Create .env.test with TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_KEY')
  }
  if (!TEST_URL.includes(ALLOWED_TEST_PROJECT_REF)) {
    throw new Error(`FATAL: integration tests will ONLY run against the test project (${ALLOWED_TEST_PROJECT_REF}). Current URL points elsewhere: ${TEST_URL}`)
  }
  return createClient(TEST_URL, TEST_SERVICE_KEY)
}

// Known test IDs
export const ORG_A_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
export const ORG_B_ID = 'bbbbbbbb-0000-0000-0000-000000000002'

export const ORG_A_APP_IDS = [
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
]
export const ORG_B_APP_ID = 'b1000000-0000-0000-0000-000000000001'

export const ORG_A_CASE_ID = 'ca000000-0000-0000-0000-000000000001'
export const ORG_B_CASE_ID = 'cb000000-0000-0000-0000-000000000001'

export const ORG_A_SCORE_IDS = [
  '51000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000002',
  '51000000-0000-0000-0000-000000000003',
]
export const ORG_B_SCORE_ID = '52000000-0000-0000-0000-000000000001'

// Generate a test API key for a given org
export async function createTestApiKey(orgId: string, scopes: string[]) {
  const supabase = getTestSupabase()
  const random = randomBytes(20).toString('hex')
  const plaintext = `etho_ak_${random}`
  const keyHash = createHash('sha256').update(plaintext).digest('hex')

  await supabase.from('api_keys').insert({
    organization_id: orgId,
    name: 'test-key',
    key_prefix: plaintext.slice(0, 16),
    key_hash: keyHash,
    scopes,
    rate_limit_rpm: 100,
  })

  return plaintext
}

// Cleanup test API keys after tests
export async function cleanupTestApiKeys() {
  const supabase = getTestSupabase()
  await supabase.from('api_keys').delete().eq('name', 'test-key')
}
