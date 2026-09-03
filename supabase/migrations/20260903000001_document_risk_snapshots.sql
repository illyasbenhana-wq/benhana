-- Documentation-only migration: risk_snapshots.
--
-- Confirmed via the Master Truth Record audit (2026-09-03): lib/risk-
-- dashboard.ts (introduced in commit ec9120b, "Phase 3: Intelligence
-- Layer") reads and writes a `risk_snapshots` table that has never had a
-- defining SQL file anywhere in this repository -- per that commit's own
-- message, its schema was applied manually, directly in Supabase,
-- outside the migrations convention adopted later in this project.
--
-- A read-only query against the connected ethosfi-test database this
-- session confirmed the table DOES exist, is live, and already contains
-- real rows whose shape matches lib/risk-dashboard.ts's
-- generateRiskSnapshot()/RiskSnapshot exactly: id, organization_id,
-- snapshot_at, total_exposure, avg_etho_score, risk_distribution (jsonb,
-- {low,medium,high} counts), top_risks (jsonb array), anomalies (jsonb
-- array), created_at.
--
-- This migration exists ONLY to close the version-control gap -- it does
-- NOT alter the live table in any way. `create table if not exists`
-- means this is a guaranteed no-op against a database where the table
-- already exists (the case for ethosfi-test today); it only creates the
-- table from scratch in an environment where it is genuinely absent
-- (e.g. a fresh database provisioned from this repository's migrations
-- alone, which today would be missing this table entirely).
--
-- No immutability trigger is added here: unlike data_snapshots/
-- decision_records, risk_snapshots is a recomputable analytical artifact
-- (each snapshot is a point-in-time aggregate that generateRiskSnapshot()
-- can regenerate at any time), the same category as performance_windows,
-- not a append-only historical-evidence record. Adding new behavior
-- (triggers, RLS policies) beyond what's needed to document the existing,
-- already-confirmed-live shape is out of scope for this correction.
--
-- Column types below are inferred from lib/risk-dashboard.ts's actual
-- insert/read code (this file) and the real row shapes observed live
-- this session -- not guessed from the table name alone.

create table if not exists risk_snapshots (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id),
  snapshot_at       timestamptz not null,
  total_exposure    numeric not null default 0,
  avg_etho_score    numeric,
  risk_distribution jsonb not null,
  top_risks         jsonb not null default '[]'::jsonb,
  anomalies         jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists risk_snapshots_organization_id_idx on risk_snapshots(organization_id);
create index if not exists risk_snapshots_snapshot_at_idx on risk_snapshots(snapshot_at);

-- Not applied by this session: no direct database DDL execution is
-- available in this environment. Even though this migration is a no-op
-- against the current live ethosfi-test database (the table already
-- exists), it should still be applied there (and to any other
-- environment) via the Supabase SQL Editor, so that this table's
-- defining schema is finally captured in version control going forward.
