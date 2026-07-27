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
  **Scope note added 2026-07-22:** when Person is eventually designed, it
  must not be scoped as "AML counterparty individuals only" (UBOs, PEPs,
  directors). `lib/investigation-demo.ts`'s Fatima Okoye case
  (`INV-1052`) — positive credit scoring for a thin-file/gig-income
  applicant, not an AML investigation — is a core part of EthosFi's
  differentiation (financial inclusion, not just risk detection), and it
  was deliberately excluded from the §6.6 counterparty backfill below
  because "counterparty" is the wrong concept for an applicant. Person
  needs to represent *both* investigated individuals (UBOs, PEPs,
  directors — see §6.6) *and* applicants like Fatima, or the graph will
  structurally only ever reflect risk/AML cases and miss the
  inclusion-side use cases EthosFi is meant to also serve.
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

### 6.6 Status: applied and backfilled on `ethosfi-test` (2026-07-22)

The migration in §6.2–§6.4 was applied to `ethosfi-test`
(`gwvhlemfubmcnbzdarnx`) and verified (FK enforcement, per-tenant unique
dedup, edge-type/from-type/to-type CHECK constraints, `updated_at`
trigger — all confirmed against real inserts, then rolled back). See
`supabase/migrations/20260722000000_add_ontology_counterparty_and_edges.sql`.
**Not applied to production.**

The five AML demo cases from `lib/investigation-demo.ts` (Meridian Capital
Ltd, Vega Trade Finance, Nakamura Holdings, Atlas Logistics Co, Elara
Commodities) were backfilled onto `ethosfi-test` as real rows, sourced
field-for-field from the dossier data already validated on Screen 2 (not
re-derived from `supabase_setup.sql`'s older, differently-shaped case
data):

- **11 `counterparties` rows** — the 5 case subjects plus 6
  referenced-only entities from each dossier's `connectedEntities`
  ("Parent"/"Counterparty" relations): Apex Holdings, Gulf Bridge FZE,
  Nakamura Estate KK, Lion City Ventures Pte, Lagos Freight Partners, Zug
  Metals AG.
- **5 `cases` rows**, each with `counterparty_id` linked to its subject.
- **12 `ontology_edges`**: 5 `case --investigates--> counterparty`, 2
  `counterparty --owns--> counterparty` (parent relations, weight left
  null — the dossiers never state an ownership %), 5
  `counterparty --counterparty_of--> counterparty` (transaction/linked
  relations).
- **Deliberately not modeled as edges** — flagged during design review
  rather than forced:
  - Five "Director" relations (J. Hartwell, A. Farouk, P. Okafor, H.
    Meier) — a director isn't necessarily an owner (`owns` implies
    equity) and isn't a person-to-person link (`related_to`); the real
    fix is a `Person` entity plus a future `officer_of` edge type, both
    out of scope here.
  - Nakamura Holdings' UBO/PEP relationship (32% stake via a family
    member of a sitting cabinet minister) — this is exactly the
    `Person --owns--> Counterparty` / `Person --related_to--> Person`
    edge pair that §6.4's own migration comments say not to write until
    Person is resolved. Represented instead as structured `metadata` on
    the Nakamura Holdings `counterparties` row
    (`{"pep_exposure": true, "ubo_note": "..."}`)  — queryable as data,
    explicitly not a graph edge, so nothing pretends this is real graph
    traversal before Person exists.
- Fatima Okoye (`INV-1052`) intentionally excluded from this backfill —
  see the Person scope note above (§6.5).

---

## 7. Person entity — table shape (design draft, 2026-07-22)

Resolves §3 question 2 / §6.5's scope note. Design-only, per this
session's instruction — no migration yet, same pattern as §6 before it
was implemented.

### 7.1 One type, not a split — and why that's a different call than §6

§6 split `Organization` into `Organization` (tenant) vs `Counterparty`
because of a concrete hazard: a counterparty inheriting tenant-level RBAC
permissions. **That hazard doesn't have an equivalent here.** Neither an
applicant nor a UBO/PEP is ever an `organization_members` row — a
`Person` node, in either context, is never a login, never holds a role,
never gets granted access to anything. There's no permission-inheritance
risk to design around, so the reason that forced a split in §6 simply
isn't present for Person.

More positively: a single type is what makes the ontology's actual value
possible. If "applicant Person" and "risk Person" were separate tables, a
real cross-referencing question this graph exists to answer — *"is this
loan applicant also a UBO flagged in another case?"* — would require
joining two structurally identical tables that happen to have different
names, instead of being a one-hop edge traversal. A human doesn't stop
being one person because they show up in two different contexts.

Per Architecture Principle 1 (ontology-first: *"what does it relate to,
who can act on it"*), the correct framing is that **role is relational,
not a property of the entity.** Whether a `Person` row represents "an
applicant," "a UBO," or both, is expressed entirely by which edges point
at it (`Application.applicant_person_id`, an `owns`/`related_to` edge in
`ontology_edges`) — never by a type flag on the row itself. That also
means a person who applies for a loan under one tenant's case and is
later flagged as a UBO under a (possibly different) tenant's
investigation is representable as the same node with two roles, which is
exactly the kind of insight a real entity graph is supposed to surface —
not something to architect away by splitting the table.

### 7.2 `persons`

```sql
CREATE TABLE persons (
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

CREATE INDEX ON persons(organization_id);
```

**Deliberately no unique-name index**, unlike `counterparties`
(§6.2's `(organization_id, name)` unique index). Two different humans
sharing a name (two applicants both named "John Smith" at the same
tenant) is far more likely than two companies sharing a name, and a
unique constraint would silently force a false identity merge — a much
worse failure mode here than the duplicate-row risk it would prevent.
Real identity resolution (same person referenced twice — via DOB,
national ID, fuzzy name matching) is a genuinely hard, separate problem,
explicitly out of scope for this table shape and not something to fake
with a name-uniqueness shortcut.

**Deliberately minimal** — no `is_applicant`/`is_pep`/role columns (role
is relational, §7.1), no KYC-specific fields beyond what both contexts
already share. `metadata JSONB` is the extension point for
context-specific detail that doesn't yet warrant its own column, same
pattern as `counterparties.metadata`.

### 7.3 Referencing from `applications` and `ontology_edges`

```sql
ALTER TABLE applications ADD COLUMN IF NOT EXISTS applicant_person_id UUID REFERENCES persons(id);
```

- `applications.full_name`/`.email` (existing) are untouched — extend,
  don't replace, no backfill. New applications can populate both the
  existing text fields (display) and `applicant_person_id` (graph edge
  target).
- **`ontology_edges` needs no schema change at all.** `from_type`/`to_type`
  already accept `'person'` (§6.4's CHECK constraint was written
  anticipating exactly this) — that constraint just stops being
  theoretical once `persons` exists to back those IDs. `owns` and
  `related_to` edges (Nakamura's UBO/PEP relationship, §6.6) become
  writable the moment this table exists; no edge-table migration needed.

### 7.4 Existing data — not migrated by this design, scoped as follow-ups

Consistent with how `counterparty_id` backfill was handled in §6 (no
backfill of pre-existing rows, forward population only): this design does
not migrate existing data. Two distinct follow-ups, to be scoped and
confirmed separately when asked for, same "hold here" pattern as before:

1. **Nakamura's UBO/PEP metadata → real Person + edges.** Currently
   `{"pep_exposure": true, "ubo_note": "..."}` on the Nakamura Holdings
   `counterparties` row (§6.6). Once `persons` exists, this becomes: a
   `persons` row for the UBO (name not currently captured anywhere —
   the dossier only says "a first-degree family member of a current
   Japanese cabinet minister," not a name; `connectedEntities` lists "K.
   Nakamura" as the UBO field, which may or may not be that family
   member specifically — this ambiguity needs resolving with real data
   before writing the row, not guessed), a `Person --owns--> Counterparty`
   edge (weight = 32), and ideally a `Person --related_to--> Person` edge
   for the minister linkage (second person, also unnamed in the dossier).
   The counterparty `metadata` field should stay as a human-readable
   fallback even after this, not be deleted — it's the audit-trail
   explanation for why the edges exist.
2. **`applications.full_name` → `persons` backfill.** Unlike the AML
   cases (all newly-created rows this session), `ethosfi-test` already
   has pre-existing `applications` rows (Alice/Bob/Carol Alpha, Dave
   Beta, from `setup-test-db.sql`'s seed) that would need
   `applicant_person_id` populated retroactively for this to be more than
   forward-only. This is real backfill work with real risk (matching text
   names to new Person rows correctly), not a byproduct of adding the
   column — scope it as its own project when it's actually needed, don't
   bundle it into "add the Person table," per the same caution §3
   originally flagged for this exact question.

### 7.5 Naming

`persons`, not `people`. Both are valid English plurals; `persons` is the
term already implicit in this document's own vocabulary (`Person` as the
type name, KYC/AML terms like PEP and UBO are themselves
compliance-domain language for "a person entity") and avoids `people`
reading as a collective/group noun in schema contexts. Not a load-bearing
decision either way — flag if you'd prefer `people` for consistency with
`counterparties`' plain-English pluralization.

### 7.6 Backfill plan — `applications` → `persons` (design draft, 2026-07-22)

Design-only, per this session's instruction — moving at a measured pace,
not implementing yet. Grounded in `ethosfi-test`'s actual current data,
not a hypothetical: `applications` currently has **7 rows, not the clean
4 from the original seed** (Alice/Bob/Carol Alpha, Dave Beta) — three are
literal duplicates: `Isolation Test Applicant` /
`isolation-test@example.com`, same org (`aaaaaaaa-...`), created by the
HTTP isolation test suite's POST test across three separate runs earlier
this session. This turns out to be a genuinely useful, if accidental,
rehearsal input for question 1 below.

**1. Mapping `full_name`/`email` → a `persons` row — dedup key.**
Recommend keying on **`(organization_id, lower(email))`**, not name.
Email is the stronger identity signal — two real humans sharing a name is
common (two different "Alice Smith"s at the same tenant is entirely
plausible), sharing an exact email is much less likely outside genuine
duplicates. Under this key, `ethosfi-test`'s real data resolves to **5
`persons` rows**, not 7: Alice Alpha, Bob Alpha, Carol Alpha, Dave Beta
(each with a distinct org/email, one row each), and **one**
`Isolation Test Applicant` row shared by all three duplicate
`applications` rows.

That last collapse is the honest, slightly uncomfortable answer to "could
duplicates exist even in this small dataset": **yes, confirmed, not
hypothetical** — but note what kind of duplicate this actually is. These
three rows aren't three real people who happen to share contact details;
they're test-harness noise, the same fixture re-inserted three times by
re-running the same test. The `(org, email)` key can't tell the
difference between "this is genuinely the same applicant reapplying" and
"this is a test artifact" — it only sees identical email + org and
correctly collapses them either way. That's not a flaw in the key, it's
the honest limit of what identity resolution from `(name, email)` alone
can ever tell you (same limit already noted in §7.2 re: no unique-name
index — full identity resolution needs more signals: DOB, national ID,
phone). For this specific dataset the collapse happens to be correct by
coincidence (all three *should* map to one node, since they're not real
distinct applicants); a real production backfill won't have this
convenient coincidence and needs to be designed knowing the key can be
wrong in both directions (splitting one real person into two rows on a
typo'd email, or merging two different real people who happen to share
one).

**2. Backfilling `applicant_person_id` — same effort, separate migration
file.** Recommend doing both steps (create `persons` rows, then set
`applications.applicant_person_id`) as one combined backfill operation —
splitting "create the person" from "point the application at it" would be
arbitrary, since an orphaned `persons` row with nothing referencing it
accomplishes nothing on its own; the FK update *is* the deliverable.
But: keep this backfill **script/migration separate from §7.3's schema
migration** (the `ALTER TABLE ... ADD COLUMN applicant_person_id`), the
same way §6's counterparty schema and its later demo-data backfill
(§6.6) were two separate commits, not one. Reasoning holds identically
here: a schema-only change can be rolled back cleanly without also having
to reverse data mutations; bundling them removes that option for no
benefit.

**3. Is `ethosfi-test` a fair rehearsal for this?** Partially — worth
being explicit about what does and doesn't carry over:

*Does carry over:* the mechanical logic (dedup-key grouping, upsert
persons, update applications), the FK/constraint behavior, the
multi-tenancy scoping discipline, and the "verify on ethosfi-test before
production" process itself — none of that depends on data realism.

*Doesn't carry over, and would need separate consideration before a real
backfill:*
- **Volume.** 7 rows here vs. a real production `applications` table —
  batch size, transaction duration, and index lock contention on a live
  table are untested by this rehearsal at any scale.
- **Duplicate *character*, not just duplicate *existence*.** This
  dataset's duplicates are clean, exact-match test-harness artifacts
  (identical string down to the character). Real duplicates come from
  actual human behavior — typo'd emails, a work vs. personal email for
  the same person, "Alice J Alpha" vs "Alice Alpha" — messier than an
  exact-match key can resolve. A real backfill likely needs email
  normalization (`lower(trim(email))` at minimum) and probably a manual
  review queue for near-misses, neither of which this rehearsal exercises
  since the test data doesn't need it.
- **PII handling discipline.** Test data has no real confidentiality
  requirement; a backfill script written loosely against it (e.g.
  logging names/emails to stdout for debugging) would be a real problem
  if that habit carried into a script run against actual applicant PII.
  Worth writing the real script assuming it'll be reviewed under that
  standard from the start, not adding scrubbing after the fact.
- **Downstream referential depth.** Production applications likely carry
  more attached history (`scores`, `decisions`, `workflow_events`) per
  row than this test dataset does — this rehearsal doesn't stress-test
  whether the backfill script behaves correctly when an application has
  substantial related data attached.

Net: worth doing as a rehearsal for the *mechanics*, not as evidence the
real backfill is low-risk. The real one needs its own explicit risk pass
when it's actually scheduled, not an assumption that "we already tested
this on ethosfi-test."

---

## 8. Future workstreams (design/reference only, 2026-07-27)

**Status: reference-only, no urgency, not to be implemented now.** Same
treatment as everything else held in this document — recorded so the
thinking isn't lost, not queued as active work. Pick up whichever one
becomes relevant, independently of the other two; they don't depend on
each other.

### 8.1 Person entity implementation

§7 already designed the `persons` table shape, the single-type-not-a-split
reasoning, the `applications`/`ontology_edges` wiring, and the backfill
plan (§7.6). What's left is purely technical execution: the migration
itself (mirroring §6's pattern — schema first, verified on `ethosfi-test`,
backfill as a separate follow-up commit) plus whatever UI wiring surfaces
`persons` data (e.g. a "connected entities" view resolving real edges
instead of `lib/investigation-demo.ts`'s static `connectedEntities`
mock).

**This does not depend on any external input** — no partner, no CDFI
data, no business decision is needed to build it. It's ready to build
whenever it's prioritized, purely a scheduling/priority call, not a
blocked one.

### 8.2 LLM output stability testing

**Not yet tested — flagging a real gap, not reporting a result.** The
scoring engine (`lib/scoring-engine.ts`, `scoreApplication()`) generates
free-text rationale/explanation alongside the deterministic score. The
score itself is deterministic (`computeRiskBand()`, `lib/ethoscore-v2.ts`)
and unaffected by LLM variance, but the *explanation text* the LLM
generates for a given application has never been checked for
consistency across repeated runs. Proposed test: run the same case
through the scoring engine 10-20 times and compare the generated
explanations for **substantive consistency** — same facts cited, same
reasoning, same conclusion — not exact wording (verbatim match is the
wrong bar; paraphrasing the same reasoning differently each time would be
fine, contradicting itself between runs would not).

This matters for the EU AI Act explainability posture this project
already cares about (`computeRiskBand()` was made deterministic in Phase
3.5.1 for exactly this kind of reason) — an explanation that changes its
stated reasoning between two runs on identical input data is a real
explainability problem, not a cosmetic one, even though the score itself
stays fixed.

**Testable now, no external dependency** — this can be built as a
standalone test/script today, run against `ethosfi-test` or even a
disconnected harness, using existing seed application data. No reason
this needs to wait for a partner, a pilot, or any Phase 4 schema work —
flagged as available to pick up independently of §8.1 or §8.3.

### 8.3 "Relevant memory" for repeat applicants

How much weight should historical events carry in a re-score — is a late
payment from 3 years ago treated the same as one from last month, or
should recency matter? This is the kind of question the eventual
`Person`/graph-traversal work (§7, §8.1) will make newly *possible* to
answer with real historical data once an applicant is a queryable node
across multiple applications — but the question itself is not an
engineering question and has no correct answer derivable from the
codebase or from first principles.

**This explicitly depends on external input, unlike §8.1 and §8.2.** It's
a business/credit-policy decision — what a real CDFI's own underwriting
practice actually treats as stale vs. still-relevant history — not
something to guess at or encode a plausible-sounding default for ahead of
that input. Per the sequencing already established in
`docs/LONG_TERM_VISION.md` (evidence-gated, not calendar-gated), this
should stay unscoped until there's a real CDFI relationship to actually
ask.
