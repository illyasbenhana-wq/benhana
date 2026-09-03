-- Data Provenance layer — the next architectural layer on top of the
-- existing decision-lineage foundation (see
-- 20260827000000_add_decision_lineage_tables.sql). Answers "where did
-- this information come from" for the inputs/signals behind a decision.
--
-- This is a NEW table, not a reuse of an existing Phase 1/2 table —
-- justified because none of the existing tables carry a source/
-- transformation/confidence/retrieved-at shape at the individual-field
-- level: data_snapshots stores the whole input blob verbatim (no
-- per-field source attribution), and decision_records stores the
-- decision output, not per-signal provenance. Provenance is deliberately
-- a separate, additive table connecting into the existing lineage by
-- reference, not a redesign of either.
--
-- Design follows the exact conventions already established and reviewed
-- in this codebase for the decision-lineage graph:
--   - organization_id carries a real FK to organizations(id) (NO ACTION
--     default — safe, never issues an UPDATE/DELETE against this table).
--   - decision_record_id / data_snapshot_id / model_version_id are
--     deliberately UNCONSTRAINED uuid columns (no FK), matching
--     outcomes.decision_record_id and performance_windows.model_version_id:
--     referential integrity is enforced at the application layer, so
--     provenance rows remain valid evidence even if something upstream
--     is ever restructured, and no live FK can conflict with the
--     append-only trigger below (the same class of conflict the Phase 1
--     FK correction fixed).
--   - Append-only via the existing reject_update_or_delete() function
--     (defined in the Phase 1 migration, reused here unmodified).
--   - RLS enabled, zero policies — same default-deny convention as every
--     other Phase 1/2 table.
create table if not exists provenance_records (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id),

  -- Plain uuid, no FK — see design note above. Always populated: every
  -- provenance record exists to explain some part of a specific decision.
  decision_record_id  uuid not null,

  -- What kind of thing this provenance record is about, distinguishing
  -- raw input from what was derived/interpreted from it (see the
  -- Source→...→Decision distinction this layer exists to preserve).
  signal_level        text not null check (signal_level in (
                         'raw_input', 'derived_signal', 'model_interpretation', 'decision_output'
                       )),

  -- Where the underlying information originated. 'external_provider' is
  -- included now, provider-agnostically, so a future bank-data/bureau/
  -- KYC/document-intelligence integration has a place to attach without
  -- a schema change — no such integration is implemented in this phase.
  source_type         text not null check (source_type in (
                         'applicant_provided', 'lender_provided', 'internally_derived',
                         'model_generated', 'external_provider'
                       )),

  -- Provider-agnostic external-source identification. Both null for every
  -- row in this phase (no external provider integration exists yet) —
  -- present so that future integrations populate them without a
  -- migration. provider is a free-text identifier (e.g. a future
  -- 'plaid'/'ocrolus'/bureau name); provider_reference is that
  -- provider's own opaque reference id for this piece of data.
  provider             text,
  provider_reference   text,

  -- Which field/signal/factor this record explains, e.g. 'monthly_income'
  -- (a raw ApplicationForm field) or 'Rent Payment History' (a
  -- ScoreFactor.name from the model's output).
  field_name           text not null,

  raw_value            jsonb,
  normalized_value      jsonb,
  transformation        text,
  confidence            numeric,

  -- When the underlying information was obtained (always populated).
  -- valid_at is separate and optional: for information that describes a
  -- state as of some earlier point (e.g. a bank balance as of a
  -- statement date), retrieved_at is when EthosFi captured it and
  -- valid_at is when the value itself was true — deliberately not
  -- conflated, since they can differ once any real external provider is
  -- integrated.
  retrieved_at          timestamptz not null,
  valid_at               timestamptz,

  -- Optional links into the existing evidence graph — plain uuid, no FK,
  -- same reasoning as decision_record_id above. data_snapshot_id is set
  -- when this record explains a raw_input field (points at the frozen
  -- data_snapshots row it was read from); model_version_id is set when
  -- signal_level = 'model_interpretation' (records which exact model
  -- produced this interpretation, never the current production model).
  data_snapshot_id       uuid,
  model_version_id       uuid,

  created_at              timestamptz not null default now()
);

create index if not exists provenance_records_organization_id_idx on provenance_records(organization_id);
create index if not exists provenance_records_decision_record_id_idx on provenance_records(decision_record_id);
create index if not exists provenance_records_decision_record_id_field_name_idx on provenance_records(decision_record_id, field_name);
create index if not exists provenance_records_source_type_idx on provenance_records(source_type);

drop trigger if exists trg_provenance_records_immutable on provenance_records;
create trigger trg_provenance_records_immutable
  before update or delete on provenance_records
  for each row execute function reject_update_or_delete();

-- RLS enabled, zero policies — see design note above. Identical
-- forward-looking default-deny convention as every prior Phase 1/2 table.
alter table provenance_records enable row level security;
