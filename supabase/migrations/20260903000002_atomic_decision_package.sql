-- Atomic Decision Package (Production Closure, Part 1/2 of 2).
--
-- Confirmed by the Production Readiness & Decision Integrity Audit
-- (2026-09-03): app/api/score/route.ts's `scores` insert and
-- lib/audit-engine.ts's recordAuditEvent() (model_versions ->
-- data_snapshots -> decision_records -> provenance_records) are five
-- separate, sequential Supabase calls with no transactional boundary.
-- A failure anywhere from the second call onward was silently swallowed
-- (recordAuditEvent() is explicitly designed to "never throw") while the
-- API still returned HTTP 200 with a persisted `scores` row and an
-- incomplete or entirely absent evidence trail.
--
-- This migration adds a single Postgres function that performs all five
-- writes inside one implicit transaction: a plain plpgsql function with
-- no internal exception handling rolls back everything it did on any
-- error, by default Postgres behavior -- no new mechanism is invented,
-- this relies entirely on standard transactional semantics. Calling code
-- (lib/audit-engine.ts) is updated separately (application-layer change,
-- not part of this migration) to call this function via supabase.rpc()
-- instead of five separate .insert()/.upsert() calls, and to treat any
-- failure as a hard failure of the whole request -- no more "score
-- persisted, evidence silently missing."
--
-- Also adds:
--   1. decision_rules -- a small, append-only table recording which
--      versioned rule (thresholds) produced a decision, so a historical
--      decision_record does not depend on today's lib/decision-engine.ts
--      source code to explain itself. Referenced by the new
--      decision_records.decision_rule_id column.
--   2. applications.failure_reason -- a nullable text column so a
--      scoring failure can be recorded as an explicit, auditable
--      'failed' status instead of leaving the row at 'pending' forever
--      with no explanation. The application-layer change that actually
--      sets status='failed' + this column lives in app/api/score/route.ts,
--      not in this migration.
--
-- Does NOT touch: append-only triggers on data_snapshots/decision_records
-- (untouched, still enforced -- this function INSERTs, never UPDATEs or
-- DELETEs those tables), the FK correction already established live on
-- ethosfi-test (no FK is reintroduced here), scoring logic, decision
-- thresholds, or any existing Intelligence module.
--
-- MUST be applied to ethosfi-test first and verified there before any
-- production discussion, per the established gate (see CLAUDE.md) --
-- same as every prior migration in this project. NOT applied by this
-- session: no direct database DDL execution is available in this
-- environment (standing limitation, all session).

-- 1. decision_rules -- append-only registry of decision-rule versions.
create table if not exists decision_rules (
  id          uuid primary key default gen_random_uuid(),
  version     text not null unique,
  description text not null,
  thresholds  jsonb not null,
  created_at  timestamptz not null default now()
);

-- Seed the one rule version currently implemented by
-- lib/decision-engine.ts's makeDecision() (>70 approve, 50-70 review,
-- <50 decline). Idempotent: ON CONFLICT DO NOTHING so re-running this
-- migration never creates a duplicate or errors on a second apply.
insert into decision_rules (version, description, thresholds)
values (
  'threshold-70-50-v1',
  'EthoScore > 70 approved (no review); 50-70 inclusive requires human review; < 50 declined. See lib/decision-engine.ts makeDecision().',
  '{"approve_above": 70, "review_min": 50, "review_max": 70, "decline_below": 50}'::jsonb
)
on conflict (version) do nothing;

-- 2. decision_records.decision_rule_id -- nullable (existing rows predate
--    this column and remain valid; nothing here rewrites history).
alter table decision_records
  add column if not exists decision_rule_id uuid references decision_rules(id);

create index if not exists decision_records_decision_rule_id_idx
  on decision_records(decision_rule_id);

-- 3. applications.failure_reason -- nullable, additive.
alter table applications
  add column if not exists failure_reason text;

-- 4. The atomic commit function itself.
--
-- Deliberately takes plain scalar/jsonb parameters rather than a custom
-- composite type, to keep the calling code on the JS side a single
-- straightforward .rpc(name, { ...params }) call. Returns the four ids a
-- caller needs to continue (score_id, decision_record_id,
-- data_snapshot_id, model_version_id) as a single row.
--
-- p_provenance_entries: a jsonb array of
--   { field_name, signal_level, source_type, raw_value?, normalized_value?,
--     transformation?, model_version_ref boolean }
-- -- "model_version_ref: true" entries get model_version_id set to the
-- model_versions row resolved inside this function; all others get
-- data_snapshot_id set instead. This mirrors exactly the two entry
-- shapes lib/audit-engine.ts already constructed by hand before this
-- change (raw input fields vs. model-interpreted factors).
create or replace function commit_decision_package(
  p_organization_id     uuid,
  p_application_id      uuid,
  p_source              text,
  p_raw_data            jsonb,

  p_score_version       text,
  p_prompt_version      text,
  p_model_requested     text,
  p_model_responded     text,
  p_raw_prompt          text,
  p_raw_response        text,
  p_confidence_overall  text,

  p_etho_score          integer,
  p_risk_band           text,
  p_ai_summary          text,
  p_factors             jsonb,
  p_recommendation      text,
  p_model_version_label text,
  p_score_pillars       jsonb,

  p_decision            text,
  p_decision_reason     jsonb,
  p_confidence          numeric,
  p_requires_human_review boolean,
  p_decision_rule_version text,

  p_provenance_entries  jsonb default '[]'::jsonb
)
returns table (
  score_id          uuid,
  decision_record_id uuid,
  data_snapshot_id  uuid,
  model_version_id  uuid
)
language plpgsql
as $$
declare
  v_model_version_id  uuid;
  v_data_snapshot_id  uuid;
  v_score_id          uuid;
  v_decision_record_id uuid;
  v_decision_rule_id  uuid;
  v_entry             jsonb;
begin
  -- model_versions: lazy upsert on the natural key, same as before.
  insert into model_versions (score_version, prompt_version, model_requested, model_responded)
  values (p_score_version, p_prompt_version, p_model_requested, p_model_responded)
  on conflict (score_version, prompt_version, model_requested, model_responded)
  do update set score_version = excluded.score_version
  returning id into v_model_version_id;

  -- data_snapshots: immutable copy of the input as received.
  insert into data_snapshots (organization_id, application_id, source, raw_data)
  values (p_organization_id, p_application_id, p_source, p_raw_data)
  returning id into v_data_snapshot_id;

  -- scores: the mandatory, authoritative persisted score + decision.
  insert into scores (
    organization_id, application_id, etho_score, risk_band, recommendation,
    ai_summary, factors, model_version, raw_prompt, raw_response,
    score_version, score_pillars, prompt_version, model_requested,
    model_responded, confidence_overall
  )
  values (
    p_organization_id, p_application_id, p_etho_score, p_risk_band, p_recommendation,
    p_ai_summary, p_factors, p_model_version_label, p_raw_prompt, p_raw_response,
    p_score_version, p_score_pillars, p_prompt_version, p_model_requested,
    p_model_responded, p_confidence_overall
  )
  returning id into v_score_id;

  -- decision_rules lookup: resolve once here so callers never need to
  -- know the rule's uuid, only its stable version string.
  select id into v_decision_rule_id from decision_rules where version = p_decision_rule_version;

  -- decision_records: the durable, historically-stable decision snapshot.
  insert into decision_records (
    organization_id, application_id, score_id, data_snapshot_id, model_version_id,
    decision_rule_id, signals_snapshot, score_pillars_snapshot, etho_score, risk_band,
    recommendation, decision, decision_reason, confidence, requires_human_review, decided_by
  )
  values (
    p_organization_id, p_application_id, v_score_id, v_data_snapshot_id, v_model_version_id,
    v_decision_rule_id, p_factors, p_score_pillars, p_etho_score, p_risk_band,
    p_recommendation, p_decision, p_decision_reason, p_confidence, p_requires_human_review, 'system'
  )
  returning id into v_decision_record_id;

  -- provenance_records: field-level lineage, now committed inside the
  -- same atomic boundary as the decision it explains, instead of as a
  -- separate best-effort call after the fact.
  for v_entry in select * from jsonb_array_elements(p_provenance_entries)
  loop
    insert into provenance_records (
      organization_id, decision_record_id, signal_level, source_type,
      field_name, raw_value, normalized_value, transformation,
      retrieved_at, data_snapshot_id, model_version_id
    )
    values (
      p_organization_id, v_decision_record_id,
      v_entry->>'signal_level', v_entry->>'source_type',
      v_entry->>'field_name',
      v_entry->'raw_value', v_entry->'normalized_value', v_entry->>'transformation',
      now(),
      case when (v_entry->>'model_version_ref')::boolean is true then null else v_data_snapshot_id end,
      case when (v_entry->>'model_version_ref')::boolean is true then v_model_version_id else null end
    );
  end loop;

  return query select v_score_id, v_decision_record_id, v_data_snapshot_id, v_model_version_id;
end;
$$;
