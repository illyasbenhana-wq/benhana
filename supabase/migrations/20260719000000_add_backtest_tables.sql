-- backtest_runs / backtest_results — batch-scoring historical loan CSVs
-- against EthoScore v2 for comparison-report generation.
--
-- Backs lib/backtest-engine.ts + app/api/backtest/*.
--
-- STATUS: CONFIRMED APPLIED to the live database (project
-- ehmingbvknavehcjgkou) as of 2026-07-19 — verified via direct
-- information_schema query.
--
-- CORRECTION (2026-07-19, after initial apply): this file originally
-- said "TEST PROJECT ONLY... do not run against production," on the
-- assumption that ehmingbvknavehcjgkou was a test project distinct
-- from production. That assumption was wrong — a live production
-- audit confirmed only one Supabase project exists in this account,
-- and production (ethosfiai-mvp.vercel.app) connects to this same
-- project. There is no test/production database separation currently
-- in place; see CLAUDE.md and the architectural handoff discussion for
-- the full implications (notably: the committed anon/service_role JWTs
-- in supabase_setup.sql are production credentials, not test-only, and
-- should be treated as a live exposure, not an accepted low-severity
-- risk). The backtest tool itself remains dormant/gated
-- (BACKTEST_ACCESS_TOKEN, unlinked from nav) regardless of this.
--
-- ALSO APPLIED to the dedicated test project gwvhlemfubmcnbzdarnx
-- (created 2026-07-21 specifically to give this project a real,
-- separate test database) on 2026-07-21, run manually via Supabase
-- SQL editor immediately after __tests__/setup-test-db.sql and the
-- calibration-fields migration above. Confirmed successful by the
-- user in-session. This is the first time backtest_runs/backtest_results
-- have existed on a database that is not also production.

create table if not exists backtest_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  organization_id uuid not null references organizations(id),
  name text not null,
  source text not null default 'csv_upload',
  field_mapping jsonb not null,
  total_rows integer not null default 0,
  scored_rows integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  summary jsonb
);

create table if not exists backtest_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  run_id uuid not null references backtest_runs(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  row_index integer not null,
  input_data jsonb not null,
  status text not null
    check (status in ('scored', 'skipped', 'error')),
  error_reason text,
  predicted_score numeric,
  predicted_band text,
  predicted_pillars jsonb,
  actual_outcome text not null default 'unknown'
);

create index if not exists backtest_results_run_id_idx on backtest_results(run_id);
create index if not exists backtest_runs_organization_id_idx on backtest_runs(organization_id);
