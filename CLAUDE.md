# EthosFi — Chief Architect Memory (CLAUDE.md)

> This file is the persistent architectural memory for the EthosFi project.
> Claude Code auto-loads files named CLAUDE.md from the project root at the
> start of every session. Read this entire file before writing any code.

## What This Project Is

You are the **Chief Architect** of EthosFi — a Decision Intelligence Platform
for cross-border SME finance.

EthosFi is a **Palantir-tier Decision Intelligence Platform** specifically
designed for **cross-border SME finance**, combining ethical scoring
(EthoScore), workflow automation, multi-party collaboration, and deep
operational intelligence — available to SMEs, financial institutions, and
advisors.

| Palantir Concept | EthosFi Implementation |
|---|---|
| **Ontology** — a live model of the business world | Companies, Deals, Parties, Scores, Workflows, Events |
| **Operational Intelligence** | EthoScore engine, risk dashboards, compliance monitoring |
| **Workflow Orchestration** | Case management, approval chains, document workflows |
| **Multi-party Collaboration** | SMEs, lenders, advisors, partners on one platform |

Do not implement generic features. Every feature must map to one of these
four pillars.

---

## Current State — Phase 3.5 COMPLETE — Ready for Phase 4

Phases 1, 2, and 3 are **built, deployed, and live** at
ethosfiai-mvp.vercel.app. **Phase 3.5 (Production Hardening) is now fully
complete — all 6 blocks closed.** Per founder/advisor agreement, Phase 4
work may begin, and a single calibration outreach send may proceed.

**Phase 1 (MVP):** Auth (JWT), EthoScore v1, company profiles, deal tracking,
document management, basic dashboard, core API.

**Phase 2 (Enterprise Foundation):** Multi-tenant org isolation (JWT-based RLS
across 8 tables), RBAC (5 roles, `lib/permissions.ts`, fail-closed guards in
`lib/api-guard.ts`), workflow state machine (`lib/workflow-engine.ts`) with
immutable `workflow_events` log, Partner API (SHA-256 hashed keys, scoped
`/api/v1/` routes, rate limiting, HMAC webhooks), case management
(`case_comments`, `case_tasks`, `lib/case-manager.ts`), notification system.

**Phase 3 (Intelligence Layer) — COMPLETE and AUDITED:**
- `lib/ethoscore-v2.ts` — 4-pillar deterministic scoring (0–1000), 10
  factors, ESG-clean; runs alongside v1 with try/catch isolation in
  `app/api/score/route.ts`
- `lib/anomaly-detector.ts` — 5 parallel detectors with severity levels,
  thresholds documented
- `lib/risk-dashboard.ts` — immutable snapshots (exposure, distribution, top
  risks, anomalies)
- `lib/benchmarking.ts` — peer cohort comparison, privacy-safe (min cohort
  raised to 12), insufficient-data fallback
- `lib/ai-review.ts` — Claude-powered analysis hardened with system/user role
  separation, output validation (`validateReviewOutput`), no DB tool access
  (architecturally cannot exfiltrate cross-org data), advisory-only output
  (cannot alter scores or trigger decisions)
- `lib/predictive.ts` — historical outcome prediction with transparent
  confidence scoring
- Routes: `/api/v1/applications/[id]/benchmark`, `/predict`, `/ai-review`;
  `/api/v1/cases/[id]/ai-review`; `/api/v1/risk/snapshot` (GET/POST)
- DB: `scores` extended with `score_version`, `score_pillars`;
  `risk_snapshots` table; `workflow_events` CHECK constraint updated
- Investor/design-partner demo dashboard live at `/demo`, token-gated
  (`DEMO_ACCESS_TOKEN`), uses real engines against isolated seed/demo org
  data; peer comparison clearly labeled illustrative until 12+ scored
  applications exist in a segment

**Platform totals:** 15 DB tables, 23+ API routes, 18+ lib modules,
~3,400+ lines added across phases.

**Audit status:** Full Phase 1–3 audit completed. All findings closed.

### ✅ Phase 3.5 (Production Hardening) — COMPLETE. Phase 4 may begin.

Per founder/advisor agreement, the GTM/outreach trigger has now fired:
Phase 3.5 is complete and no critical findings remain open (one low-severity
test-environment-only risk is documented and accepted — see block 3.5.6
below). Phase 4 architecture work may start, and a single calibration
outreach send (one institution, learning not growth) may proceed.

### ⚠️ Critical Rule: Do Not Break Existing Work

Never rewrite, replace, or restructure existing working code unless:
1. A bug makes it non-functional, OR
2. A feature is architecturally incompatible with the current implementation
   AND you've explained why to the user first.

Extend. Don't replace.

---

## Phase 3.5 — Production Hardening — Block Status

#### 3.5.1 — Testing & QA ✅ DONE
167 tests across 13 files. Unit tests for all 6 Phase 3 lib modules.
Real HTTP-level integration tests for multi-tenancy isolation, scoring
pipeline, and RBAC (via `endpoint-isolation.test.ts` — actual `fetch()` calls
against running routes with real org-scoped API keys, NOT database-layer
query simulations). Automated adversarial prompt-injection test against
`lib/ai-review.ts`. `computeRiskBand()` made fully deterministic (was
previously AI-prompt-dependent — a real EU AI Act explainability gap, now
fixed in `lib/scoring-engine.ts`).

**Caught during review — two false-positive tests found and fixed:** an
early "production safety check" test reimplemented its own logic instead of
calling the real `getTestSupabase()` function (would have passed even if the
real function were broken). An early multi-tenancy isolation test queried
Supabase directly instead of hitting real HTTP routes (would have passed
even if RBAC/RLS were broken). **Lesson: always demand to see actual test
code, never accept a summary table as proof.**

#### 3.5.2 — Observability ✅ DONE
- `lib/logger.ts` — structured JSON logging, 39 `console.*` calls migrated
- Sentry (`@sentry/nextjs`) live in production
- **Caught during review — real PII leak found and fixed:** initial
  `beforeSend` only scrubbed `email`, leaving `applicant_name` and
  `applicant_income` in plaintext in Sentry events. Fixed with an
  **allowlist approach** (`SAFE_EXTRA_KEYS` — only known-safe keys like
  `orgId`, `route` pass through; everything else defaults to `[scrubbed]`).
  Verified live with a real test event before closing.
- `GET /api/health` — unauthenticated, checks DB connectivity
- `GET /api/v1/events` — general-purpose `workflow_events` query route,
  org-scoped, behind partner auth (filters: entity_type, event_type, since,
  until, limit)
- `audit_events` schema gap fixed (missing AI columns added to production)

#### 3.5.3 — Reliability ✅ DONE
- 22 try/catch blocks audited across 12 files. 1 fixed (silent health-check
  catch), 2 documented as intentionally silent with inline comments, 19
  already correct.
- Webhook + notification delivery: 3 attempts, exponential backoff
  (1s→2s→4s). `X-EthosFi-Event-Id` + `X-EthosFi-Delivery-Attempt` headers.
  No exactly-once guarantee — partners must dedupe by event ID (documented,
  not solved — that's the honest state).
- **Caught during review — real gap found:** Supabase free tier provides
  **zero automatic backups**. Mitigated with `scripts/backup-restore-test.mjs`
  (JSON/REST-based backup+restore — actually tested: backed up 60 rows,
  deleted 3, restored, counts matched). `scripts/backup-db.sh` (pg_dump-based)
  exists but is marked **UNTESTED** (no local Postgres client tools) — do not
  rely on it without testing first. Recommendation: upgrade production to
  Supabase Pro ($25/mo) before any real institution's data is in the system.

#### 3.5.4 — Documentation ✅ DONE
- `docs/openapi.yaml` — created from scratch (was listed as a Phase 2
  deliverable but never actually existed). Covers all 22+ routes.
- `docs/RUNBOOK.md` — 6 sections: webhook failures, stuck workflow states,
  score computation errors, manual backup procedure, Sentry monitoring,
  notification delivery failures. Symptom → where to look → fix format.

#### 3.5.5 — Explainability in Production ✅ DONE
- "Why This Score" breakdown (score ring + 4 pillar cards + per-factor bars)
  ported from `/demo` into `app/score/[id]/page.tsx` — the real user-facing
  score view. Renders conditionally (only for v2 scores with non-null
  `score_pillars`; v1-only scores keep the old 5-factor view). Reuses
  `ScoreRing`, `PillarBar`, `PILLAR_LABELS` components from the demo. No RBAC
  change — same access as existing score visibility.
- Note: original plan considered moving the scoring engine to Claude Fable 5
  for stronger EU AI Act explainability. **Access to Fable 5/Mythos-tier
  models is currently suspended pending an export control directive** — check
  current availability before planning this in.

#### 3.5.6 — Security Beyond the Audit ✅ DONE — PHASE 3.5 IS NOW COMPLETE
- Dependency scan: `form-data` + `hasown` fixed via `npm audit fix`. `next.js`
  (19 advisories) + `postcss` deferred — requires a major version bump,
  advisories target Image Optimization/i18n/cache poisoning, not exploitable
  given EthosFi's API-first architecture (no `next/image`, no i18n usage).
- Cross-org isolation: 100% coverage now (12/12 Partner API v1 endpoints).
  6 new test blocks / 17 new test cases added to `endpoint-isolation.test.ts`
  (applications POST, predict, audit, cases/comments, cases/timeline, events).
- Secrets inventory complete: Supabase keys, Anthropic key, Sentry DSN,
  Resend key, demo token — all confirmed env-only in production, rotation
  path documented for each.

**⚠️ ACCEPTED/DEFERRED RISK (does not block Phase 3.5 closure):** The
**test** Supabase project's `anon` and `service_role` JWTs (project ref
`ehmingbvknavehcjgkou`) were found committed in `supabase_setup.sql`, pushed
to `origin/main` on GitHub. Confirmed via decoded JWT claims — these are
TEST project keys only, never production. Rotation via Supabase dashboard
UI was attempted twice and blocked (legacy key regeneration isn't
straightforwardly exposed in the current UI for this project). **Risk
accepted as low**: test project contains only synthetic seed data, fully
recreatable from committed SQL scripts in minutes, no production impact.
The file itself has been cleaned going forward (JWTs removed from
`supabase_setup.sql` in a follow-up commit), but the keys remain visible in
git history. **Revisit when:** creating a fresh test project becomes
convenient, or Supabase's UI changes to better expose legacy key rotation.

**🎉 Phase 3.5 (Production Hardening) is complete — all 6 blocks closed.**
Per founder/advisor agreement, Phase 4 work may now begin, and a single
calibration outreach send (one institution, learning not growth) may
proceed.

### Phase 3.5 Completion Checklist (= GTM/Phase 4 trigger) — ALL CHECKED ✅
- [x] All 6 Phase 3 lib modules have unit tests
- [x] Integration tests cover scoring, RBAC, and multi-tenancy (real
      HTTP-level isolation, verified after catching 2 false-positive tests)
- [x] Adversarial AI-security test is automated and passing
- [x] Structured logging replaces ad-hoc console logging
- [x] Error monitoring is live (Sentry) — PII scrubbing verified live
- [x] Health-check endpoint exists
- [x] All try/catch blocks audited for silent failures
- [x] Webhook/notification retry logic in place
- [x] Backup/recovery tested with an actual restore
- [x] OpenAPI spec confirmed current
- [x] Operational runbook written
- [x] "Why This Score" explainability is in the real product, not demo-only
- [x] Dependency vulnerability scan run and findings triaged
- [x] Cross-org isolation has automated regression tests (100% coverage)
- [x] Secrets management reviewed (one accepted/deferred low-severity risk
      noted above — test project keys only, no production impact)

---

## PARALLEL WORKSTREAM — Backtesting Tool (BUILD-ONLY, DORMANT)

**Status: built and verified. USE is gated by the same GTM trigger as
everything else — do not use against real institution data or demo
externally until the trigger fires.**

"Upload historical loan portfolio → run EthoScore v2 in batch → generate an
explainable performance report" — fully isolated from live scoring.

- `lib/backtest-engine.ts` — CSV parsing, configurable field mapping
  (auto-guess + override), batch scoring (chunked), evaluation report
  (precision/recall, confusion matrix, plain-language summary)
- Tables: `backtest_runs`, `backtest_results` (immutable, separate from
  `scores`) — **exist only on the test Supabase project, not production**
- Imports the real `computeRiskBand()` — not a reimplementation
- Token-gated (`BACKTEST_ACCESS_TOKEN`), not linked from any nav
- Verified: 15-row sync upload (real report generated), 205-row async path
  (pending→processing→completed, 0 errors), confirmed it targets test DB
  only via the same env-var pattern as the rest of the app

---

## Phase Roadmap (Full)

### PHASE 1 — MVP (DONE ✅)
Core platform: auth, EthoScore v1, deals, documents, basic dashboard.

### PHASE 2 — Enterprise Foundation (DONE ✅)
Multi-tenancy, RBAC, workflow engine, Partner API, case management,
notifications. See "Current State" above for what's actually built.

### PHASE 3 — Intelligence Layer (DONE ✅)
EthoScore v2, risk dashboard, anomaly detection, benchmarking, AI-assisted
review, predictive analytics. See "Current State" above.

### PHASE 3.5 — Production Hardening (IN PROGRESS — 5/6 blocks done)
See detailed block status above. **No new user-facing capabilities in this
phase** — durability only.

### PHASE 4 — Palantir Tier (NEXT, gated by Phase 3.5 completion)
EthosFi Ontology (live entity graph), Graph Explorer, Cross-Deal
Intelligence, Regulatory Intelligence engine, White-Label Platform,
Marketplace.

### PHASE 5 — Network Effects & Ecosystem
EthosFi Network, Lender Marketplace, Advisor Network, Data Products.

### PHASE 6 — Autonomous Operations
AI Agents, Autonomous Underwriting, Self-Optimizing Workflows.

---

## Architecture Principles

1. **Ontology-First Design** — every new entity: what is it, what does it
   relate to, what events can happen to it, who can act on it?
2. **Immutable Event Log** — append events, don't update in place; state is
   derived from event history.
3. **Multi-Tenancy is Non-Negotiable** — every query scoped by
   `organization_id`, no exceptions.
4. **API-First** — build the API endpoint before the UI.
5. **Extend, Don't Replace** — add nullable columns/new endpoints rather
   than restructuring.
6. **No Magic, All Explicit** — no implicit side effects, no global mutable
   state.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js |
| **Database** | PostgreSQL (Supabase) |
| **Auth** | JWT |
| **Hosting** | Vercel |
| **Error monitoring** | Sentry (`@sentry/nextjs`) |
| **Testing** | Vitest |

> ⚠️ Confirm exact framework/ORM versions by reading `package.json` before
> writing queries — don't assume.

Phase 4+ only (do not introduce earlier): Graph database, ML microservices,
vector search.

---

## Database Schema Conventions

Every table:
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Every tenant-scoped table:
```sql
organization_id UUID NOT NULL REFERENCES organizations(id)
```

Soft delete only (never hard-delete business data):
```sql
deleted_at TIMESTAMPTZ  -- NULL means active
```

---

## EthoScore — The Core Algorithm

EthoScore is EthosFi's proprietary ethical + financial risk score for
cross-border SME transactions. Score range: **0–1000**.

**v1** (current/legacy): company age, cross-border transaction history,
document completeness, identity verification level — Claude-generated
narrative + score.

**v2** (deterministic, current primary):
```
EthoScore: 0–1000
├── Trust Pillar      (0–300) — identity, verification, network
├── Track Record      (0–300) — history, completion rate, disputes
├── Financial Health  (0–200) — revenue proxies, growth signals
└── ESG Alignment     (0–200) — where data is available
```

`risk_band` (low/medium/high) is **fully deterministic** via
`computeRiskBand(score)` in `lib/scoring-engine.ts`:
`low = 70-100, medium = 40-69, high = 0-39` (normalized scale). This was
previously decided by the AI prompt — fixed during Phase 3.5.1 because
relying on an LLM to correctly apply a threshold every time is not
acceptable for EU AI Act explainability.

Never expose raw factor weights publicly. The score is an output, not a
formula.

---

## Hard-Won Lessons From the Phase 3.5 Audit Process

These are not theoretical — each one was a real gap found by refusing to
accept a summary/description as proof and demanding actual code/output:

1. **Never accept "tests pass" as proof of what a test claims to prove.**
   Always ask to see the actual test code. Two tests this project were
   structurally fake (tested a reimplementation of logic, not the real
   function/route) and would have passed even with broken security.
2. **Never accept "scrubbing works" without a real captured event.**
   `beforeSend`-style PII scrubbing looked correct by code review but had a
   real leak (only one field was actually scrubbed) until verified against
   a live Sentry event with fake PII.
3. **Never assume backups exist because a tier "should" include them.**
   Confirmed via actual dashboard inspection that Supabase free tier has
   zero automatic backups — this would only have been discovered during a
   real incident otherwise.
4. **When test counts don't reconcile, demand a literal re-run**, not a
   reconstructed explanation of why the numbers differ.
5. **A "done" or "closed" claim is not a closed item** until backed by
   pasted real code, a real command output, or a real dashboard screenshot
   description — apply this standard consistently, including to this file's
   own claims in future sessions.

---

## What NOT To Do

### 🚫 Never
- Rewrite working code without user approval
- Create generic CRUD features that don't map to the EthosFi ontology
- Skip multi-tenancy scoping on any new query
- Hard-delete business data
- Implement Phase 4+ features while Phase 3.5 is still open
- Make architectural decisions without explaining the trade-off
- Build active GTM/outreach tooling as anything other than dormant prep
  (founder/advisor trigger agreement)
- Accept your own "done"/"verified" claim without pasting real proof

### ✅ Always
- Read `package.json` and existing files before writing queries
- Add `organization_id` to every new table holding business data
- Log every significant state change as an immutable event (`workflow_events`)
- Write migrations, not schema drops/recreates
- Return consistent error shapes: `{ error: { code, message, details } }`
- Comment complex business logic, especially EthoScore calculations
- Show real code/output when reporting a task as complete

---

## How to Start a Work Session

1. **Confirm current phase/block** — check this file's status, ask if
   unclear
2. **Read existing code** — use `find`/`grep`/`cat` to understand what
   already exists, don't assume from this file alone for implementation
   details
3. **Confirm the stack** — read `package.json`
4. **Plan before coding** — state what you'll build, what tables/endpoints
   are affected, what risks exist
5. **Build incrementally** — one block/feature at a time, verify with real
   output before moving on

---

*This file is the persistent architectural memory of EthosFi. Keep it
current — update it whenever a block closes or a significant finding occurs,
the same way it's been maintained through Phase 3.5.*
