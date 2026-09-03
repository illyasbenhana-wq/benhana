import { createClient } from '@supabase/supabase-js'
import { log } from './logger'

// Data Provenance layer (see supabase/migrations/
// 20260829000000_add_provenance_records.sql). Answers "where did this
// information come from" for the inputs/signals behind a decision.
//
// Write path is wired into the existing decision-lineage persistence
// (lib/audit-engine.ts's recordAuditEvent()) — provenance records are
// generated as a best-effort, non-blocking side effect of the same call
// that already writes model_versions/data_snapshots/decision_records,
// never a separate write triggered from the scoring path itself. This
// module has no import from, and is never imported by,
// lib/scoring-engine.ts / lib/ethoscore-v2.ts / lib/decision-engine.ts.

export type SignalLevel = 'raw_input' | 'derived_signal' | 'model_interpretation' | 'decision_output'
export type SourceType = 'applicant_provided' | 'lender_provided' | 'internally_derived' | 'model_generated' | 'external_provider'

export interface ProvenanceRecordInput {
  organizationId: string
  decisionRecordId: string
  signalLevel: SignalLevel
  sourceType: SourceType
  fieldName: string
  rawValue?: unknown
  normalizedValue?: unknown
  transformation?: string | null
  confidence?: number | null
  retrievedAt: string
  validAt?: string | null
  dataSnapshotId?: string | null
  modelVersionId?: string | null
  // Provider-agnostic hooks for a future external-provider integration
  // (bank data, document intelligence, credit bureau, KYC/KYB, sanctions
  // screening, open banking). No such integration is implemented in this
  // phase — both fields are always null/omitted today.
  provider?: string | null
  providerReference?: string | null
}

export interface ProvenanceRecord {
  id: string
  organization_id: string
  decision_record_id: string
  signal_level: SignalLevel
  source_type: SourceType
  provider: string | null
  provider_reference: string | null
  field_name: string
  raw_value: unknown
  normalized_value: unknown
  transformation: string | null
  confidence: number | null
  retrieved_at: string
  valid_at: string | null
  data_snapshot_id: string | null
  model_version_id: string | null
  created_at: string
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// 42703 = undefined_column, PGRST204/PGRST205 = PostgREST schema-cache
// miss, 42P01 = undefined_table — this migration not applied yet on the
// target database. Same degrade-gracefully convention as
// lib/audit-engine.ts's MIGRATION_NOT_APPLIED_CODES.
const MIGRATION_NOT_APPLIED_CODES = new Set(['42703', 'PGRST204', 'PGRST205', '42P01'])

export interface RecordProvenanceResult {
  success: boolean
  written: number
  error?: string
}

// Insert-only, best-effort, never throws — mirrors recordAuditEvent()'s
// own contract exactly, so a provenance-write failure can never affect
// the decision or audit trail that already succeeded.
export async function recordProvenance(entries: ProvenanceRecordInput[]): Promise<RecordProvenanceResult> {
  if (entries.length === 0) return { success: true, written: 0 }

  const supabase = getSupabase()
  if (!supabase) {
    log.warn('supabase unavailable, provenance not persisted', { count: entries.length })
    return { success: false, written: 0, error: 'Database not configured' }
  }

  try {
    const rows = entries.map(e => ({
      organization_id: e.organizationId,
      decision_record_id: e.decisionRecordId,
      signal_level: e.signalLevel,
      source_type: e.sourceType,
      provider: e.provider ?? null,
      provider_reference: e.providerReference ?? null,
      field_name: e.fieldName,
      raw_value: e.rawValue ?? null,
      normalized_value: e.normalizedValue ?? null,
      transformation: e.transformation ?? null,
      confidence: e.confidence ?? null,
      retrieved_at: e.retrievedAt,
      valid_at: e.validAt ?? null,
      data_snapshot_id: e.dataSnapshotId ?? null,
      model_version_id: e.modelVersionId ?? null,
    }))

    const { error, count } = await supabase.from('provenance_records').insert(rows, { count: 'exact' })

    if (error) {
      if (MIGRATION_NOT_APPLIED_CODES.has(error.code ?? '')) {
        log.warn('provenance_records table missing — migration not applied yet', { error: error.message })
      } else {
        log.error('provenance_records insert failed', { error: error.message, count: rows.length })
      }
      return { success: false, written: 0, error: error.message }
    }

    return { success: true, written: count ?? rows.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log.error('recordProvenance threw unexpectedly', { error: message })
    return { success: false, written: 0, error: message }
  }
}

export interface GetProvenanceResult {
  success: boolean
  records: ProvenanceRecord[]
  error?: string
}

// Tenant-scoped read. decision_record_id ownership must be verified by
// the caller (see app/api/decision-replay/[id]/provenance/route.ts)
// before calling this — this function itself only scopes by
// organization_id, matching the pattern already used by
// lib/decision-replay.ts.
export async function getProvenanceForDecision(decisionRecordId: string, organizationId: string): Promise<GetProvenanceResult> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, records: [], error: 'Database not configured' }
  }

  const { data, error } = await supabase
    .from('provenance_records')
    .select('id, organization_id, decision_record_id, signal_level, source_type, provider, provider_reference, field_name, raw_value, normalized_value, transformation, confidence, retrieved_at, valid_at, data_snapshot_id, model_version_id, created_at')
    .eq('organization_id', organizationId)
    .eq('decision_record_id', decisionRecordId)
    .order('retrieved_at', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    return { success: false, records: [], error: error.message }
  }

  return { success: true, records: (data ?? []) as ProvenanceRecord[] }
}
