-- Additive schema support for EthoScore v2 (Fable 5) calibration prep.
-- NOT applied to any database by Claude. Review, then run manually
-- (Supabase SQL editor or `supabase db push`) when ready.
--
-- Scope, per project rules: additive only. No destructive ALTER, no
-- renamed/removed columns, no backfill. Existing rows keep these columns
-- NULL, which means "scored under v1" (the pre-existing behavior).

-- 1. scores: traceability columns for which prompt/model produced a score.
--    (risk_band, ai_summary, factors, model_version, score_pillars, etc.
--    already exist — see supabase_setup.sql / CLAUDE.md Phase 3 notes.)
alter table scores add column if not exists prompt_version text;
alter table scores add column if not exists model_requested text;
alter table scores add column if not exists model_responded text;
alter table scores add column if not exists confidence_overall text;

-- 2. workflow_events: allow a non-transition 'ethoscore_assessed' event type,
--    and make to_state nullable so metadata-only events (not a status change)
--    don't need a fake to_state value.
--
--    Existing constraint (from __tests__/setup-test-db.sql):
--      event_type text not null check (event_type in
--        ('status_change','assignment','note','score_complete','ai_review')),
--      to_state text not null,
--
--    NOTE: if your live DB's constraint has a different auto-generated name,
--    find it first with:
--      select conname from pg_constraint
--      where conrelid = 'workflow_events'::regclass and contype = 'c';
alter table workflow_events drop constraint if exists workflow_events_event_type_check;
alter table workflow_events add constraint workflow_events_event_type_check
  check (event_type in ('status_change','assignment','note','score_complete','ai_review','ethoscore_assessed'));

alter table workflow_events alter column to_state drop not null;
