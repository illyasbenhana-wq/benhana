import { createClient } from '@supabase/supabase-js'

// Phase 2, Step 5 — Decision Replay.
//
// Read-only reconstruction of the evidence/context that existed for a
// native decision_record, using ONLY the lineage the Phase 1 schema
// already provides (decision_records.data_snapshot_id / .model_version_id,
// both real FKs). Never writes anywhere. Never touches
// lib/scoring-engine.ts / lib/ethoscore-v2.ts / lib/decision-engine.ts —
// this is reconstruction of stored evidence, not a rescore. Never reads
// historical_decision_records (a completely separate analytical path —
// see lib/historical-ingestion.ts) and never calls
// lib/performance-windows.ts.
//
// Deliberately does NOT dereference decision_records.application_id or
// .score_id into the live applications/scores tables: those are plain,
// unconstrained uuid columns (see the Phase 1 FK correction) and the live
// rows they point at can have been edited or deleted since the decision
// was made. Surfacing their CURRENT state as "the evidence" would violate
// the point-in-time requirement this module exists to satisfy. The
// authoritative frozen evidence is data_snapshots.raw_data, which the
// database guarantees can never change after the fact (append-only
// trigger) — that's what's actually returned. application_id/score_id/
// decision_id are surfaced only as identifiers, not dereferenced.

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export interface ReplayResult {
  decision_record_id: string
  organization_id: string
  decided_at: string

  // Verbatim from decision_records — the original, immutable decision
  // output. Never recomputed, never re-derived.
  original_decision: {
    etho_score: number
    risk_band: string
    recommendation: string
    decision: string
    decision_reason: unknown
    confidence: number | null
    requires_human_review: boolean
    decided_by: string
    override_reason: string | null
  }

  // The exact model/prompt combination that produced this decision —
  // dereferenced from model_versions (an insert/upsert-only registry;
  // never the current production model).
  model_version: {
    id: string
    score_version: string
    prompt_version: string
    model_requested: string | null
    model_responded: string | null
  } | { available: false; reason: string }

  // The frozen input evidence captured at decision time — never the
  // current live application state.
  data_snapshot: {
    id: string
    captured_at: string
    source: string
    raw_data: Record<string, unknown>
  } | { available: false; reason: string }

  // Raw stored identifiers only — deliberately not dereferenced into
  // live applications/scores/decisions (see module doc comment above).
  lineage: {
    application_id: string | null
    score_id: string | null
    decision_id: string | null
  }

  // Explicitly separated per spec: information observed AFTER the
  // decision was made. Never used to alter original_decision/
  // data_snapshot/model_version above.
  post_decision_outcomes: Array<{
    id: string
    status: string
    observed_at: string
    superseded_outcome_id: string | null
  }>

  replayed_at: string
}

export type ReplayError =
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'QUERY_FAILED'; message: string }
  | { code: 'SERVICE_UNAVAILABLE'; message: string }

export type ReplayOutcome = { success: true; result: ReplayResult } | { success: false; error: ReplayError }

export async function replayDecision(decisionRecordId: string, organizationId: string): Promise<ReplayOutcome> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }
  }

  const { data: record, error: recordErr } = await supabase
    .from('decision_records')
    .select('id, organization_id, application_id, score_id, decision_id, data_snapshot_id, model_version_id, etho_score, risk_band, recommendation, decision, decision_reason, confidence, requires_human_review, decided_by, override_reason, decided_at')
    .eq('id', decisionRecordId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (recordErr) {
    return { success: false, error: { code: 'QUERY_FAILED', message: recordErr.message } }
  }
  if (!record) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'decision_record not found for this organization' } }
  }

  // model_version_id and data_snapshot_id are real, `not null` FKs on
  // decision_records (unlike application_id/score_id/decision_id) — they
  // should always resolve. Still handled defensively (never assumed) in
  // case of an unexpected read failure, rather than throwing.
  const { data: modelVersionRow, error: modelVersionErr } = await supabase
    .from('model_versions')
    .select('id, score_version, prompt_version, model_requested, model_responded')
    .eq('id', record.model_version_id)
    .maybeSingle()

  const { data: snapshotRow, error: snapshotErr } = await supabase
    .from('data_snapshots')
    .select('id, captured_at, source, raw_data')
    .eq('id', record.data_snapshot_id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  const { data: outcomeRows, error: outcomesErr } = await supabase
    .from('outcomes')
    .select('id, status, observed_at, superseded_outcome_id')
    .eq('organization_id', organizationId)
    .eq('decision_record_id', decisionRecordId)
    .order('observed_at', { ascending: true })
    .order('created_at', { ascending: true })

  if (modelVersionErr || snapshotErr || outcomesErr) {
    const message = modelVersionErr?.message ?? snapshotErr?.message ?? outcomesErr?.message ?? 'Replay evidence lookup failed'
    return { success: false, error: { code: 'QUERY_FAILED', message } }
  }

  const result: ReplayResult = {
    decision_record_id: record.id,
    organization_id: record.organization_id,
    decided_at: record.decided_at,
    original_decision: {
      etho_score: record.etho_score,
      risk_band: record.risk_band,
      recommendation: record.recommendation,
      decision: record.decision,
      decision_reason: record.decision_reason,
      confidence: record.confidence,
      requires_human_review: record.requires_human_review,
      decided_by: record.decided_by,
      override_reason: record.override_reason,
    },
    model_version: modelVersionRow ?? { available: false, reason: 'model_versions row not found' },
    data_snapshot: snapshotRow ?? { available: false, reason: 'data_snapshots row not found' },
    lineage: {
      application_id: record.application_id,
      score_id: record.score_id,
      decision_id: record.decision_id,
    },
    post_decision_outcomes: outcomeRows ?? [],
    replayed_at: new Date().toISOString(),
  }

  return { success: true, result }
}
