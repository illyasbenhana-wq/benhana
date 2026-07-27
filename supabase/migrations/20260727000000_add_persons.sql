-- Phase 4 Ontology: Person entity.
-- Design reference: docs/PHASE4_ONTOLOGY_DESIGN.md §7 (approved 2026-07-22).
--
-- Scope, per project rules: additive only. No changes to `applications`
-- beyond one nullable FK column; `applications.full_name`/`.email`
-- untouched, no backfill in this file (backfill is a separate script,
-- per §7.6's "schema and backfill are different classes of risk").
--
-- MUST be applied to ethosfi-test (gwvhlemfubmcnbzdarnx) first and
-- verified there before any production discussion, per the established
-- test/production separation gate (see CLAUDE.md).

-- 1. persons — single type for both risk-context individuals (UBOs, PEPs,
--    directors) and inclusion-context individuals (loan applicants). See
--    §7.1 for why this is one type, not a split like Organization/Counterparty.
CREATE TABLE IF NOT EXISTS persons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  -- Tenant scope, non-negotiable — same rationale as counterparties (§6.2):
  -- an applicant's identity under Tenant A and a UBO's identity under
  -- Tenant B are both confidential to that tenant, not a shared directory.
  organization_id UUID NOT NULL REFERENCES organizations(id),

  full_name    TEXT NOT NULL,
  email        TEXT,
  jurisdiction TEXT,   -- nationality/country of primary association; nullable, relevant to both contexts

  -- How this Person entered the graph — mirrors counterparties.source exactly.
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('application_borrower', 'case_investigation', 'manual', 'external_feed')),

  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS persons_organization_id_idx ON persons(organization_id);

-- Deliberately NO unique-name index, unlike counterparties (§7.2) — two
-- different humans sharing a name is common and a unique constraint
-- would silently force a false identity merge.

DROP TRIGGER IF EXISTS trg_persons_updated_at ON persons;
CREATE TRIGGER trg_persons_updated_at
  BEFORE UPDATE ON persons FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Nullable FK from applications — extend, don't replace.
--    applications.full_name/.email (existing) are untouched.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS applicant_person_id UUID REFERENCES persons(id);

CREATE INDEX IF NOT EXISTS applications_applicant_person_id_idx ON applications(applicant_person_id);

-- Note: ontology_edges needs no schema change — from_type/to_type already
-- accept 'person' (see 20260722000000_add_ontology_counterparty_and_edges.sql,
-- §6.4's CHECK constraint was written anticipating exactly this).
