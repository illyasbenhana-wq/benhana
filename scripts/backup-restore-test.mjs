/**
 * EthosFi — Backup/Restore Test Script
 * Tests the backup/restore cycle against the TEST project only.
 *
 * Usage: node scripts/backup-restore-test.mjs
 *
 * Prerequisites: .env.test must exist with TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'fs'

// Load .env.test
const envFile = readFileSync('.env.test', 'utf8')
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
)

const url = env.TEST_SUPABASE_URL
const key = env.TEST_SUPABASE_SERVICE_KEY

// SAFETY: only the test project
if (!url?.includes('ehmingbvknavehcjgkou')) {
  console.error('FATAL: this script only runs against the test project')
  process.exit(1)
}

const supabase = createClient(url, key)
const BACKUP_FILE = 'backups/test_backup.json'
const TABLES = ['organizations', 'applications', 'scores', 'cases', 'signals']

async function getCounts() {
  const counts = {}
  for (const table of TABLES) {
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true })
    counts[table] = count ?? 0
  }
  return counts
}

async function backup() {
  console.log('\n=== STEP 1: BACKUP ===')
  const data = {}
  for (const table of TABLES) {
    const { data: rows, error } = await supabase.from(table).select('*')
    if (error) { console.error(`  ERROR backing up ${table}:`, error.message); continue }
    data[table] = rows
    console.log(`  ${table}: ${rows.length} rows`)
  }
  writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2))
  console.log(`  Backup saved to ${BACKUP_FILE}`)
  return data
}

async function simulateDataLoss() {
  console.log('\n=== STEP 2: SIMULATE DATA LOSS ===')
  // Delete all scores for Org Alpha (test data only)
  const { data, error } = await supabase
    .from('scores')
    .delete()
    .eq('organization_id', 'aaaaaaaa-0000-0000-0000-000000000001')
    .select('id')

  if (error) { console.error('  ERROR deleting:', error.message); return }
  console.log(`  Deleted ${data.length} scores from Org Alpha`)

  const counts = await getCounts()
  console.log(`  Post-deletion counts:`, counts)
}

async function restore(backupData) {
  console.log('\n=== STEP 3: RESTORE ===')
  const scoresToRestore = backupData.scores.filter(
    s => s.organization_id === 'aaaaaaaa-0000-0000-0000-000000000001'
  )
  console.log(`  Restoring ${scoresToRestore.length} scores...`)

  const { data, error } = await supabase
    .from('scores')
    .upsert(scoresToRestore, { onConflict: 'id' })
    .select('id')

  if (error) { console.error('  ERROR restoring:', error.message); return false }
  console.log(`  Restored ${data.length} scores`)
  return true
}

async function verify(originalCounts) {
  console.log('\n=== STEP 4: VERIFY ===')
  const postCounts = await getCounts()

  let allMatch = true
  for (const table of TABLES) {
    const match = originalCounts[table] === postCounts[table]
    const status = match ? '✅' : '❌'
    console.log(`  ${status} ${table}: ${originalCounts[table]} → ${postCounts[table]}`)
    if (!match) allMatch = false
  }

  return allMatch
}

// Main
console.log('EthosFi Backup/Restore Test')
console.log('Target:', url)
console.log('Tables:', TABLES.join(', '))

const originalCounts = await getCounts()
console.log('\nOriginal counts:', originalCounts)

const backupData = await backup()
await simulateDataLoss()
const restored = await restore(backupData)

if (restored) {
  const success = await verify(originalCounts)
  console.log(success
    ? '\n✅ BACKUP/RESTORE TEST PASSED — all row counts match'
    : '\n❌ BACKUP/RESTORE TEST FAILED — counts do not match')
  process.exit(success ? 0 : 1)
} else {
  console.log('\n❌ RESTORE FAILED')
  process.exit(1)
}
