import { createClient } from '@supabase/supabase-js'
import { log, alertDecisionRecordPersistFailed } from './logger'
import type { ScoreFactor } from '@/types'

export type AiProvider = 'claude' | 'palantir' | 'fallback'

// ─── Decision lineage persistence ───────────────────────────────────────────
//
// Historically this function inserted into `audit_events` — but that table's
// real schema (case_id, case_ref, analyst, action, description, severity;
// see supabase/migrations and __tests__/setup-test-db.sql) has never matched
// the fields this function tried to write (audit_id, input_snapshot,
// model_version, prompt_version, ai_provider, raw_prompt, raw_response).
// That insert has been silently failing against the real database since it
// was written — `audit_events` is the case-investigation audit trail and was
// never meant to hold scoring-decision snapshots.
//
// This function now writes to the tables actually designed for this job
// (supabase/migrations/20260827000000_add_decision_lineage_tables.sql):
// model_versions (lazily upserted) -> data_snapshots (immutable input copy)
// -> decision_records (the durable, historically-stable decision snapshot).
// `audit_events` (the real case audit trail) is untouched by this file.

export type SystemDecision = 'approved' | 'declined' | 'review'

export interface AuditInput {
  applicationId: string
  orgId: string
  source: 'apply_flow' | 'partner_api'
  inputSnapshot: Record<string, unknown>

  scoreId: string | null
  scoreVersion: 'v1' | 'v2'
  modelVersion: string
  promptVersion: string
  modelRequested: string | null
  modelResponded: string | null
  aiProvider: AiProvider
  rawPrompt: string
  rawResponse: string

  ethoScore: number
  riskBand: string
  recommendation: string
  signals: ScoreFactor[]
  scorePillars: Record<string, unknown> | null

  decision: SystemDecision
  reasonCodes: string[]
  confidence: number
  requiresHumanReview: boolean
}

export interface AuditRecord {
  decisionRecordId: string | null
  applicationId: string
  createdAt: string
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// 42703 = undefined_column (direct Postgres), PGRST204/PGRST205 = PostgREST
// schema-cache miss for an unknown column/table. All mean this migration
// hasn't been applied to this database yet — same degrade-gracefully
// convention already established for the calibration-fields migration in
// app/api/score/route.ts, not a new pattern.
const MIGRATION_NOT_APPLIED_CODES = new Set(['42703', 'PGRST204', 'PGRST205', '42P01'])

export async function recordAuditEvent(input: AuditInput): Promise<AuditRecord> {
  const createdAt = new Date().toISOString()
  const supabase = getSupabase()

  if (!supabase) {
    log.warn('supabase unavailable, decision record not persisted', { applicationId: input.applicationId })
    return { decisionRecordId: null, applicationId: input.applicationId, createdAt }
  }

  try {
    // 1. model_versions — lazy upsert on the natural key.
    const { data: modelVersion, error: modelVersionError } = await supabase
      .from('model_versions')
      .upsert(
        {
          score_version: input.scoreVersion,
          prompt_version: input.promptVersion,
          model_requested: input.modelRequested,
          model_responded: input.modelResponded,
        },
        { onConflict: 'score_version,prompt_version,model_requested,model_responded', ignoreDuplicates: false }
      )
      .select('id')
      .single()

    if (modelVersionError || !modelVersion) {
      if (modelVersionError && MIGRATION_NOT_APPLIED_CODES.has(modelVersionError.code ?? '')) {
        log.warn('decision-lineage tables missing — migration not applied yet', {
          applicationId: input.applicationId,
          error: modelVersionError.message,
        })
      } else {
        log.error('model_versions upsert failed', { applicationId: input.applicationId, error: modelVersionError?.message })
      }
      alertDecisionRecordPersistFailed({ applicationId: input.applicationId, error: modelVersionError?.message })
      return { decisionRecordId: null, applicationId: input.applicationId, createdAt }
    }

    // 2. data_snapshots — immutable copy of the input as received.
    const { data: snapshot, error: snapshotError } = await supabase
      .from('data_snapshots')
      .insert({
        organization_id: input.orgId,
        application_id: input.applicationId,
        source: input.source,
        raw_data: input.inputSnapshot,
      })
      .select('id')
      .single()

    if (snapshotError || !snapshot) {
      log.error('data_snapshots insert failed', { applicationId: input.applicationId, error: snapshotError?.message })
      alertDecisionRecordPersistFailed({ applicationId: input.applicationId, error: snapshotError?.message })
      return { decisionRecordId: null, applicationId: input.applicationId, createdAt }
    }

    // 3. decision_records — the durable snapshot. Never updated after
    //    insert; a correction is always a new row (see migration comment).
    const { data: record, error: recordError } = await supabase
      .from('decision_records')
      .insert({
        organization_id: input.orgId,
        application_id: input.applicationId,
        score_id: input.scoreId,
        data_snapshot_id: snapshot.id,
        model_version_id: modelVersion.id,
        signals_snapshot: input.signals,
        score_pillars_snapshot: input.scorePillars,
        etho_score: input.ethoScore,
        risk_band: input.riskBand,
        recommendation: input.recommendation,
        decision: input.decision,
        decision_reason: input.reasonCodes,
        confidence: input.confidence,
        requires_human_review: input.requiresHumanReview,
        decided_by: 'system',
      })
      .select('id')
      .single()

    if (recordError || !record) {
      log.error('decision_records insert failed', { applicationId: input.applicationId, error: recordError?.message })
      alertDecisionRecordPersistFailed({ applicationId: input.applicationId, error: recordError?.message })
      return { decisionRecordId: null, applicationId: input.applicationId, createdAt }
    }

    return { decisionRecordId: record.id, applicationId: input.applicationId, createdAt }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log.error('decision lineage persistence threw', { applicationId: input.applicationId, error: errMsg })
    alertDecisionRecordPersistFailed({ applicationId: input.applicationId, error: errMsg })
    return { decisionRecordId: null, applicationId: input.applicationId, createdAt }
  }
}
