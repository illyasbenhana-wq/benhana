import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// Governance boundary (Decision Intelligence Phase 2, Step 1): the live
// scoring path must never depend on outcomes / performance_windows /
// historical_import_batches / historical_decision_records. Historical and
// outcome data may inform a human's decision to propose a model change,
// and may be used to evaluate a candidate model version -- but nothing in
// the scoring path may read from these tables, directly or indirectly.
// This is the enforceable half of "no automatic learning": a future PR
// that wires scoring to these tables fails CI here, rather than relying
// on a policy nobody re-reads. See supabase/migrations/
// 20260828000000_add_outcomes_performance_historical_foundation.sql.

const FORBIDDEN_TABLES = [
  'outcomes',
  'performance_windows',
  'historical_import_batches',
  'historical_decision_records',
  'provenance_records',
]

// Step 3 adds lib/performance-windows.ts, Step 4 adds
// lib/historical-ingestion.ts, Step 5 adds lib/decision-replay.ts, Data
// Provenance adds lib/provenance.ts, Counterfactual Analysis adds
// lib/counterfactual-analysis.ts. None of these may ever be imported by
// the scoring path -- alongside the table-name check above, scoring must
// be free of the tables AND free of the modules that read/write them.
// (The reverse direction -- counterfactual-analysis.ts importing
// lib/ethoscore-v2.ts and lib/decision-engine.ts to run its deterministic
// simulation -- is expected and fine; this check only guards the
// forbidden direction.)
const FORBIDDEN_MODULES = [
  'performance-windows',
  'historical-ingestion',
  'decision-replay',
  './provenance',
  "'provenance'",
  'counterfactual-analysis',
  'model-performance-observatory',
]

const SCORING_MODULES = [
  'lib/scoring-engine.ts',
  'lib/ethoscore-v2.ts',
  'lib/decision-engine.ts',
]

describe('scoring path governance boundary (static guard)', () => {
  const root = process.cwd()

  for (const modulePath of SCORING_MODULES) {
    it(`${modulePath} contains no reference to any Phase 2 outcome/historical table`, () => {
      const content = readFileSync(join(root, modulePath), 'utf8')
      const offenders = FORBIDDEN_TABLES.filter(table => content.includes(table))
      expect(offenders).toEqual([])
    })

    it(`${modulePath} does not import the performance-windows calculation module`, () => {
      const content = readFileSync(join(root, modulePath), 'utf8')
      const offenders = FORBIDDEN_MODULES.filter(mod => content.includes(mod))
      expect(offenders).toEqual([])
    })
  }
})
