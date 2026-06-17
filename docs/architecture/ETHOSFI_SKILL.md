# EthosFiAI — Chief Architect Reference

**Classification:** Internal Architecture Guidance  
**Owner:** Chief Architect  
**Last Updated:** June 2026  
**Current Phase:** 1.5 (in progress)

---

## Platform Identity

EthosFiAI is a **Decision Intelligence Platform for cross-border SME finance**.

It is not a credit scoring app. It is not a compliance tool. It is the intersection of both — a unified intelligence layer that enables financial institutions to make faster, fairer, and more defensible decisions across the full SME lending and compliance lifecycle.

**Inspirational peers:**
- **Palantir Foundry** — ontology-driven data platform, case management, workflow orchestration
- **Feedzai** — real-time transaction risk scoring at scale
- **ComplyAdvantage** — AI-native AML/sanctions/PEP screening
- **Quantexa** — network analytics and entity resolution for financial crime

EthosFiAI is smaller in scope today but is architected to grow into this class of software. Every decision made now should be defensible against that ambition.

---

## Architecture Principles

These principles govern every phase of development. They are not aspirational — they are constraints.

1. **Preserve and extend.** Never replace working functionality. Phase N+1 wraps Phase N.
2. **Backward compatibility is non-negotiable.** Existing API contracts, database schemas, and UI surfaces remain stable across phases.
3. **Build incrementally.** No big-bang rewrites. Each phase ships independently.
4. **Separation of concerns.** AI scoring, business rules, audit, and case management are distinct layers with clean interfaces.
5. **EU AI Act by default.** Every AI decision is auditable, explainable, and logged. This is not optional compliance — it is a competitive advantage.
6. **No dependencies without justification.** Every new package must earn its place. Prefer native platform capabilities (Next.js, Supabase, Node built-ins) before adding dependencies.
7. **Enterprise data model.** Multi-tenant from Phase 2 onwards. Every entity belongs to an organisation. Every action belongs to a user.

---

## Platform Layers (Permanent)

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                        │
│   Next.js App Router · React 19 · Inline styles · DM Sans      │
├─────────────────────────────────────────────────────────────────┤
│                         API LAYER                                │
│   Next.js Route Handlers (app/api/**)                           │
│   Stateless · JSON · No session state server-side               │
├──────────────────────────┬──────────────────────────────────────┤
│     DECISION ENGINE       │        COMPLIANCE ENGINE             │
│   scoring-engine.ts       │   case-action/route.ts               │
│   decision-engine.ts      │   audit-engine.ts                    │
│   risk-factors.ts         │   Cases · Signals · Actions          │
├──────────────────────────┴──────────────────────────────────────┤
│                         AI LAYER                                 │
│   Claude (Anthropic SDK) · Prompt versioning · Mock fallback    │
├─────────────────────────────────────────────────────────────────┤
│                       PERSISTENCE LAYER                          │
│   Supabase (PostgreSQL) · Row-Level Security · Service Key      │
│   Supabase Auth · app_metadata for roles                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Foundation (COMPLETE · Do Not Modify)

**Status:** Production. Live at ethosfiai-mvp.vercel.app.

### What was built

#### Application & Scoring Pipeline (`app/api/score/route.ts`)
An 8-step pipeline executed on every loan application:
1. Receive `ApplicationForm` via POST
2. Persist application to `applications` table
3. Call Claude (`claude-sonnet-4-6`) via Anthropic SDK for AI scoring
4. Extract structured risk signals via `lib/risk-factors.ts`
5. Apply deterministic business rules via `lib/decision-engine.ts`
6. Record EU AI Act audit event via `lib/audit-engine.ts`
7. Persist score + factors to `scores` table
8. Return full decision response to client

**Mock fallback:** if `ANTHROPIC_API_KEY` is absent, a deterministic mock score is returned. The pipeline continues identically. This preserves testability without a live AI key.

#### Decision Engine (`lib/decision-engine.ts`)
Pure business logic. No AI. No I/O. Deterministic.

| Score | Outcome | Human Review |
|-------|---------|--------------|
| > 70 | Approved | No |
| 50–70 | Pending review | Yes |
| < 50 | Declined | No |

Returns: `approved`, `confidence` (0–1), `requiresHumanReview`, `reasonCodes[]`

Confidence is derived from distance to nearest threshold — not from the AI model.

#### Risk Factors (`lib/risk-factors.ts`)
Transforms raw AI scoring output (factor names + scores) into named `RiskSignal[]` objects. Uses keyword matching against a curated signal vocabulary. High factor score → low risk score (inverted). Sorted by `weight × score` descending.

#### Audit Engine (`lib/audit-engine.ts`)
EU AI Act Article 22 compliance. Records every AI scoring event with:
- `auditId` (UUID), `applicationId`, `inputSnapshot` (full form data)
- `modelVersion`, `promptVersion`, `aiProvider`
- `rawPrompt`, `rawResponse` (complete AI I/O preserved)
- `createdAt` (ISO 8601)

Degrades gracefully if Supabase is unavailable — logs warning, does not throw.

#### Compliance Dashboard (`app/dashboard/page.tsx`)
- Real-time SLA countdown timers (single `setInterval`, no polling)
- Filter tabs with live counts from Supabase data
- Search by entity name (client-side, no refetch)
- Escalate / Clear / Request Info actions via `app/api/case-action/route.ts`
- Escalation triggers email notification via Resend REST API (fire-and-forget)

#### Lender Dashboard (`app/lender/dashboard/page.tsx`)
- KPIs: total loan volume, approval rate, average EthoScore, pending review count
- Risk distribution bar (low / medium / high)
- Applications table with score, risk band, decision
- Supabase nested select: `applications` → `scores` (unwrapped from array)

#### Authentication (`app/login/page.tsx`, `lib/user-role.ts`)
- Supabase Auth (`signInWithPassword`)
- Session stored in localStorage (Supabase JS v2 default — no cookies)
- Client-side auth guard via `getSession()` on mount — not middleware
- Three roles: `analyst`, `senior_analyst`, `lender`
- Roles stored in `app_metadata` (server-set, secure) with fallback to `user_metadata`
- Role-based redirect after login: analyst/senior_analyst → `/dashboard`, lender → `/lender/dashboard`

### Database Schema (Phase 1)

```sql
applications     -- borrower loan applications
scores           -- AI scoring results + raw AI I/O
decisions        -- lender decisions (override audit trail)
cases            -- compliance investigation cases
signals          -- risk signals per case
case_actions     -- analyst actions (escalate / clear / request_info)
audit_events     -- persistent audit log (AI Act + case actions)
tx_metrics       -- transaction intelligence KPIs
```

### Technology Stack (Phase 1)

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Framework | Next.js 15 (App Router) | API routes + SSR + static pages in one repo |
| Language | TypeScript 5 | Type safety across the full stack |
| AI | Anthropic SDK (`claude-sonnet-4-6`) | Best-in-class reasoning for credit/compliance |
| Database | Supabase (PostgreSQL) | Managed Postgres + Auth + RLS + realtime |
| Auth | Supabase Auth | No additional dependency |
| Email | Resend REST API (native `fetch`) | Zero dependencies, free tier |
| Deployment | Vercel | Zero-config Next.js deployment |
| Styling | Inline styles | No build step, no CSS conflicts, portable |
| UUID | `crypto.randomUUID()` | Node 14.17+ built-in, no package needed |

### Environment Variables (Phase 1)

```
NEXT_PUBLIC_SUPABASE_URL    Supabase project URL
SUPABASE_SERVICE_KEY        Service role key (bypasses RLS — server-side only)
ANTHROPIC_API_KEY           Claude API key (optional — mock fallback if absent)
RESEND_API_KEY              Resend email API key (optional — skipped if absent)
```

---

## Phase 1.5 — Hardening (IN PROGRESS)

Phase 1.5 is not a feature phase. It is a stability and observability phase. Do not add new user-facing features until 1.5 is complete.

### Objectives
- [ ] Email notification system verified end-to-end (Resend + escalation flow)
- [ ] Sender domain verified in Resend (move off `onboarding@resend.dev`)
- [ ] Error boundaries added to dashboard pages (prevent white screens)
- [ ] Supabase RLS policies defined and tested
- [ ] Environment variable validation at startup (fail loudly if misconfigured)
- [ ] TypeScript `strict: true` enabled and all errors resolved
- [ ] `audit_events` table extended to include `application_id` for cross-domain audit queries

### Do Not Build in 1.5
Multi-tenancy, new roles, workflow engine, external APIs. Those are Phase 2.

---

## Phase 2 — Multi-Tenancy & Workflow Engine (NEXT)

**Target audience:** Multiple financial institutions running on the same EthosFiAI deployment. Each organisation has isolated data, its own analysts, and its own configuration.

**Do not begin Phase 2 until Phase 1.5 is signed off.**

### Core Concepts

#### Organisations & Workspaces
Every entity in the system belongs to an `organisation`. A workspace is a named operational context within an organisation (e.g. "UK Lending Desk", "AML Operations – Dubai").

```sql
organisations (
  id uuid primary key,
  name text not null,
  slug text unique not null,        -- used in URLs: /org/barclays-uk/dashboard
  plan text not null,               -- 'starter' | 'professional' | 'enterprise'
  created_at timestamptz,
  settings jsonb default '{}'       -- org-level config: thresholds, notification prefs, etc.
)

workspaces (
  id uuid primary key,
  org_id uuid references organisations(id),
  name text not null,
  type text not null,               -- 'lending' | 'compliance' | 'combined'
  config jsonb default '{}'
)
```

All existing tables gain `org_id uuid references organisations(id)` as a non-nullable column. Row-Level Security policies enforce isolation: `WHERE org_id = auth.jwt()->>'org_id'`.

**Migration strategy:** Create a `default` organisation. Backfill all existing rows with its ID. All existing functionality continues to work. Multi-tenancy is transparent to Phase 1 code paths.

#### Advanced RBAC

Phase 1 has three flat roles. Phase 2 introduces permission-scoped roles within organisations.

```typescript
// Phase 2 role model
type OrgRole =
  | 'org_admin'          // manages org settings, users, billing
  | 'workspace_admin'    // manages workspace config and team
  | 'senior_analyst'     // all case actions, can escalate to external
  | 'analyst'            // standard case actions, cannot clear critical cases
  | 'lender'             // read-only access to scoring results and decisions
  | 'auditor'            // read-only access to audit_events only
  | 'api_client'         // machine-to-machine, no UI

// Stored in app_metadata:
// { org_id: "uuid", workspace_id: "uuid", role: "analyst" }
```

Permissions are checked via a `hasPermission(session, action, resource)` helper — never inline role checks scattered across components. This makes future role changes a single-file edit.

#### Workflow Engine

Phase 1 case actions are one-shot (escalate → done). Phase 2 introduces configurable multi-step workflows with SLA enforcement, assignment rules, and approval chains.

```typescript
interface WorkflowDefinition {
  id: string
  org_id: string
  name: string               // "AML Escalation Workflow"
  trigger: WorkflowTrigger   // { type: 'case_status_change', from: 'open', to: 'escalated' }
  steps: WorkflowStep[]
  sla_hours: number
  notifications: NotificationRule[]
}

interface WorkflowStep {
  order: number
  name: string
  assignee_role: OrgRole     // who gets assigned this step
  required_action: string    // 'review' | 'approve' | 'reject' | 'request_info'
  auto_escalate_after_hours: number
  form_schema?: JsonSchema   // structured data capture at this step
}
```

The workflow engine is a server-side state machine. State transitions are persisted as `workflow_runs` and `workflow_events`. The UI renders the current step and available actions — it does not contain workflow logic.

**Do not store workflow state in React.** The workflow engine lives entirely in `lib/workflow-engine.ts` and the database.

#### Case Management v2

Phase 1 cases are flat records with status fields. Phase 2 cases are rich objects with full lifecycle management.

New capabilities:
- **Case linking:** relate cases to applications, to other cases, to entities
- **Evidence management:** file attachments (Supabase Storage), document versioning
- **Commentary thread:** structured notes per case with @mentions and timestamps
- **Assignment queue:** unassigned cases routable by workload, jurisdiction, or expertise
- **SLA inheritance:** SLA rules defined at workflow level, overridable per case

```sql
-- Phase 2 additions to cases table
ALTER TABLE cases ADD COLUMN workflow_id uuid references workflow_definitions(id);
ALTER TABLE cases ADD COLUMN assigned_workspace_id uuid references workspaces(id);
ALTER TABLE cases ADD COLUMN parent_case_id uuid references cases(id);  -- for linked cases
ALTER TABLE cases ADD COLUMN evidence jsonb default '[]';               -- [{name, url, uploaded_by, at}]
```

#### Partner APIs

Phase 2 exposes a public REST API for lenders, fintech partners, and data providers.

**Design constraints:**
- API versioned from day one: `/api/v1/score`, `/api/v1/cases`
- Machine-to-machine auth via API keys (separate from Supabase user sessions)
- Rate limited per API key
- All API access logged in `audit_events` with `ai_provider = 'api_client'`
- Response envelopes follow a consistent shape: `{ data, meta, errors }`

```typescript
// API key model
interface ApiKey {
  id: string
  org_id: string
  name: string           // "Barclays Production Key"
  key_hash: string       // never store plaintext
  scopes: ApiScope[]     // ['score:read', 'cases:write', 'audit:read']
  rate_limit_rpm: number
  last_used_at: string
  expires_at: string | null
}
```

**Phase 2 public endpoints:**
```
POST /api/v1/applications          Submit a loan application for scoring
GET  /api/v1/applications/:id      Retrieve application + score result
GET  /api/v1/applications/:id/audit  Full EU AI Act audit trail for an application
POST /api/v1/cases                 Create a compliance case
PATCH /api/v1/cases/:id            Update case status
GET  /api/v1/cases/:id/timeline    Full action and event history
```

### Phase 2 File Structure

```
lib/
  workflow-engine.ts         # state machine, step transitions
  permissions.ts             # hasPermission(session, action, resource)
  api-keys.ts                # API key generation, validation, hashing

app/
  api/
    v1/                      # Partner API — versioned from the start
      applications/
        route.ts
        [id]/route.ts
      cases/
        route.ts
        [id]/route.ts
  [org]/                     # Org-scoped UI routes (slug-based)
    dashboard/page.tsx
    cases/page.tsx
    settings/page.tsx

middleware.ts                # Phase 2: real auth middleware once @supabase/ssr is adopted
```

### Phase 2 Migration Rules

1. All new database columns must have defaults — no nullable columns without a fallback.
2. The `default` organisation created in migration must pass all Phase 1 tests unchanged.
3. Phase 1 API routes (`/api/score`, `/api/case-action`) remain unchanged. The new `/api/v1/` routes are additive.
4. The existing dashboard at `/dashboard` remains the entry point for the default workspace. Multi-tenant routing (`/[org]/dashboard`) is added alongside it, not replacing it.

---

## Phase 3 — Intelligence Graph (Future)

**Do not design for this during Phase 2.**

Phase 3 introduces entity resolution and network intelligence — inspired by Quantexa's connected intelligence approach.

### Concepts
- **Entity graph:** resolve individuals, companies, addresses, and accounts across cases and applications into a unified entity model. "Fatima Okoye the loan applicant" and "Fatima Okoye the compliance flag" are the same node.
- **Network analysis:** detect shared directors, addresses, phone numbers, and payment corridors across the customer base.
- **Relationship scoring:** enrich every application and case with network-derived risk signals.
- **Graph visualisation:** interactive network explorer in the compliance dashboard.

### Key technical prerequisite from Phase 2
Entity resolution requires a canonical `entities` table that acts as a reference across `applications`, `cases`, and external watchlists. Phase 2 should begin tracking `entity_id` as a foreign key on both `applications` and `cases` — even if the entity graph itself is not built until Phase 3.

---

## Phase 4 — Real-Time Data Fabric (Future)

**Do not design for this during Phase 3.**

Phase 4 connects EthosFiAI to live data streams — replacing the current application-form-based input model with continuous data ingestion.

### Concepts
- **Transaction stream ingestion:** consume real-time payment flows from core banking via webhooks or Kafka
- **Continuous scoring:** re-score entities as new transactions arrive, not just at application time
- **Alert management:** replace static SLA timers with event-driven alerts from the data fabric
- **Data connectors:** pre-built integrations for Plaid (open banking), Companies House (UK), GLEIF (global entity LEI)

### Key technical prerequisite from Phase 3
Entity graph must be stable before ingesting live transactions. Streaming data is meaningless without resolved entities to attach it to.

---

## Phase 5 — Adaptive AI (Future)

**Do not design for this during Phase 4.**

Phase 5 makes the AI layer adaptive — learning from human decisions to continuously improve model calibration.

### Concepts
- **Decision feedback loop:** when an analyst overrides an AI recommendation, that signal is captured as a labelled training example
- **Threshold calibration:** decision thresholds (currently hardcoded: 70 approve, 50 review) become dynamic, tuned per organisation and loan type
- **Prompt versioning:** structured A/B testing of prompt variants with performance tracking in `audit_events`
- **Model switching:** the AI provider abstraction (`AiProvider` type in `audit-engine.ts`) already supports this — Phase 5 builds the routing and evaluation layer on top of it
- **Explainability v2:** SHAP-style feature importance surfaced directly in the UI alongside AI narrative

### Key technical prerequisite from Phase 4
Feedback loop requires sufficient historical volume. Minimum threshold: 500 labelled decisions per organisation before calibration is statistically meaningful.

---

## Phase 6 — Enterprise Distribution (Future)

**Do not design for this during Phase 5.**

Phase 6 is the commercialisation and enterprise deployment phase.

### Concepts
- **White-label:** organisations can deploy EthosFiAI under their own brand with custom theming, domain, and email templates
- **On-premise deployment:** enterprise customers with data residency requirements receive a self-hosted Docker/Kubernetes distribution
- **Marketplace integrations:** pre-certified integrations with Temenos, Finastra, FIS, and other core banking platforms
- **Compliance certifications:** SOC 2 Type II, ISO 27001, FCA sandbox, MAS FinTech regulatory sandbox

---

## Decision Log

Significant architectural decisions made during Phase 1 and why they must not be casually reversed.

### ADR-001: Client-side auth guard (not middleware)
**Decision:** Auth guard implemented via `supabase.auth.getSession()` in `useEffect`, not Next.js middleware.  
**Reason:** Supabase JS v2 stores sessions in localStorage. Middleware runs on the Edge before the browser loads, so it cannot read localStorage. Middleware is a pass-through placeholder.  
**Phase 2 change:** When `@supabase/ssr` is adopted (it handles cookies correctly), middleware can be re-enabled. Do not attempt this in Phase 1.5 — it requires a coordinated auth migration.

### ADR-002: Roles in `app_metadata`, not a roles table
**Decision:** User roles stored in Supabase `app_metadata` JSON, not in a separate database table.  
**Reason:** `app_metadata` is set server-side (service key only), making it tamper-resistant from the client. Simpler than a join table for three roles.  
**Phase 2 change:** When per-workspace roles are needed, introduce an `org_memberships` table (`user_id, org_id, workspace_id, role`). Keep `app_metadata` for the primary role. The `getRoleFromSession` function in `lib/user-role.ts` is the single place to update.

### ADR-003: Fire-and-forget email
**Decision:** Escalation email is sent without awaiting the result. Errors are logged but do not fail the API response.  
**Reason:** Email delivery is a best-effort side effect. A failed email must never prevent a compliance case action from being recorded. The audit trail in Supabase is the source of truth — not the email.  
**This decision is permanent.** Email is never in the critical path.

### ADR-004: No ORM
**Decision:** Raw Supabase client calls throughout, no ORM (Prisma, Drizzle, etc.).  
**Reason:** Supabase's JS client is already a thin, typed query builder. Adding an ORM adds a migration layer, a schema duplication problem, and build complexity for minimal gain given the current scale.  
**Phase 2 consideration:** If the schema grows to 20+ tables with complex join patterns, revisit Drizzle (lightweight, SQL-first). Do not add Prisma — its migration model conflicts with Supabase's managed migrations.

### ADR-005: Inline styles
**Decision:** All UI styling uses inline style objects. No CSS files, no Tailwind, no CSS modules.  
**Reason:** Established project convention. Consistent across all components. No build-time CSS processing. Portable to any renderer.  
**This decision is permanent for existing components.** New Phase 2 components must follow the same convention unless there is an explicit architectural decision to migrate — and that migration must be complete, not partial.

### ADR-006: `crypto.randomUUID()` not `uuid` package
**Decision:** IDs generated with `crypto.randomUUID()` (Node 14.17+ built-in).  
**Reason:** The `uuid` npm package was not installed and this avoids adding a dependency for a capability already available in the Node runtime and modern browsers.  
**This decision applies everywhere.** Never add the `uuid` package.

---

## What EthosFiAI Is Not

These are explicit non-goals that inform scope decisions.

- **Not a core banking system.** EthosFiAI does not process payments, hold balances, or issue loans. It scores, decides, and monitors.
- **Not a data warehouse.** Historical analytics and BI belong in a separate reporting layer (e.g. Metabase pointed at the Supabase read replica). EthosFiAI is operational, not analytical.
- **Not a document management system.** Evidence attachments in Phase 2 are lightweight references to files stored in Supabase Storage. Full document lifecycle management (versioning, redlining, e-signatures) is out of scope.
- **Not a customer portal.** The applicant-facing `/apply` form is a thin intake surface. EthosFiAI does not have a borrower login, borrower communications, or account management.
- **Not a replacement for human judgement.** EU AI Act Article 22 compliance is a design requirement, not a checkbox. The platform supports human decision-making — it does not replace it. Every AI recommendation is a recommendation, not a decision.
