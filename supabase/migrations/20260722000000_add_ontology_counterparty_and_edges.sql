-- Phase 4 Ontology: Organization/counterparty split + generic edge table.
-- Design reference: docs/PHASE4_ONTOLOGY_DESIGN.md §6 (approved 2026-07-22).
--
-- Scope, per project rules: additive only. No changes to `organizations`
-- (it stays tenant-only by convention, not by schema change). No
-- destructive ALTER on `cases`/`applications` — new nullable FK columns
-- only, `cases.entity_name` untouched, no backfill.
--
-- MUST be applied to ethosfi-test (gwvhlemfubmcnbzdarnx) first and
-- verified there before any production discussion, per the established
-- test/production separation gate (see CLAUDE.md).

-- 1. counterparties — non-tenant parties being investigated/scored
--    (companies, not individuals — Person remains a separate, still-open
--    design question per §3.2, not addressed by this migration).
create table if not exists counterparties (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  -- Tenant scope, non-negotiable (CLAUDE.md principle 3). Deliberately
  -- not deduped across tenants: two tenants independently investigating
  -- the same real-world company get two separate rows. Sharing
  -- counterparty intel across tenants would itself be a confidentiality
  -- leak, not just a modeling nicety.
  organization_id uuid not null references organizations(id),

  name                text not null,
  jurisdiction        text,
  registration_number text,

  source text not null default 'case_investigation'
    check (source in ('case_investigation', 'application_borrower', 'manual', 'external_feed')),

  risk_rating text check (risk_rating in ('low', 'medium', 'high', 'critical')),

  metadata jsonb not null default '{}'
);

create index if not exists counterparties_organization_id_idx on counterparties(organization_id);

-- Soft per-tenant dedup, not global (see tenant-scope comment above).
create unique index if not exists counterparties_org_name_unique_idx
  on counterparties(organization_id, name) where deleted_at is null;

drop trigger if exists trg_counterparties_updated_at on counterparties;
create trigger trg_counterparties_updated_at
  before update on counterparties for each row execute function update_updated_at();

-- 2. Nullable FKs from existing tables — extend, don't replace.
--    cases.entity_name (free text) is untouched; new cases can populate
--    both. applications.counterparty_id is nullable and, realistically,
--    rarely populated today given the table's consumer-lending shape.
alter table cases add column if not exists counterparty_id uuid references counterparties(id);
alter table applications add column if not exists counterparty_id uuid references counterparties(id);

create index if not exists cases_counterparty_id_idx on cases(counterparty_id);
create index if not exists applications_counterparty_id_idx on applications(counterparty_id);

-- 3. ontology_edges — one generic polymorphic edge table, mirroring the
--    workflow_events.entity_type/entity_id pattern already established in
--    this schema, rather than one join table per relationship type.
--    from_id/to_id cannot carry a real FK (the referenced table varies by
--    from_type/to_type) — referential integrity here is enforced at the
--    application layer, the same trade-off workflow_events.entity_id
--    already accepted.
--
--    'person' is a valid from_type/to_type value at the schema level so
--    this table doesn't need to change again once Person (§3.2, still
--    open) is resolved, but no row should actually be written with
--    from_type/to_type = 'person' until then — application-layer rule,
--    not enforced here.
create table if not exists ontology_edges (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  organization_id uuid not null references organizations(id),

  edge_type text not null check (edge_type in (
    'owns',             -- Person -> Counterparty | Counterparty -> Counterparty (weight = ownership %)
    'related_to',       -- Person -> Person (family / PEP linkage)
    'counterparty_of',  -- Counterparty -> Counterparty (transaction relationship)
    'references',       -- Application -> Counterparty (borrowing entity)
    'investigates',     -- Case -> Counterparty | Person
    'relates_to',       -- Case -> Application
    'assessed',         -- Score -> Application
    'acts_on'           -- Decision -> Score
  )),

  from_type text not null check (from_type in ('person', 'counterparty', 'application', 'case', 'score', 'decision')),
  from_id   uuid not null,
  to_type   text not null check (to_type in ('person', 'counterparty', 'application', 'case', 'score', 'decision')),
  to_id     uuid not null,

  weight    numeric,
  rationale text,
  actor_id  text,
  metadata  jsonb not null default '{}'
);

create index if not exists ontology_edges_organization_id_idx on ontology_edges(organization_id);
create index if not exists ontology_edges_from_idx on ontology_edges(from_type, from_id);
create index if not exists ontology_edges_to_idx on ontology_edges(to_type, to_id);
create index if not exists ontology_edges_edge_type_idx on ontology_edges(edge_type);

drop trigger if exists trg_ontology_edges_updated_at on ontology_edges;
create trigger trg_ontology_edges_updated_at
  before update on ontology_edges for each row execute function update_updated_at();
