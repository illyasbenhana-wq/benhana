-- Decision Lineage Foundation (Phase 1 of the Decision Intelligence /
-- Outcomes / Performance Data Layer initiative).
--
-- Design reference: this migration implements the "Phase 1 — Data
-- foundation" of the architecture plan reviewed and approved in-session
-- (data_snapshots -> decision_records -> existing decisions/scores/
-- workflow_events). It does NOT build outcome tracking, performance
-- analytics, ingestion, or any cross-tenant capability — those are
-- explicitly deferred to later phases, not started here.
--
-- Scope, per project rules: additive only. No destructive ALTER, no
-- renamed/removed columns, no backfill of historical `scores`/
-- `applications` rows into these new tables (no fabricated history —
-- these tables start empty and only fill from this point forward).
--
-- MUST be applied to ethosfi-test first and verified there before any
-- production discussion, per the established test/production
-- separation gate (see CLAUDE.md).

-- 1. model_versions — the smallest clean registry that can answer
--    "which prompt/model combination produced this score", without
--    duplicating what already lives on `scores` (score_version,
--    prompt_version, model_requested, model_responded). This is a
--    global, non-tenant lookup table: a prompt/model version is a
--    product-engineering fact, not tenant data, so it carries no
--    organization_id and leaks nothing tenant-specific. Rows are
--    upserted lazily the first time a given combination is observed —
--    no separate "release a new model version" workflow is being
--    introduced in Phase 1.
create table if not exists model_versions (
  id                uuid primary key default gen_random_uuid(),
  score_version     text not null,           -- 'v1' | 'v2', mirrors scores.score_version
  prompt_version    text not null,           -- e.g. 'v1', '2.0.0-fable5', 'mock-v1'
  model_requested   text,
  model_responded   text,
  first_seen_at     timestamptz not null default now(),

  unique (score_version, prompt_version, model_requested, model_responded)
);

-- 2. data_snapshots — an immutable copy of exactly what the scoring
--    flow received as input, captured at scoring time. Separate from
--    `applications` (which remains a live, editable row) specifically
--    so that a later edit to an application can never retroactively
--    change what a historical decision record shows it saw.
create table if not exists data_snapshots (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id),
  application_id    uuid references applications(id) on delete cascade,
  captured_at       timestamptz not null default now(),
  source            text not null check (source in ('apply_flow', 'partner_api')),
  raw_data          jsonb not null,          -- the validated ApplicationForm, verbatim
  created_at        timestamptz not null default now()
);

create index if not exists data_snapshots_organization_id_idx on data_snapshots(organization_id);
create index if not exists data_snapshots_application_id_idx on data_snapshots(application_id);

-- 3. decision_records — the durable, historically-stable snapshot of a
--    scoring decision: what was known, what was computed, what was
--    decided, and by which model/prompt version. No UPDATE path is
--    exposed anywhere in the application layer — a correction must be
--    a new row, never an edit to an existing one. `decision_id` is
--    nullable and unpopulated in Phase 1: it exists so a future human
--    lender decision (the `decisions` table) can be linked back to the
--    system-generated record that preceded it, without requiring a
--    schema change when that linking logic is eventually built.
create table if not exists decision_records (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations(id),
  application_id          uuid references applications(id) on delete cascade,
  score_id                uuid references scores(id) on delete set null,
  decision_id             uuid references decisions(id) on delete set null,
  data_snapshot_id        uuid not null references data_snapshots(id),
  model_version_id        uuid not null references model_versions(id),

  signals_snapshot        jsonb not null,     -- ScoreFactor[] at decision time
  score_pillars_snapshot  jsonb,              -- v2 4-pillar breakdown, null for v1-only scores
  etho_score              integer not null,
  risk_band               text not null,
  recommendation          text not null,      -- AI recommendation: 'approve' | 'decline' | 'review'

  decision                text not null,      -- system decision from lib/decision-engine.ts
  decision_reason         jsonb not null,      -- reason_codes[]
  confidence              numeric,
  requires_human_review   boolean not null,
  decided_by              text not null default 'system',
  override_reason         text,

  decided_at              timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  deleted_at              timestamptz          -- present for schema convention only;
                                                -- no delete path is exposed in Phase 1
);

create index if not exists decision_records_organization_id_idx on decision_records(organization_id);
create index if not exists decision_records_application_id_idx on decision_records(application_id);
create index if not exists decision_records_score_id_idx on decision_records(score_id);
create index if not exists decision_records_model_version_id_idx on decision_records(model_version_id);
