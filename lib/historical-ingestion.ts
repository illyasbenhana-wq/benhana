import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { parseCsv } from './backtest-engine'

// Phase 2, Step 4 — Historical Ingestion.
//
// Storage + validation foundation ONLY: parses a lender's historical CSV,
// validates rows deterministically, computes a stable duplicate
// fingerprint, and inserts into the existing Step 1 tables
// (historical_import_batches, historical_decision_records). Writes ONLY
// those two tables. Never touches decision_records/applications/scores/
// data_snapshots/model_versions/outcomes/performance_windows, never
// invokes scoring, never replays a decision. Historical records are
// evidence, not native EthosFi decisions -- origin is always 'imported'
// (the only value the Step 1 schema's CHECK constraint allows).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Same controlled vocabulary as Step 2's outcomes.status — reused, not
// redefined, so a mapped "status" column is judged by the one vocabulary
// this system already recognizes.
const OUTCOME_STATUSES = new Set([
  'current', 'delinquent_30', 'delinquent_60', 'delinquent_90',
  'default', 'write_off', 'repaid_full', 'repaid_early',
  'restructured', 'withdrawn',
])

// Explicit, auditable field mapping: target field name -> source CSV
// column header, or null if the lender's file doesn't have that field.
// decision_date is the only structurally required target -- everything
// else is optional and simply omitted from normalized_data if unmapped.
// No auto-guessing (unlike lib/backtest-engine.ts's guessMapping) — the
// caller must supply this explicitly, per the "do not silently guess
// mappings" requirement.
export interface HistoricalFieldMapping {
  decision_date: string
  status: string | null
  loan_amount: string | null
  external_id: string | null
}

export interface IngestHistoricalCsvParams {
  organizationId: string
  sourceLenderOrgId: string
  importedBy: string | null
  csv: string
  mapping: HistoricalFieldMapping
}

export interface IngestHistoricalCsvResult {
  success: boolean
  error?: string
  batchId?: string
  rowCount: number
  acceptedCount: number
  rejectedCount: number
  duplicateCount: number
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value)
}

function isValidDate(value: string): boolean {
  return value.trim() !== '' && !Number.isNaN(new Date(value).getTime())
}

interface NormalizeResult {
  normalized: Record<string, unknown>
  reasons: string[]
}

// Deterministic, structural validation only — no statistical/quality
// modeling (that's the explicitly out-of-scope future Data Quality
// Engine). A row either normalizes cleanly or is rejected with an
// explicit machine-readable reason; nothing is silently coerced.
function normalizeRow(row: Record<string, string | number | undefined>, mapping: HistoricalFieldMapping): NormalizeResult {
  const reasons: string[] = []
  const normalized: Record<string, unknown> = {}

  const decisionDateRaw = mapping.decision_date ? String(row[mapping.decision_date] ?? '').trim() : ''
  if (!decisionDateRaw) {
    reasons.push('MISSING_DECISION_DATE')
  } else if (!isValidDate(decisionDateRaw)) {
    reasons.push('INVALID_DECISION_DATE')
  } else {
    normalized.decision_date = new Date(decisionDateRaw).toISOString()
  }

  if (mapping.status) {
    const statusRaw = String(row[mapping.status] ?? '').trim().toLowerCase()
    if (statusRaw) {
      if (!OUTCOME_STATUSES.has(statusRaw)) {
        reasons.push('INVALID_STATUS_VALUE')
      } else {
        normalized.status = statusRaw
      }
    }
  }

  if (mapping.loan_amount) {
    const amountRaw = String(row[mapping.loan_amount] ?? '').trim()
    if (amountRaw) {
      const amount = Number(amountRaw)
      if (Number.isNaN(amount)) {
        reasons.push('INVALID_LOAN_AMOUNT')
      } else {
        normalized.loan_amount = amount
      }
    }
  }

  if (mapping.external_id) {
    const externalIdRaw = String(row[mapping.external_id] ?? '').trim()
    if (externalIdRaw) {
      if (!isValidUuid(externalIdRaw)) {
        reasons.push('INVALID_EXTERNAL_ID_UUID')
      } else {
        normalized.external_id = externalIdRaw
      }
    }
  }

  return { normalized, reasons }
}

// Stable across re-imports of the same logical row: derived only from
// organization/source scope + the normalized (mapped) field values —
// never raw_payload text, created_at/imported_at, or any random id.
function computeFingerprint(organizationId: string, sourceLenderOrgId: string, normalized: Record<string, unknown>): string {
  const sortedKeys = Object.keys(normalized).sort()
  const canonical = JSON.stringify({
    organization_id: organizationId,
    source_lender_org_id: sourceLenderOrgId,
    fields: sortedKeys.map(k => [k, normalized[k]]),
  })
  return createHash('sha256').update(canonical).digest('hex')
}

function mappedFieldCount(mapping: HistoricalFieldMapping): number {
  return [mapping.decision_date, mapping.status, mapping.loan_amount, mapping.external_id].filter(Boolean).length
}

export async function ingestHistoricalCsv(params: IngestHistoricalCsvParams): Promise<IngestHistoricalCsvResult> {
  const { organizationId, sourceLenderOrgId, importedBy, csv, mapping } = params

  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database not configured', rowCount: 0, acceptedCount: 0, rejectedCount: 0, duplicateCount: 0 }
  }

  if (!mapping.decision_date || mapping.decision_date.trim() === '') {
    return { success: false, error: 'mapping.decision_date is required', rowCount: 0, acceptedCount: 0, rejectedCount: 0, duplicateCount: 0 }
  }

  const { headers, rows } = parseCsv(csv)
  if (rows.length === 0) {
    return { success: false, error: 'CSV has no data rows', rowCount: 0, acceptedCount: 0, rejectedCount: 0, duplicateCount: 0 }
  }
  if (!headers.includes(mapping.decision_date)) {
    return { success: false, error: `mapping.decision_date ("${mapping.decision_date}") does not match any CSV column header`, rowCount: 0, acceptedCount: 0, rejectedCount: 0, duplicateCount: 0 }
  }

  // Snapshot existing fingerprints for this (org, source_lender_org) pair
  // once, up front — a per-row query would work too but this avoids N
  // round-trips and still catches duplicates both against prior batches
  // and against repeats within this same file.
  const { data: existingRows, error: existingErr } = await supabase
    .from('historical_decision_records')
    .select('fingerprint')
    .eq('organization_id', organizationId)
    .eq('source_lender_org_id', sourceLenderOrgId)

  if (existingErr) {
    return { success: false, error: existingErr.message, rowCount: 0, acceptedCount: 0, rejectedCount: 0, duplicateCount: 0 }
  }
  const seenFingerprints = new Set((existingRows ?? []).map(r => r.fingerprint as string))

  const mappedCount = mappedFieldCount(mapping)
  const recordsToInsert: Record<string, unknown>[] = []
  let acceptedCount = 0
  let rejectedCount = 0
  let duplicateCount = 0

  for (const row of rows) {
    const { normalized, reasons } = normalizeRow(row, mapping)
    const fingerprint = computeFingerprint(organizationId, sourceLenderOrgId, normalized)

    if (reasons.length === 0 && seenFingerprints.has(fingerprint)) {
      duplicateCount += 1
      continue // never inserted as a second historical_decision_records row
    }
    if (reasons.length === 0) {
      seenFingerprints.add(fingerprint) // dedupe repeats within this same file too
    }

    const completedFields = Object.keys(normalized).length
    const completenessRatio = mappedCount > 0 ? completedFields / mappedCount : null

    const isAccepted = reasons.length === 0
    if (isAccepted) acceptedCount += 1
    else rejectedCount += 1

    recordsToInsert.push({
      organization_id: organizationId,
      source_lender_org_id: sourceLenderOrgId,
      imported_by: importedBy,
      origin: 'imported',
      raw_payload: row,
      normalized_data: isAccepted ? normalized : null,
      // data_quality_score deliberately left null: completeness is the
      // only currently-defensible signal (see completeness_ratio below);
      // "quality" implies more than completeness (accuracy, consistency)
      // which cannot be assessed from structural validation alone, and
      // fabricating a combined score would misrepresent that.
      data_quality_score: null,
      completeness_ratio: isAccepted ? completenessRatio : null,
      validation_status: isAccepted ? 'accepted' : 'rejected',
      validation_reasons: reasons.length > 0 ? reasons : null,
      fingerprint,
    })
  }

  // import_batch_id is populated after the batch insert below — insert
  // the batch first, THEN the records with row_count/accepted_count/
  // rejected_count/duplicate_count already known, avoiding a separate
  // UPDATE (historical_import_batches is append-only).
  const { data: batch, error: batchErr } = await supabase
    .from('historical_import_batches')
    .insert({
      organization_id: organizationId,
      source_lender_org_id: sourceLenderOrgId,
      imported_by: importedBy,
      field_mapping: mapping,
      row_count: rows.length,
      accepted_count: acceptedCount,
      rejected_count: rejectedCount,
      duplicate_count: duplicateCount,
      batch_status: 'completed',
    })
    .select('id')
    .single()

  if (batchErr || !batch) {
    return { success: false, error: batchErr?.message ?? 'Failed to create import batch', rowCount: rows.length, acceptedCount: 0, rejectedCount: 0, duplicateCount: 0 }
  }

  if (recordsToInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('historical_decision_records')
      .insert(recordsToInsert.map(r => ({ ...r, import_batch_id: batch.id })))

    if (insertErr) {
      return { success: false, error: insertErr.message, batchId: batch.id, rowCount: rows.length, acceptedCount: 0, rejectedCount: 0, duplicateCount: 0 }
    }
  }

  return {
    success: true,
    batchId: batch.id,
    rowCount: rows.length,
    acceptedCount,
    rejectedCount,
    duplicateCount,
  }
}
