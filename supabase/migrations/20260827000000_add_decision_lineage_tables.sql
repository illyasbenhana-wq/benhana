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
  application_id    uuid references applications(id) on delete set null,
  captured_at       timestamptz not null default now(),
  source            text not null check (source in ('apply_flow', 'partner_api')),
  raw_data          jsonb not null,          -- the validated ApplicationForm, verbatim
  created_at        timestamptz not null default now()
);

create index if not exists data_snapshots_organization_id_idx on data_snapshots(organization_id);
create index if not exists data_snapshots_application_id_idx on data_snapshots(application_id);

-- 3. decision_records — the durable, historically-stable snapshot of a
--    scoring decision: what was known, what was computed, what was
--    decided, and by which model/prompt version. `decision_id` is
--    nullable and unpopulated in Phase 1: it exists so a future human
--    lender decision (the `decisions` table) can be linked back to the
--    system-generated record that preceded it, without requiring a
--    schema change when that linking logic is eventually built.
--
--    No `deleted_at` column — an earlier draft of this migration had one
--    "for schema convention," but that was dead from the start: once
--    immutability is enforced at the database level (below), a
--    soft-delete column can never actually be set (setting it would
--    itself be a blocked UPDATE). Removed rather than left as a column
--    that looks meaningful but can never be used.
create table if not exists decision_records (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations(id),
  application_id          uuid references applications(id) on delete set null,
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
  created_at              timestamptz not null default now()
);

create index if not exists decision_records_organization_id_idx on decision_records(organization_id);
create index if not exists decision_records_application_id_idx on decision_records(application_id);
create index if not exists decision_records_score_id_idx on decision_records(score_id);
create index if not exists decision_records_model_version_id_idx on decision_records(model_version_id);

-- 4. Database-enforced immutability (INSERT allowed, UPDATE/DELETE
--    rejected) for data_snapshots and decision_records. An absent
--    application-layer update path is not a real guarantee — this makes
--    it a guarantee. Smallest safe mechanism: a single trigger function,
--    the same category of tool this schema already uses (see
--    update_updated_at() in __tests__/setup-test-db.sql), just enforcing
--    a rejection instead of a timestamp refresh. Applies regardless of
--    which Postgres role attempts the write, including service_role —
--    there is no bypass.
--
--    Deliberately NOT applied to model_versions: its natural-key
--    upsert (see lib/audit-engine.ts) relies on Postgres executing a
--    real UPDATE on conflict, even when the values are unchanged. A
--    blanket reject-on-UPDATE trigger there would break that upsert on
--    every second observation of an already-seen version combination.
create or replace function reject_update_or_delete()
returns trigger as $$
begin
  raise exception '% is append-only: % is not permitted on table %', TG_TABLE_NAME, TG_OP, TG_TABLE_NAME
    using errcode = 'insufficient_privilege';
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_data_snapshots_immutable on data_snapshots;
create trigger trg_data_snapshots_immutable
  before update or delete on data_snapshots
  for each row execute function reject_update_or_delete();

drop trigger if exists trg_decision_records_immutable on decision_records;
create trigger trg_decision_records_immutable
  before update or delete on decision_records
  for each row execute function reject_update_or_delete();

-- 5. Row Level Security — enabled, with deliberately ZERO policies.
--
--    This app's existing tenant isolation runs at the application layer
--    (lib/api-guard.ts's requirePermission() + organization_id
--    filtering), using the Supabase service_role key server-side.
--    service_role carries the BYPASSRLS role attribute on every Supabase
--    project, so enabling RLS here does not affect that access pattern
--    at all — the existing lib/audit-engine.ts code continues to read
--    and write exactly as before, unchanged.
--
--    What RLS-with-no-policy actually buys: in Postgres, enabling RLS
--    with no policy defined means every role WITHOUT BYPASSRLS (i.e.
--    anon/authenticated, the keys any browser client would use) gets
--    zero rows and zero writes, full stop — a default-deny. Today,
--    nothing in this app queries these two tables from client-side code
--    (no UI exists for them yet), so this has no functional effect now.
--    It exists as a forward-looking safety net: if a future page is
--    ever written that queries data_snapshots/decision_records directly
--    with the anon key (the pattern this app already uses for cases/
--    scores elsewhere), RLS blocks that by default instead of silently
--    exposing every tenant's historical decision data to every other
--    tenant. No policy is added now because there is no legitimate
--    client-side consumer to write one for yet — adding a permissive
--    policy without a real use case would be guessing at a shape this
--    data's client-facing access should take.
alter table data_snapshots enable row level security;
alter table decision_records enable row level security;

-- If/when a real client-side (anon/authenticated-key) consumer of these
-- tables is built, the policy shape would look like this — NOT created
-- now, left here only as a documented reference for that future work:
--
-- create policy "org members can read their own decision records"
--   on decision_records for select
--   using (organization_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::uuid);
