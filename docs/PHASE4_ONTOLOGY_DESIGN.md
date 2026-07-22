# EthosFi Phase 4 — Ontology Design (Draft)

Status: design/discussion draft, not yet approved for implementation. No
schema changes have been made from this document. Architecture and
entity-relationship modeling only, per the Phase 4 planning session on
2026-07-20 — grounded in the confirmed schema from the 2026-07-19
schema-governance audit (`__tests__/setup-test-db.sql` plus both applied
migrations under `supabase/migrations/`).

Engine decision already made: **Postgres edge tables**, not a separate
graph database (see §3.3) — additive to the existing schema, no new
infrastructure.

---

## 1. What the current schema already is, read as an ontology

`CLAUDE.md`'s Palantir-tier framing (Ontology / Operational Intelligence /
Workflow Orchestration / Multi-party Collaboration) already has partial
real substance, not just aspiration:

| Existing table | Ontology role today |
|---|---|
| `organizations` | Tenant/party — but conflates two different real-world concepts (see §3.1) |
| `applications` | The borrower-side loan request — a **Deal** in embryo, not yet modeled as one |
| `scores` | A point-in-time **assessment event** on an application |
| `decisions` | A lender **action** on a score — audit trail, not yet a first-class workflow object |
| `cases` | AML/compliance investigation — a second, parallel "deal-like" object with its own lifecycle |
| `signals` | Risk evidence attached to a case — already relationship-shaped, just not graph-queryable |
| `case_actions`, `case_comments`, `case_tasks` | Workflow/collaboration on a case |
| `workflow_events` | The only table that's *already* event-sourced/immutable — closest thing to a real ontology event log today |
| `organization_members` | Party-to-org membership — a real edge, currently the only modeled relationship of its kind |
| `api_keys`, `webhook_endpoints` | Partner-integration plumbing, not domain entities |
| `notifications`, `notification_preferences` | Derived/operational, not core ontology |
| `risk_snapshots` | Aggregate/derived intelligence, not a primary entity |
| `backtest_runs`, `backtest_results` | Offline evaluation artifacts, outside the live ontology entirely |

**Key observation**: `applications` and `cases` are structurally two
separate, un-unified "deal" concepts — one for lending decisions, one for
AML investigations — with no foreign key between them. A real entity
graph needs to decide whether these are the same underlying concept
wearing two hats, or genuinely distinct object types that can *reference*
each other. Recommendation: treat them as distinct types linked by
relationship (§2.2), not merge them — they have different lifecycles,
different actors, and merging risks breaking existing app logic that
"extend, don't replace" is meant to protect.

## 2. Proposed Ontology object types

### 2.1 Core entities (mostly **existing tables, reframed** as ontology nodes — not new tables)

- **Organization** — maps to `organizations`. *Caveat, needs product
  input (§3.1):* this table currently serves double duty as both "tenant"
  (a lender/CDFI using EthosFi) and implicitly "counterparty" (an entity
  being scored/investigated, e.g. "Meridian Capital Ltd" in the case seed
  data). An ontology needs these separated.
- **Person** — **genuinely new**. Nothing today models an individual
  human as a queryable node — not the borrower (`applications.full_name`
  is a plain text field, not an entity reference), not a beneficial
  owner, not a PEP. The case seed data (`INV-1021`: "beneficially owned
  by a first-degree family member of a Japanese cabinet minister")
  describes exactly the kind of person-to-person relationship (family,
  PEP status) that has no home in the current schema at all.
- **Application** (Deal, lending) — maps to `applications`, promoted from
  a flat record to a graph node with edges to Person (applicant),
  Organization (if a business loan), Score, Decision.
- **Case** (Deal, compliance) — maps to `cases`, promoted similarly, with
  edges to Organization/Person (the investigated entity), Signal,
  CaseAction/Comment/Task.
- **Score** — maps to `scores`, an assessment event attached to an
  Application.
- **Signal** — maps to `signals`, evidence attached to a Case (already
  relationship-shaped, just needs first-class edge semantics instead of a
  flat FK).
- **WorkflowEvent** — maps to `workflow_events`, already the closest
  thing to a real event log; becomes the backbone of "what happened,
  when, to what" queries across the whole graph.

### 2.2 Relationship (edge) types — **all genuinely new**, nothing today
models typed relationships between entities beyond plain foreign keys

- `Person —owns→ Organization` (with %, e.g. the 32% UBO stake in
  `INV-1021`'s seed data)
- `Person —related_to→ Person` (family/PEP linkage — directly evidenced
  by the seed data's own case narratives, currently only expressible as
  unstructured text in `cases.ai_summary`)
- `Organization —counterparty_of→ Organization` (transaction relationships
  between entities, e.g. `INV-1038`'s "two counterparties... previously
  flagged in unrelated structuring investigations")
- `Application —references→ Organization` (business loan → borrowing
  entity)
- `Case —investigates→ Organization | Person`
- `Case —relates_to→ Application` (**new, closes the applications/cases
  gap noted in §1** — e.g. a case opened because of signals discovered
  during an application's scoring)
- `Score —assessed→ Application`, `Decision —acts_on→ Score`

### 2.3 What's genuinely new vs. reframed existing data — summary

| New | Reframed existing |
|---|---|
| Person entity | Organization (as a node) |
| All typed relationship/edge tables | Application, Case, Score, Signal, WorkflowEvent (as nodes) |
| Cross-entity graph traversal (multi-hop queries) | Existing FK joins, made queryable as graph edges |
| Organization role disambiguation (tenant vs. counterparty) | — |

## 3. Open design questions — **status as of 2026-07-20**

1. **Organization's dual role** — is a "tenant lender" and a "counterparty
   being investigated" the same object type with a role flag, or two
   separate types (`Organization` for tenants, `Entity` for
   counterparties)? This decision shapes the whole graph. Recommendation:
   split them — conflating "the CDFI using EthosFi" with "the company
   Meridian Capital Ltd that a CDFI is investigating" is exactly the kind
   of modeling shortcut that causes RBAC/multi-tenancy confusion later (a
   counterparty entity shouldn't inherit tenant-level permissions).
   **Open — not yet decided.**
2. **Person entity's relationship to `applications.full_name`/`email`** —
   do we backfill existing applications into Person nodes (data
   migration, real work, real risk) or only create Person nodes going
   forward? Given `applications` has no `person_id` FK today, this is
   non-trivial and should be scoped as its own migration project, not
   bundled into "add the Person table." **Open — not yet decided.**
3. **Graph storage engine** — **DECIDED**: Postgres edge tables (queryable
   via recursive CTEs in the existing Supabase setup), not a separate
   graph database. Additive to the existing "extend, don't replace"
   discipline; avoids adding a second database technology on top of the
   schema-management problem resolved on 2026-07-19. `CLAUDE.md`'s
   existing note ("graph database... Phase 4+ only, do not introduce
   earlier") is satisfied by deferring an actual graph DB, not by this
   decision.

## 4. Sequencing note (as of 2026-07-20)

This design work proceeded in parallel with standing up a real
test/production database separation (see `CLAUDE.md`'s corrected Phase
3.5.6 incident record). Status: `ethosfi-test` project created (ref
`gwvhlemfubmcnbzdarnx`), billing tier confirmed acceptable, keys to be
handed over next session to execute: apply `__tests__/setup-test-db.sql`
+ both existing migrations + the (not yet written) `DEFAULT_ORG_ID` seed
row, then repoint `.env.local`/`.env.test`/`test-helpers.ts`/
`backup-restore-test.mjs` at the new project. **No Phase 4 schema work
(§2) should begin until that test project is live and wired up** — doing
graph/ontology migration work against the same undifferentiated database
that caused the original schema-governance and credential-exposure
findings would repeat the exact problem this effort exists to fix.

## 5. What this document is not

No table definitions, no SQL, no migration files exist yet — this is
deliberately conceptual. Translating §2 into actual `CREATE TABLE`
statements is future additive work, once §3's open questions are
resolved and the test project (§4) is live to build against safely.

---

## 6. Organization/counterparty split — table shapes (2026-07-22)

**Decision on §3 open question 1: split, not a role flag.** Two separate
types: `organizations` stays tenant-only (unchanged shape — no migration
needed on it at all); a new table holds the counterparty side. The test
project (§4) is now live and wired up, so this is concrete enough to
become a migration when approved — still design-only for now, per this
session's instruction.

### 6.1 Naming: `counterparties`, not `Entity`

`Entity` was on the table as an option but I'm recommending against it,
for a reason specific to this schema rather than taste:

- `workflow_events` already has `entity_type` / `entity_id` as its
  **generic polymorphic reference to any ontology object** (`application`
  or `case` today, more as the ontology grows). The edge table proposed
  below (§6.3) needs the same generic polymorphic pattern for its
  `from_type`/`to_type` columns.
- Naming the new *specific* counterparty table `entities` while `entity_type`
  already means *"any node in the ontology, whatever kind"* creates a
  standing collision — every future reader has to remember that "entity"
  means two different things depending on which table they're looking at.
- `counterparties` is also just domain-accurate: the case seed data's own
  narratives already use the word ("two counterparties... previously
  flagged in unrelated structuring investigations" — `INV-1038`), and the
  AML/compliance context this table exists for is exactly counterparty
  risk, not generic entities.

Type name in the ontology: **Counterparty**. Table name: **`counterparties`**.

Note: this is distinct from **Person** (§2.1, still open per §3 question 2).
`Counterparty` is for company/organization-shaped non-tenant parties
(e.g. "Meridian Capital Ltd"); `Person` is for individual humans (UBOs,
PEPs, applicants). Not resolving Person's backfill question here — see
§6.4 for how edges can reference `person` as a type before that table
exists.

### 6.2 `counterparties`

```sql
CREATE TABLE counterparties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  -- Tenant scope — non-negotiable per CLAUDE.md principle 3. A counterparty
  -- record is *who Tenant A is investigating*, not a shared directory —
  -- two tenants independently tracking "Meridian Capital Ltd" get two
  -- separate rows, never one shared row. Leaking counterparty intel across
  -- tenants would be a real competitive/confidentiality problem, not just
  -- a modeling nicety.
  organization_id UUID NOT NULL REFERENCES organizations(id),

  name                TEXT NOT NULL,
  jurisdiction        TEXT,
  registration_number TEXT,               -- company reg #, often unknown at case-open time

  -- How this record entered the graph — traceability, not enforcement.
  source TEXT NOT NULL DEFAULT 'case_investigation'
    CHECK (source IN ('case_investigation', 'application_borrower', 'manual', 'external_feed')),

  risk_rating TEXT CHECK (risk_rating IN ('low', 'medium', 'high', 'critical')),

  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX ON counterparties(organization_id);
-- Soft per-tenant dedup, not global — see tenant-scope note above.
CREATE UNIQUE INDEX ON counterparties(organization_id, name) WHERE deleted_at IS NULL;
```

### 6.3 Referencing from existing `cases` / `applications`

Extend, don't replace: add a nullable FK, keep the existing text field.

```sql
ALTER TABLE cases ADD COLUMN IF NOT EXISTS counterparty_id UUID REFERENCES counterparties(id);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS counterparty_id UUID REFERENCES counterparties(id);
```

- `cases.entity_name` (existing free text) is untouched — old rows stay as
  they are, no backfill. New cases can populate both `entity_name` (display)
  and `counterparty_id` (graph edge target).
- `applications.counterparty_id` is nullable and, realistically, rarely
  populated today — the table's shape (`employment_type`,
  `gig_platforms`, etc.) is consumer-lending-oriented, not business-entity
  oriented. It exists for the business-loan case §2.1 already called out
  ("edges to Organization (if a business loan)" — now Counterparty).

### 6.4 Edge tables (§2.2) — one generic `ontology_edges` table

The decided engine is Postgres edge tables via recursive CTEs (§3.3,
already decided), so the question is one generic edge table vs. one table
per relationship type. Recommendation: **one generic table**, mirroring
the polymorphic pattern `workflow_events` already established in this
schema — consistent with "extend, don't replace" (new edge types are a
`CHECK` constraint update, not a new table) and avoids seven near-identical
join tables for what's structurally the same shape.

Trade-off, stated plainly: polymorphic `from_id`/`to_id` can't carry a
real FK constraint (the referenced table varies by `from_type`), so
referential integrity here is enforced at the application layer, not the
database — the same trade-off `workflow_events.entity_id` already accepted
in this codebase, not a new risk being introduced.

```sql
CREATE TABLE ontology_edges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  organization_id UUID NOT NULL REFERENCES organizations(id),  -- tenant scope, non-negotiable

  edge_type TEXT NOT NULL CHECK (edge_type IN (
    'owns',             -- Person -> Counterparty | Counterparty -> Counterparty (use weight = ownership %)
    'related_to',       -- Person -> Person (family / PEP linkage)
    'counterparty_of',  -- Counterparty -> Counterparty (transaction relationship)
    'references',       -- Application -> Counterparty (borrowing entity)
    'investigates',     -- Case -> Counterparty | Person
    'relates_to',       -- Case -> Application (closes the §1 applications/cases gap)
    'assessed',         -- Score -> Application
    'acts_on'           -- Decision -> Score
  )),

  from_type TEXT NOT NULL CHECK (from_type IN ('person', 'counterparty', 'application', 'case', 'score', 'decision')),
  from_id   UUID NOT NULL,
  to_type   TEXT NOT NULL CHECK (to_type IN ('person', 'counterparty', 'application', 'case', 'score', 'decision')),
  to_id     UUID NOT NULL,

  weight    NUMERIC,   -- e.g. ownership % for 'owns'; nullable, most edge types are unweighted
  rationale TEXT,       -- human-readable evidence, e.g. "32% UBO stake per Companies House filing"
  actor_id  TEXT,        -- who/what asserted this edge — mirrors workflow_events.actor_id
  metadata  JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX ON ontology_edges(organization_id);
CREATE INDEX ON ontology_edges(from_type, from_id);
CREATE INDEX ON ontology_edges(to_type, to_id);
CREATE INDEX ON ontology_edges(edge_type);
```

`from_type`/`to_type` include `'person'` even though the `Person` table
doesn't exist yet (§3 question 2, still open) — that's fine at the schema
level, the same way `workflow_events.entity_type` already tolerates types
without full referential enforcement. No edge should actually be written
with `from_type = 'person'` or `to_type = 'person'` until Person is
resolved; that's an application-layer rule, not a schema one.

### 6.5 What's still not decided

- Person table shape and backfill (§3 question 2) — unchanged, still open.
- Whether `counterparties` needs its own `case_actions`/`comments`-style
  workflow tables, or whether investigation activity on a counterparty
  stays modeled through the `Case` it's linked to via `investigates` — not
  addressed here, worth a follow-up if counterparties start accumulating
  their own standalone activity outside any case.
- Migration filename/sequencing when this is approved:
  `supabase/migrations/<timestamp>_add_ontology_counterparty_and_edges.sql`,
  applied to `ethosfi-test` (`gwvhlemfubmcnbzdarnx`) first per the
  established gate, verified there before any production path is even
  discussed.
