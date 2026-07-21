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
