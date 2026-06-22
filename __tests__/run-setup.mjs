import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const url = process.env.TEST_SUPABASE_URL ?? ''
const key = process.env.TEST_SUPABASE_SERVICE_KEY ?? ''

// SAFETY: refuse to run against production
const PRODUCTION_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
if (url === PRODUCTION_URL) {
  console.error('FATAL: refusing to run test setup against production Supabase')
  process.exit(1)
}

const supabase = createClient(url, key)

const sql = readFileSync('__tests__/setup-test-db.sql', 'utf8')

// Split into individual statements and run sequentially
const statements = sql
  .split(/;\s*$/m)
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'))

let success = 0
let failed = 0

for (const stmt of statements) {
  const { error } = await supabase.rpc('', {}).then(() => ({ error: null })).catch(() => ({ error: 'rpc not available' }))
  // Use the Postgres connection via supabase-js
  const { data, error: err } = await supabase.from('_exec').select().limit(0).then(() => ({ data: null, error: null }))
}

// Since we can't run raw SQL via supabase-js client, use the management API
const response = await fetch(`${url}/rest/v1/rpc/`, {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({}),
})

console.log('Note: Raw SQL must be run via Supabase SQL Editor.')
console.log('Copy the contents of __tests__/setup-test-db.sql and paste into:')
console.log(`${url.replace('.supabase.co', '')}/project/ehmingbvknavehcjgkou/sql/new`)
