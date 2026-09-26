-- Bank-statement verification (Ocrolus), sandbox/test first.
--
-- Implements the async lifecycle and evidence-snapshot extension from the
-- Ocrolus reference design (CLAUDE.md). Additive only: no existing row,
-- column, trigger or index is modified, and commit_decision_package keeps
-- its exact signature (existing callers are unaffected).
--
-- MUST be applied to ethosfi-test (gwvhlemfubmcnbzdarnx) first and verified
-- there, per the established test/production gate. Applied manually via
-- the Supabase SQL Editor, like every migration in this repository.
--
-- Before applying, confirm the auto-generated constraint name used in
-- step 1 (read-only):
--
--   select conname from pg_constraint
--   where conrelid = 'data_snapshots'::regclass and contype = 'c';
--
-- Expected: data_snapshots_source_check. If it differs, replace it below —
-- DROP CONSTRAINT IF EXISTS would otherwise silently no-op and the ADD
-- would leave two overlapping checks (the old one still rejecting
-- 'ocrolus').

-- Also confirm step 5's workflow_events constraint before applying:
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'workflow_events'::regclass and contype = 'c';
--   select distinct event_type from workflow_events;
--
-- Step 5 re-creates workflow_events_event_type_check as a superset of
-- every event type the code emits. If the live list contains a value not
-- in step 5's list, add it there first (otherwise the ADD fails on
-- existing rows).

-- 1. data_snapshots.source: allow the verified-bank-data snapshot.
alter table data_snapshots
  drop constraint if exists data_snapshots_source_check;
alter table data_snapshots
  add constraint data_snapshots_source_check
  check (source in ('apply_flow', 'partner_api', 'ocrolus'));

-- 2. bank_verifications: one row per verification attempt, tracking the
--    external async process (create book -> upload -> verification ->
--    webhook -> re-score). Deliberately holds NO bank data: statement
--    figures and authenticity results live only in the immutable
--    data_snapshots row written by commit_decision_package at re-score
--    time — the one evidence record of what was actually scored.
create table if not exists bank_verifications (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id),
  application_id      uuid not null references applications(id),
  -- How the statement arrived, so re-score provenance can attribute the
  -- self-reported form correctly (applicant vs lender provided).
  channel             text not null check (channel in ('apply_flow', 'partner_api')),
  provider            text not null default 'ocrolus',
  -- 'mock' = sandbox simulation, never real verification. Recorded so a
  -- mock result can never be mistaken for a verified one after the fact.
  mode                text not null check (mode in ('live', 'mock')),
  status              text not null check (status in (
                        'submitting', 'processing', 'scoring', 'verified', 'rejected', 'failed'
                      )),
  provider_book_uuid  text,
  provider_doc_uuid   text,
  -- Both must be present before re-scoring (event order is not
  -- guaranteed by the provider — open question with Ocrolus).
  book_verified_at    timestamptz,
  detect_outcome      text check (detect_outcome in ('found', 'not_found', 'unable')),
  review_required     boolean,
  failure_reason      text,
  result_score_id     uuid,
  result_decision_record_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists bank_verifications_application_id_idx on bank_verifications(application_id);
create index if not exists bank_verifications_organization_id_idx on bank_verifications(organization_id);
create unique index if not exists bank_verifications_provider_book_uuid_idx
  on bank_verifications(provider_book_uuid) where provider_book_uuid is not null;
-- At most one in-flight verification per application.
create unique index if not exists bank_verifications_one_active_per_application
  on bank_verifications(application_id) where status in ('submitting', 'processing', 'scoring');

-- Service-role access only (same as data_snapshots / decision_records).
alter table bank_verifications enable row level security;

-- 3. Decision rule for decisions that had a bank-verification outcome as
--    input: v1 thresholds + document-authenticity signals route to human
--    review (lib/decision-engine.ts DECISION_RULE_VERSION_BANK_VERIFIED).
insert into decision_rules (version, description, thresholds)
values (
  'threshold-70-50-docauth-review-v1',
  'threshold-70-50-v1 thresholds, plus: any bank-statement authenticity signal (or inability to assess authenticity) routes to human review in every score band — never an automatic approval or decline. See lib/decision-engine.ts makeDecision().',
  '{"approve_above": 70, "review_min": 50, "review_max": 70, "decline_below": 50, "document_authenticity_signal": "human_review"}'::jsonb
)
on conflict (version) do nothing;

-- 4. commit_decision_package: identical to 20260903000002 except that
--    provenance_records.provider / provider_reference are now written from
--    each entry (null when absent — every existing caller passes neither,
--    so their rows are unchanged).
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
  insert into model_versions (score_version, prompt_version, model_requested, model_responded)
  values (p_score_version, p_prompt_version, p_model_requested, p_model_responded)
  on conflict (score_version, prompt_version, model_requested, model_responded)
  do update set score_version = excluded.score_version
  returning id into v_model_version_id;

  insert into data_snapshots (organization_id, application_id, source, raw_data)
  values (p_organization_id, p_application_id, p_source, p_raw_data)
  returning id into v_data_snapshot_id;

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

  select id into v_decision_rule_id from decision_rules where version = p_decision_rule_version;

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

  for v_entry in select * from jsonb_array_elements(p_provenance_entries)
  loop
    insert into provenance_records (
      organization_id, decision_record_id, signal_level, source_type,
      provider, provider_reference,
      field_name, raw_value, normalized_value, transformation,
      retrieved_at, data_snapshot_id, model_version_id
    )
    values (
      p_organization_id, v_decision_record_id,
      v_entry->>'signal_level', v_entry->>'source_type',
      v_entry->>'provider', v_entry->>'provider_reference',
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

-- 5. workflow_events.event_type: superset of every value the code emits.
--    20260702000000 is the last migration that set this list; the code has
--    since also emitted 'decision_replayed' and 'outcome_recorded' (with no
--    migration adding them — see the pre-check at the top of this file).
alter table workflow_events drop constraint if exists workflow_events_event_type_check;
alter table workflow_events add constraint workflow_events_event_type_check
  check (event_type in (
    'status_change', 'assignment', 'note', 'score_complete', 'ai_review',
    'ethoscore_assessed', 'decision_replayed', 'outcome_recorded',
    'bank_verification_submitted', 'bank_verification_completed'
  ));
