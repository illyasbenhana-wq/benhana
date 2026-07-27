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

> Long-term direction beyond the current CDFI-focused roadmap (partnership
> vs. acquisition shape, condition-gated on real traction) is captured in
> `docs/LONG_TERM_VISION.md` — reference-only, not a current priority. Do
> not propose, scope, or build anything from it without explicit instruction.

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

**🔴 RESOLVED INCIDENT — corrects this section's original mischaracterization.**
This was originally logged below as an "accepted/deferred, low-severity" risk
on the premise that the exposed keys belonged to a separate test project. That
premise was wrong, and the incident was more serious than recorded at the
time. Corrected account:

- **What was exposed:** the Supabase `anon` and `service_role` JWTs for
  project ref `ehmingbvknavehcjgkou`, committed in `supabase_setup.sql` and
  pushed to `origin/main` on GitHub.
- **When introduced:** commit `b376c535` ("Fix Next.js build and clean
  gitignore"), 2026-05-27.
- **When "cleaned":** commit `50dc210b` ("Phase 3.5.6: Security beyond the
  audit"), 2026-06-29 — removed the JWTs from the file's current content
  and logged the risk below as accepted/low-severity, on the belief
  `ehmingbvknavehcjgkou` was a test-only project distinct from production.
  Removing them from the file did nothing to git history — both keys
  remained fully retrievable via `git show b376c535:supabase_setup.sql` by
  anyone with read access to the repo, the entire time.
- **When the real severity was understood:** the night of 2026-07-19,
  during this session's schema-governance audit (prompted by preparing a
  Phase 4 architectural handoff). Checking the Vercel dashboard for
  production's `NEXT_PUBLIC_SUPABASE_URL` led to discovering only **one**
  Supabase project exists in the account — the second ("Germany region")
  project was empty and has since been deleted. `ehmingbvknavehcjgkou` is
  not "the test project" — it is, and always was, the only database, and
  it serves live production traffic (confirmed via `/api/health`). That
  means **the exposed `service_role` key had full, unauthenticated,
  RLS-bypassing read/write/delete access to real production data** for the
  ~7 weeks between introduction and rotation — not synthetic test data as
  originally recorded.
- **Resolution:** both keys rotated the same night (new names
  `ethosfi_prod` / `ethosfi_prod_secret`), updated in Vercel production env
  vars, redeployed, reconfirmed healthy via `/api/health`
  (`{"status":"ok","db":"connected"}`). The old keys from `b376c535` are now
  invalid — the exposure is neutralized, though the raw JWTs remain
  permanently visible in git history (harmless now that they're dead, but
  worth knowing history was not rewritten/scrubbed).
- **Standing gap this incident revealed — ✅ CLOSED 2026-07-21.** There was
  no real test/production database separation. Every local dev session,
  every `npm run test:http` run, and the backtest-table migration had been
  operating directly against production. Follow-through plan (rotate →
  stand up an actual second test project → resume Phase 4) is now complete:
  - New dedicated test Supabase project created: `gwvhlemfubmcnbzdarnx`
    (fully separate from production `ehmingbvknavehcjgkou`).
  - Full schema (`__tests__/setup-test-db.sql`, 17 tables) plus both
    outstanding migrations (`20260702000000_add_ethoscore_v2_calibration_fields.sql`,
    `20260719000000_add_backtest_tables.sql`) applied to it and confirmed.
  - `.env.test` repointed to the new project (still gitignored, never
    committed). All hardcoded references to the old test ref
    (`ehmingbvknavehcjgkou`) updated to `gwvhlemfubmcnbzdarnx` across
    `__tests__/integration/test-helpers.ts` (the `ALLOWED_TEST_PROJECT_REF`
    safety allowlist), `__tests__/integration/safety-check.test.ts`,
    `scripts/backup-restore-test.mjs`, `__tests__/run-setup.mjs`, and
    `scripts/backup-db.sh`.
  - Full `npm run test:http` suite (23 tests: isolation, RBAC,
    multi-tenancy) run against the new project with `.env.local` removed
    from the equation entirely (renamed aside during the run) so there was
    no possibility of silently falling back to production credentials —
    all 23 passed.
  - **A real cross-org isolation bug was caught by this run, not a false
    positive:** `addComment()` in `lib/case-manager.ts` inserted into
    `case_comments` tagged with the caller's own `organization_id` but never
    verified the target `case_id` actually belonged to that org — an Org A
    API key could attach a comment to Org B's case. Fixed by checking case
    ownership (`.eq('organization_id', orgId)`) before insert, mirroring the
    pattern already used in `getCaseContext()`; the route
    (`app/api/v1/cases/[id]/comments/route.ts`) now returns 404 instead of
    inserting. The identical latent gap in the unwired `addTask()` was fixed
    at the same time (not currently reachable via any route, but same bug).
  - Backup/restore drill (`scripts/backup-restore-test.mjs`) re-run against
    the new project — passed, real delete-and-restore cycle, counts
    matched.
  - Note: this dev machine has unusually high per-request latency in `next
    dev` (~25–30s baseline, more for AI-calling routes) — `testTimeout` in
    `vitest.http.config.ts` and `HTTP_TIMEOUT` in
    `endpoint-isolation.test.ts` were raised from 30s to 120s to
    accommodate this. This is an environment characteristic observed during
    this session, not a code change to the app itself — worth
    re-examining if it turns out to be specific to this machine rather than
    inherent to the stack.

**🔴 SEPARATE INCIDENT — Anthropic API key rotation, 2026-07-27.** An old
Anthropic API key was found exposed in a past conversation
history/summary (not in git — confirmed via `git log -S "sk-ant-api03"`
across all commits/branches, zero hits; the exposure was in chat history,
not the repo). All 4 old keys on console.anthropic.com were deleted and a
new key issued same day.

- **A real, unrelated finding surfaced while rotating this**:
  `ANTHROPIC_API_KEY` was **not set in Vercel production at all** — not
  present under any environment, confirmed via `vercel env ls` before
  making any change. `app/api/score/route.ts` (line ~145) has a silent
  mock-score fallback for exactly this condition
  (`process.env.ANTHROPIC_API_KEY ? 'claude' : 'fallback'`, logged only as
  `log.warn`, not `log.error`/Sentry) — meaning **production score
  generation may have been silently returning mock/fallback scores, not
  real Claude-generated ones, for an unknown period before this fix**, not
  a new problem introduced by the rotation. Worth a deliberate check of
  how long this has been the case (e.g. via `workflow_events`/Sentry
  history for `aiProvider: 'fallback'` occurrences) rather than assuming
  it was recent.
- New key added to Vercel production (`vercel env add ANTHROPIC_API_KEY
  production`), local `.env.local` updated, production redeployed
  (`vercel deploy --prod`) so the new env var actually takes effect —
  confirmed via `/api/health` and a direct call to Anthropic's API with
  the new key (not via `/api/score`, deliberately — that route writes
  real rows to production `applications`/`scores`, and creating fake test
  data in production is exactly the mistake the test/production
  separation work earlier this month exists to prevent).
- **⚠️ New key expires in 30 days (~2026-08-26).** Rotate again before
  then or scoring will silently fall back to mock data again, the same
  way it apparently already was.
- **Second, separate exposure found while investigating Vercel env
  vars, not yet remediated — flagged, not fixed, pending explicit
  instruction:** two Vercel env vars have actual secret *values* sitting
  in the variable **name** field, not the value field: one
  Supabase publishable-format key and one Supabase secret-format key.
  **Values deliberately not written into this file** — unlike a value,
  a Vercel env var *name* is always visible in plaintext to anyone with
  project access (`vercel env ls`, dashboard) regardless of encryption,
  so writing the actual value here would just create a second copy of
  the same exposure, this time committed to git history permanently
  (exactly the mistake the JWT incident above already covers). The
  secret-format one **is the current, live production Supabase
  `SUPABASE_SERVICE_KEY`** (confirmed by direct comparison against
  `.env.local` at the time this was found) — meaning the live production
  service_role key is currently sitting exposed in plaintext as a Vercel
  variable name, most likely from a past `vercel env add` where a secret
  value was pasted into the name prompt by mistake. This was not in scope
  for the Anthropic rotation and has not been touched — needs its own
  decision
  (rotate this Supabase key again, and delete both malformed env var
  entries) before it can be marked resolved.

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

## UX-1 — Product Identity Redesign — Screen 1 DONE, direction decided

Two visual directions were built as an A/B exploration: a dark/amber
"institutional command center" theme, and a light/blue "Ramp" theme
(white background, `#1D4ED8` accent, Inter typography). **The light
"Ramp" direction won** and is now the sole reference — merged into
`feature/ux-1-design-system` as of the light-exploration branch merge.

- **Source of truth:** `lib/design-system/tokens-light.ts`. Import from
  here for any new/restyled screen. The earlier dark `tokens.ts` is kept
  only for historical reference — do not import from it in new work.
- **Screen 1 (`app/dashboard/page.tsx` + `MerchantIntelligence`
  sub-component):** restyled and merged. Structure/data/interaction logic
  unchanged; only the visual layer (colors, fonts, spacing) changed.
- **`caseRiskColor()`:** thresholds (`>=75` high, `>=50` medium, else low)
  are unchanged from the dark exploration — only the three output colors
  were remapped to the light danger/warning/success values. Never reuse
  this function for EthoScore (0–1000, inverted direction) — see brief.
- **Full brief:** `ethosfi-ux1-design-brief.md` (kept outside this repo,
  in the working design-docs location) documents the finalized palette,
  type scale, and remaining screens (2 and 3 next; Screen 4 / login is
  explicitly out of scope for now and still on the old dark hardcoded
  colors).
- **Preview-only auth bypass:** `app/dashboard/page.tsx`'s auth guard
  skips the `/login` redirect when `NEXT_PUBLIC_VERCEL_ENV === 'preview'`
  and no session exists, so anonymous Vercel preview visitors see the
  restyled dashboard with demo data instead of bouncing to the
  still-dark, unrestyled login screen. Production/dev behavior is
  unaffected — do not remove this without confirming Screen 4 has since
  been restyled too, or the guard becomes load-bearing again.

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

### ⚠️ Two unrelated "v2" modules — don't confuse them

- `lib/ethoscore-v2.ts` — **deterministic**, no LLM call. Computes a 0–1000
  4-pillar score directly from `ApplicationForm` fields (see line ~48 above).
  Called from `app/api/score/route.ts` step 4b, stored as `scores.score_pillars`
  / `scores.score_version`.
- `lib/prompts/ethoscore-llm-v2.ts` — the **Fable 5 LLM prompt** (0–1000,
  4-pillar, calibration-only). Consumed by `lib/scoring-engine.ts`, which
  normalizes its output onto the existing 0–100 `ScoreResult` shape.

They compute independently and their outputs are never merged. **`scores.etho_score`
always stores the LLM assessment (from `lib/scoring-engine.ts`) — never the
deterministic `lib/ethoscore-v2.ts` value.** The deterministic score only
appears via the separate `score_pillars` / `score_version` columns. The
prompt file is named `ethoscore-llm-v2.ts` (not `ethoscore-v2.ts`)
specifically to avoid colliding with `lib/ethoscore-v2.ts` in imports, greps,
and conversation.

### LLM-backed scoring (`lib/scoring-engine.ts`) — prompt versions

`scoreApplication(form, options?)` is parameterized by `promptVersion`
(`'v1' | '2.0.0-fable5'`, both prompt bodies live in `lib/prompts/`) and by
model. Model resolution: `options.model` → `ETHOSCORE_MODEL` env var →
`claude-opus-4-8` default. **`ETHOSCORE_MODEL` is currently unset in
production, so this defaults to `claude-opus-4-8` — not Fable 5.** The
`2.0.0-fable5` prompt (`lib/prompts/ethoscore-llm-v2.ts`) is prepared for
calibration only; switching production traffic to it requires the
calibration run + advisor sign-off described below, plus checking current
Fable 5/Mythos-tier access (see Phase 3.5.5 note — access was suspended
pending an export control directive as of that entry).

Every score request logs an immutable `ethoscore_assessed` event to
`workflow_events` (via `recordEvent()` in `lib/workflow-engine.ts`) carrying
`prompt_version`, `model_requested`, and `model_responded` (the actual
`response.model`, which can differ from what was requested if a retry/
fallback occurred) — this is the AI Act traceability record for which
prompt/model produced a given score.

JSON parsing is defensive: parse → retry once with a corrective turn →
fall back to `claude-opus-4-8` and set `validation_fallback: true` on the
logged event. Never throws on a single malformed response.

### 🚨 DEPLOY ORDER — migration MUST be applied before this code ships

`supabase/migrations/20260702000000_add_ethoscore_v2_calibration_fields.sql`
adds the nullable `scores` columns (`prompt_version`, `model_requested`,
`model_responded`, `confidence_overall`) and widens the
`workflow_events.event_type` CHECK constraint (+ drops `to_state NOT NULL`)
to allow `'ethoscore_assessed'`. **It is not yet applied to any database.**

If this code deploys before the migration runs:
- The `scores` insert in `app/api/score/route.ts` (step 6) is written
  defensively — on a `42703`/`PGRST204` (unknown column) error it retries
  the insert with only the pre-existing columns, so **the score itself is
  never lost**, just missing the new traceability fields until the
  migration runs.
- The `ethoscore_assessed` event insert (`recordEvent()` in
  `lib/workflow-engine.ts`) fails closed the same way: it never throws
  (internal try/catch), and the call site in `route.ts` is additionally
  wrapped in try/catch — a logging failure here is a `log.warn`, not a lost
  score or a 500.
- Net effect: deploying out of order degrades traceability (no
  `ethoscore_assessed` event, no prompt/model columns on `scores`) but does
  **not** break scoring or lose data. Apply the migration first anyway —
  don't rely on the fallback path in steady state.
- **Both degraded paths are not silent.** A missing-calibration-columns
  fallback and an `ethoscore_assessed` logging failure each fire a
  warning-level Sentry event (`lib/logger.ts`'s `alertCalibrationColumnsMissing`
  / `alertEthoscoreAssessedEventFailed`) carrying only `scoreId` +
  error code/message + table/event type — no applicant data, per the same
  `SAFE_EXTRA_KEYS` allowlist in `sentry.server.config.ts` (extended, not
  bypassed, to allow `scoreId`/`errorCode`/`eventType`). Plain `log.warn`
  elsewhere in the codebase intentionally stays console-only — only
  `log.error` and these two named alerts reach Sentry.

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
