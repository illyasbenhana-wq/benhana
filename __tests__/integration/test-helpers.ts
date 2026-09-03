import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'crypto'

// Read test credentials from environment (.env.test)
// NEVER hardcode Supabase keys in source files
const TEST_URL = process.env.TEST_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const TEST_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? ''

// SAFETY: allowlist approach — only the test project ref is permitted
// gwvhlemfubmcnbzdarnx (2026-07-21) — ehmingbvknavehcjgkou was retired as the
// test ref after it was found to be the production project (see CLAUDE.md).
const ALLOWED_TEST_PROJECT_REF = 'gwvhlemfubmcnbzdarnx'

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

// Creates a brand-new, uniquely-named organization for tests that need to
// INSERT their own applications/scores rows. ORG_A_ID/ORG_B_ID above are a
// permanent, hand-seeded fixture (3 Org A applications, 3 Org A v2 scores,
// 1 Org B application, 1 Org B v1 score, etc.) that other tests
// (multi-tenancy.test.ts, scoring-pipeline.test.ts) assert exact counts
// against — inserting additional applications/scores under ORG_A_ID/
// ORG_B_ID permanently inflates those counts for every future run, since
// this suite is never allowed to delete existing ethosfi-test data. Any
// test that needs to create its own application/score fixture should call
// this instead of writing under ORG_A_ID/ORG_B_ID, so it never touches the
// counted fixture again. Real tenant-isolation coverage (Org-vs-Org) is
// unaffected — this still creates two genuinely distinct organizations
// when a test needs a cross-tenant negative case.
export async function createFixtureOrg(label: string) {
  const supabase = getTestSupabase()
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const { data, error } = await supabase
    .from('organizations')
    .insert({ name: `Integration Fixture — ${label} — ${uniqueSuffix}`, slug: `int-fixture-${label}-${uniqueSuffix}` })
    .select('id')
    .single()
  if (error) throw error
  return data!.id as string
}
