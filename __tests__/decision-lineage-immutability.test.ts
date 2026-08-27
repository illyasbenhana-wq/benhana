import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// Static guard, no database required: decision_records/data_snapshots/
// model_versions must be historically stable (see supabase/migrations/
// 20260827000000_add_decision_lineage_tables.sql) — a correction is always
// a new row, never an edit. This asserts that guarantee at the only place
// it can actually be enforced today: no application code calls
// .update()/.upsert() (other than model_versions' intentional natural-key
// upsert) against these tables. There is no DB trigger blocking UPDATE —
// immutability here is an application-layer discipline, so it must be
// checked in code, not assumed.

const IMMUTABLE_TABLES = ['data_snapshots', 'decision_records']
const SCAN_DIRS = ['app', 'lib']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git'])

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) out.push(full)
  }
  return out
}

describe('decision_records / data_snapshots immutability (static guard)', () => {
  const root = process.cwd()
  const files = SCAN_DIRS.flatMap(d => collectFiles(join(root, d)))

  for (const table of IMMUTABLE_TABLES) {
    it(`no source file calls .update()/.delete() against '${table}'`, () => {
      const offenders: string[] = []
      for (const file of files) {
        const content = readFileSync(file, 'utf8')
        // Matches from('table_name') followed (within a short window) by
        // .update( or .delete( — a simple but effective static check for
        // this codebase's straight-line supabase-js call style.
        const fromRegex = new RegExp(`from\\(['"]${table}['"]\\)[\\s\\S]{0,80}?\\.(update|delete)\\(`, 'g')
        if (fromRegex.test(content)) offenders.push(file.replace(root, ''))
      }
      expect(offenders).toEqual([])
    })
  }

  it('model_versions is only ever upserted on its documented natural key, never row-by-id updated', () => {
    const offenders: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      const updateRegex = /from\(['"]model_versions['"]\)[\s\S]{0,80}?\.update\(/g
      if (updateRegex.test(content)) offenders.push(file.replace(root, ''))
    }
    expect(offenders).toEqual([])
  })
})
