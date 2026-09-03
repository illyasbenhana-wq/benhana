-- Decision Intelligence Layer — Phase 2, Step 1 (schema foundation ONLY).
--
-- Adds the storage foundation for: outcomes, performance_windows,
-- historical_import_batches, historical_decision_records.
--
-- Scope, per explicit instruction: schema only. No calculation logic, no
-- ingestion mechanism, no API, no UI, no scheduled jobs, no scoring
-- integration. Those are later steps.
--
-- This migration does NOT modify model_versions, data_snapshots,
-- decision_records, applications, scores, their triggers, their indexes,
-- or their RLS configuration in any way.
--
-- MUST be applied to ethosfi-test first and verified there, per the
-- established test/production separation gate. NOT applied by this
-- migration file being created — applying is a separate, later,
-- explicitly-approved step.

-- ─── 1. outcomes ─────────────────────────────────────────────────────────
--
-- A real-world observation of what happened to a credit relationship
-- after an EthosFi decision was made -- not a prediction, not a re-score.
-- Append-only: a correction is always a new row referencing the row it
-- supersedes, never an UPDATE.
--
-- decision_record_id is a deliberate plain uuid with NO foreign key,
-- following the exact Phase 1 FK correction already applied to
-- data_snapshots/decision_records: a live FK (even ON DELETE SET NULL)
-- would require Postgres to internally UPDATE this row whenever the
-- parent decision_record's lineage changes, which the append-only
-- trigger below would then reject. Referential integrity for this
-- column is enforced at the application layer, exactly like
-- decision_records.application_id/score_id/decision_id are today.
--
-- superseded_outcome_id is likewise a plain uuid with NO foreign key, for
-- the identical reason -- it references another row in this same
-- append-only table.
--
-- organization_id DOES carry a real FK to organizations(id). This is
-- safe: it uses Postgres's default NO ACTION behavior (no ON DELETE
-- clause), which never attempts to UPDATE or DELETE the child row -- it
-- only blocks deleting the parent organization while outcomes reference
-- it. That never conflicts with the append-only trigger, because NO
-- ACTION touches nothing on this table. This mirrors the existing
-- data_snapshots.organization_id / decision_records.organization_id FKs,
-- which already work this way in the applied Phase 1 schema.
create table if not exists outcomes (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations(id),
  decision_record_id      uuid not null,  -- NO FK, see note above
  status                  text not null check (status in (
                            'current', 'delinquent_30', 'delinquent_60',
                            'delinquent_90', 'default', 'write_off',
                            'repaid_full', 'repaid_early', 'restructured',
                            'withdrawn'
                          )),
  observed_at             timestamptz not null,
  superseded_outcome_id   uuid,  -- NO FK, see note above
  created_at              timestamptz not null default now()
);

create index if not exists outcomes_organization_id_idx on outcomes(organization_id);
create index if not exists outcomes_decision_record_id_idx on outcomes(decision_record_id);
create index if not exists outcomes_decision_record_id_observed_at_idx on outcomes(decision_record_id, observed_at);

drop trigger if exists trg_outcomes_immutable on outcomes;
create trigger trg_outcomes_immutable
  before update or delete on outcomes
  for each row execute function reject_update_or_delete();

alter table outcomes enable row level security;

-- ─── 2. performance_windows ──────────────────────────────────────────────
--
-- Computed analytical results, not raw events -- one row per
-- (organization, model_version, window_days) combination, holding a
-- point-in-time-correct aggregate of outcomes observed within that
-- window of decided_at. The point-in-time calculation itself (only using
-- outcomes with observed_at <= decided_at + window_days, to prevent
-- retrospective-leakage contamination) is explicitly NOT implemented in
-- this step -- this table is storage only.
--
-- model_version_id is a deliberate plain uuid with NO foreign key, for
-- the same historical-durability reason as outcomes.decision_record_id
-- above: this is an analytical record that must remain valid regardless
-- of what happens elsewhere, and model_versions is itself an immutable
-- (insert/upsert-only) registry it should never need to cascade against.
--
-- metrics is a single jsonb column rather than individual numeric
-- columns per metric, deliberately: the exact metric set (accuracy,
-- default rate, calibration, etc.) is a later-step decision, not
-- something to pre-commit to schema now. This column is only capable of
-- storing whatever a future calculation step produces -- nothing writes
-- to it yet.
create table if not exists performance_windows (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references organizations(id),
  model_version_id              uuid not null,  -- NO FK, see note above
  window_days                   integer not null check (window_days in (30, 60, 90, 180, 365)),
  sample_size                   integer not null default 0,
  is_statistically_meaningful   boolean not null default false,
  metrics                       jsonb,
  calculated_at                 timestamptz not null default now(),
  created_at                    timestamptz not null default now(),

  unique (organization_id, model_version_id, window_days)
);

create index if not exists performance_windows_organization_id_idx on performance_windows(organization_id);
create index if not exists performance_windows_model_version_id_idx on performance_windows(model_version_id);
create index if not exists performance_windows_model_version_id_window_days_idx on performance_windows(model_version_id, window_days);

-- Deliberately NO immutability trigger on this table. Unlike outcomes/
-- historical_*, a performance window is a computed/derived result, not a
-- record of an observed real-world fact -- recalculating it (e.g. as more
-- outcomes arrive within an already-open window) is expected future
-- behavior, not a historical correction that needs an audit trail of its
-- own. The unique constraint above exists to support that future
-- recalculate-in-place step; no upsert logic is implemented yet.

alter table performance_windows enable row level security;

-- ─── 3. historical_import_batches ────────────────────────────────────────
--
-- One row per historical CSV import/upload operation. The durable record
-- of what was imported and when -- append-only, never edited after the
-- fact (a batch's outcome is a fact of history, not a live status to be
-- silently rewritten).
--
-- source_lender_org_id references organizations(id) using the same safe
-- NO ACTION default as organization_id above -- both are tenants in this
-- system, and a real FK here carries no trigger-conflict risk since
-- nothing in this table is ever UPDATEd or DELETEd via cascade.
--
-- field_mapping is stored as jsonb (lender column name -> EthosFi
-- canonical field), mirroring the FieldMapping shape already established
-- by lib/backtest-engine.ts conceptually -- not shared code, a durable
-- persisted version of the same idea for imports specifically.
create table if not exists historical_import_batches (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references organizations(id),
  source_lender_org_id    uuid not null references organizations(id),
  imported_at             timestamptz not null default now(),
  imported_by             uuid,  -- no FK: no confirmed users/auth table to reference safely
  field_mapping           jsonb not null,
  row_count               integer not null default 0,
  accepted_count          integer not null default 0,
  rejected_count          integer not null default 0,
  duplicate_count         integer not null default 0,
  batch_status            text not null default 'completed' check (batch_status in ('processing', 'completed', 'failed')),
  created_at              timestamptz not null default now()
);

create index if not exists historical_import_batches_organization_id_idx on historical_import_batches(organization_id);
create index if not exists historical_import_batches_source_lender_org_id_idx on historical_import_batches(source_lender_org_id);

drop trigger if exists trg_historical_import_batches_immutable on historical_import_batches;
create trigger trg_historical_import_batches_immutable
  before update or delete on historical_import_batches
  for each row execute function reject_update_or_delete();

alter table historical_import_batches enable row level security;

-- ─── 4. historical_decision_records ──────────────────────────────────────
--
-- Imported historical lender decisions. Deliberately NOT the same table
-- as decision_records, and deliberately NOT linked into it: a lender's
-- own historical underwriting decision must never be represented as if
-- EthosFi's model produced it. origin is fixed to 'imported' (a single
-- allowed value today, kept as a check constraint rather than a literal
-- default-only column so a later, explicitly-reviewed migration could
-- extend the allowed set without this one silently having assumed only
-- one origin would ever exist).
--
-- import_batch_id references historical_import_batches(id) using the
-- same safe NO ACTION default -- both tables are append-only, so a
-- parent batch can never actually be deleted while rows reference it;
-- the FK only blocks that delete outright, it never issues an UPDATE
-- against this table, so it cannot conflict with the trigger below.
--
-- raw_payload is the authoritative, untouched original imported row. No
-- process may overwrite it; the append-only trigger enforces that at the
-- database level, identical in spirit to data_snapshots.raw_data.
--
-- normalized_data is a single jsonb column for derived/normalized
-- fields, deliberately generic rather than a fixed set of typed columns:
-- the exact normalized shape is a later-step (ingestion pipeline)
-- decision, not something to pre-commit here.
--
-- fingerprint is a deterministic duplicate-detection value, indexed but
-- NOT unique -- per explicit instruction, this schema step must not
-- encode a first-seen-wins vs. latest-wins policy. A non-unique index
-- lets a later step detect and link duplicates/corrections without the
-- schema itself forcing either resolution.
--
-- corrects_historical_record_id is a plain uuid with NO foreign key, for
-- the same append-only-safety reason as outcomes.superseded_outcome_id.
create table if not exists historical_decision_records (
  id                            uuid primary key default gen_random_uuid(),
  organization_id               uuid not null references organizations(id),
  source_lender_org_id          uuid not null references organizations(id),
  import_batch_id               uuid not null references historical_import_batches(id),
  imported_at                   timestamptz not null default now(),
  imported_by                   uuid,  -- no FK: no confirmed users/auth table to reference safely

  origin                        text not null default 'imported' check (origin = 'imported'),
  raw_payload                   jsonb not null,
  normalized_data               jsonb,

  data_quality_score            numeric,
  completeness_ratio            numeric,
  validation_status             text not null check (validation_status in ('accepted', 'rejected')),
  validation_reasons            jsonb,

  fingerprint                   text not null,
  corrects_historical_record_id uuid,  -- NO FK, see note above

  created_at                    timestamptz not null default now()
);

create index if not exists historical_decision_records_organization_id_idx on historical_decision_records(organization_id);
create index if not exists historical_decision_records_source_lender_org_id_idx on historical_decision_records(source_lender_org_id);
create index if not exists historical_decision_records_import_batch_id_idx on historical_decision_records(import_batch_id);
create index if not exists historical_decision_records_fingerprint_idx on historical_decision_records(fingerprint);

drop trigger if exists trg_historical_decision_records_immutable on historical_decision_records;
create trigger trg_historical_decision_records_immutable
  before update or delete on historical_decision_records
  for each row execute function reject_update_or_delete();

alter table historical_decision_records enable row level security;

-- ─── RLS note ─────────────────────────────────────────────────────────────
-- All four tables: RLS enabled, ZERO policies -- identical convention to
-- Phase 1 (see 20260827000000_add_decision_lineage_tables.sql). This is a
-- default-deny safety net for any future anon/authenticated-key client
-- access; service_role's BYPASSRLS attribute means existing/future
-- server-side access is unaffected. No policy is written now because
-- there is no client-side consumer for these tables yet -- writing one
-- without a real use case would be guessing at a shape.
