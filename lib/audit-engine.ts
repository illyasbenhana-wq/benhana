import { createClient } from '@supabase/supabase-js'
import { log, alertDecisionRecordPersistFailed } from './logger'
import type { ScoreFactor } from '@/types'

export type AiProvider = 'claude' | 'palantir' | 'fallback'

// ─── Atomic decision-package persistence ────────────────────────────────────
//
// Production Closure (2026-09-03): this function used to perform five
// separate, sequential Supabase calls (scores insert in the caller,
// model_versions upsert, data_snapshots insert, decision_records insert,
// provenance_records insert here) with no transactional boundary — any
// failure from the second write onward was silently swallowed (this
// function was explicitly designed to "never throw") while the API still
// returned HTTP 200 with a persisted score and an incomplete or entirely
// absent evidence trail. That was the P0 finding from the Production
// Readiness & Decision Integrity Audit.
//
// This function now performs exactly ONE call:
// supabase.rpc('commit_decision_package', ...), a single Postgres
// function (supabase/migrations/20260903000002_atomic_decision_package.sql)
// that inserts scores, model_versions, data_snapshots, decision_records,
// and provenance_records inside one implicit database transaction — a
// plain plpgsql function with no internal exception handling rolls back
// everything on any error, standard Postgres behavior, no new mechanism
// invented. If the RPC fails, this function now returns success: false
// instead of swallowing the error — the caller (app/api/score/route.ts)
// is responsible for treating that as a hard failure of the whole
// request, not a degraded-but-successful one.
//
// `audit_events` (the real case-investigation audit trail, unrelated
// schema) remains untouched by this file, as before.

export type SystemDecision = 'approved' | 'declined' | 'review'

export interface DecisionPackageInput {
  applicationId: string
  orgId: string
  source: 'apply_flow' | 'partner_api'
  inputSnapshot: Record<string, unknown>

  scoreVersion: 'v1' | 'v2'
  promptVersion: string
  modelRequested: string | null
  modelResponded: string | null
  // What scores.model_version stores — historically a human-readable
  // label (e.g. result.model_version), distinct from modelResponded
  // (the SDK's own reported model id).
  modelVersionLabel: string
  rawPrompt: string
  rawResponse: string
  confidenceOverall: string | null

  ethoScore: number
  riskBand: string
  aiSummary: string
  factors: ScoreFactor[]
  recommendation: string
  scorePillars: Record<string, unknown> | null

  decision: SystemDecision
  reasonCodes: string[]
  confidence: number
  requiresHumanReview: boolean
}

export type DecisionPackageResult =
  | { success: true; scoreId: string; decisionRecordId: string; dataSnapshotId: string; modelVersionId: string }
  | { success: false; error: string }

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// 42703 = undefined_column, PGRST202/PGRST204/PGRST205 = PostgREST
// schema-cache miss for an unknown column/table/function, 42P01 =
// undefined_table, 42883 = undefined_function. All mean this migration
// (or the RPC it defines) hasn't been applied to this database yet —
// same degrade-gracefully diagnostic convention already established for
// the calibration-fields migration, just no longer silently swallowed:
// the caller must still treat this as a failed request, but the log
// message distinguishes "not applied yet" from a genuine runtime error.
const MIGRATION_NOT_APPLIED_CODES = new Set(['42703', 'PGRST202', 'PGRST204', 'PGRST205', '42P01', '42883'])

interface RpcRow {
  score_id: string
  decision_record_id: string
  data_snapshot_id: string
  model_version_id: string
}

export async function commitDecisionPackage(input: DecisionPackageInput, decisionRuleVersion: string): Promise<DecisionPackageResult> {
  const supabase = getSupabase()
  if (!supabase) {
    log.error('supabase unavailable, decision package not persisted', { applicationId: input.applicationId })
    return { success: false, error: 'Database not configured' }
  }

  const sourceType = input.source === 'apply_flow' ? 'applicant_provided' : 'lender_provided'
  const provenanceEntries = [
    ...Object.entries(input.inputSnapshot).map(([field_name, raw_value]) => ({
      field_name, signal_level: 'raw_input', source_type: sourceType, raw_value, model_version_ref: false,
    })),
    ...input.factors.map(f => ({
      field_name: f.name, signal_level: 'model_interpretation', source_type: 'model_generated',
      normalized_value: { score: f.score, weight: f.weight }, transformation: f.rationale, model_version_ref: true,
    })),
  ]

  try {
    const { data, error } = await supabase
      .rpc('commit_decision_package', {
        p_organization_id: input.orgId,
        p_application_id: input.applicationId,
        p_source: input.source,
        p_raw_data: input.inputSnapshot,
        p_score_version: input.scoreVersion,
        p_prompt_version: input.promptVersion,
        p_model_requested: input.modelRequested,
        p_model_responded: input.modelResponded,
        p_raw_prompt: input.rawPrompt,
        p_raw_response: input.rawResponse,
        p_confidence_overall: input.confidenceOverall,
        p_etho_score: input.ethoScore,
        p_risk_band: input.riskBand,
        p_ai_summary: input.aiSummary,
        p_factors: input.factors,
        p_recommendation: input.recommendation,
        p_model_version_label: input.modelVersionLabel,
        p_score_pillars: input.scorePillars,
        p_decision: input.decision,
        p_decision_reason: input.reasonCodes,
        p_confidence: input.confidence,
        p_requires_human_review: input.requiresHumanReview,
        p_decision_rule_version: decisionRuleVersion,
        p_provenance_entries: provenanceEntries,
      })
      .single()

    if (error || !data) {
      const code = (error as { code?: string } | null)?.code ?? ''
      if (MIGRATION_NOT_APPLIED_CODES.has(code)) {
        log.error('commit_decision_package RPC missing — migration not applied to this database', {
          applicationId: input.applicationId, error: error?.message,
        })
      } else {
        log.error('commit_decision_package RPC failed', { applicationId: input.applicationId, error: error?.message })
      }
      alertDecisionRecordPersistFailed({ applicationId: input.applicationId, error: error?.message ?? 'commit_decision_package returned no row' })
      return { success: false, error: error?.message ?? 'commit_decision_package returned no row' }
    }

    const row = data as RpcRow
    return { success: true, scoreId: row.score_id, decisionRecordId: row.decision_record_id, dataSnapshotId: row.data_snapshot_id, modelVersionId: row.model_version_id }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    log.error('commit_decision_package RPC threw', { applicationId: input.applicationId, error: errMsg })
    alertDecisionRecordPersistFailed({ applicationId: input.applicationId, error: errMsg })
    return { success: false, error: errMsg }
  }
}
