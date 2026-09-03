-- Phase 1 correction: remove foreign keys that conflict with append-only
-- immutability on data_snapshots / decision_records.
--
-- Confirmed defect (Master Truth Record audit, 2026-09-03): the defining
-- migration (20260827000000_add_decision_lineage_tables.sql) declares
--   data_snapshots.application_id   references applications(id) on delete set null
--   decision_records.application_id references applications(id) on delete set null
--   decision_records.score_id       references scores(id)       on delete set null
--   decision_records.decision_id    references decisions(id)    on delete set null
-- `ON DELETE SET NULL` requires Postgres to execute an UPDATE against the
-- child row when the referenced parent is deleted. The same migration's
-- trg_data_snapshots_immutable / trg_decision_records_immutable triggers
-- reject ANY UPDATE unconditionally (before update or delete ... raise
-- exception), including this system-generated one. The declared SET NULL
-- behavior can therefore never actually execute: deleting an
-- applications/scores/decisions row that has a dependent data_snapshots
-- or decision_records row would abort with "... is append-only ..."
-- instead of completing. This was never exercised by any test that
-- actually runs in this repository (the one test file that deletes
-- `applications` rows, __tests__/integration/endpoint-isolation.test.ts,
-- is excluded from the default suite and requires a manually-started dev
-- server) and was corrected here before it could be hit in practice.
--
-- Fix: drop the four FK constraints entirely. This does not touch a
-- single row, column definition, index, or trigger. application_id /
-- score_id / decision_id remain plain uuid historical identifiers on
-- both tables -- the exact "unconstrained lineage reference" pattern
-- this schema already uses deliberately elsewhere (see
-- outcomes.decision_record_id and historical_decision_records' fields,
-- 20260828000000_add_outcomes_performance_historical_foundation.sql's
-- own comments, for the same principle already applied once before).
--
-- Preserved, deliberately not touched: organization_id (-> organizations),
-- data_snapshot_id and model_version_id (both on decision_records, ->
-- data_snapshots / model_versions). None of these three carry an
-- ON DELETE SET NULL clause -- they default to NO ACTION/RESTRICT, which
-- blocks the parent delete outright rather than issuing a child UPDATE,
-- so they do not conflict with the immutability trigger and are outside
-- the scope of this correction.
--
-- Constraint names below follow Postgres's default auto-generated naming
-- convention (<table>_<column>_fkey) -- the defining migration did not
-- assign explicit constraint names. This could NOT be independently
-- confirmed against the live database with the tooling available in this
-- environment (no direct Postgres/catalog access; PostgREST does not
-- expose pg_constraint/information_schema for ad hoc querying here,
-- confirmed by direct attempt this session). Before applying this
-- migration, run the read-only query below against the real database and
-- confirm these are the actual constraint names:
--
--   select conname, conrelid::regclass, confrelid::regclass, confdeltype
--   from pg_constraint
--   where conrelid in ('data_snapshots'::regclass, 'decision_records'::regclass)
--     and contype = 'f';
--
-- If any name differs, replace it below before applying -- DROP
-- CONSTRAINT IF EXISTS is used so an unexpected name simply no-ops
-- rather than erroring, which means a silent partial fix is possible if
-- this isn't checked first.
--
-- MUST be applied to ethosfi-test first and verified there before any
-- production discussion, per the established test/production separation
-- gate (see CLAUDE.md) -- same as every prior migration in this project.
-- NOT applied by this session: no direct database DDL execution is
-- available in this environment (standing limitation, all session) --
-- this file must be run manually via the Supabase SQL Editor, exactly
-- like every other migration in this repository's history.

alter table data_snapshots
  drop constraint if exists data_snapshots_application_id_fkey;

alter table decision_records
  drop constraint if exists decision_records_application_id_fkey;

alter table decision_records
  drop constraint if exists decision_records_score_id_fkey;

alter table decision_records
  drop constraint if exists decision_records_decision_id_fkey;

-- Reversal (NOT part of this migration's forward path -- provided only
-- for completeness; reapplying would reintroduce the original
-- contradiction and is not recommended):
--
--   alter table data_snapshots add constraint data_snapshots_application_id_fkey
--     foreign key (application_id) references applications(id) on delete set null;
--   alter table decision_records add constraint decision_records_application_id_fkey
--     foreign key (application_id) references applications(id) on delete set null;
--   alter table decision_records add constraint decision_records_score_id_fkey
--     foreign key (score_id) references scores(id) on delete set null;
--   alter table decision_records add constraint decision_records_decision_id_fkey
--     foreign key (decision_id) references decisions(id) on delete set null;
