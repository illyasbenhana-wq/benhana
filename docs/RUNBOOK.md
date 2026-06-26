# EthosFi — Operational Runbook

Quick-reference for diagnosing and resolving common operational issues.

---

## Webhook delivery failing repeatedly

**Symptom:** Partner reports missing webhooks, or Sentry shows `webhook delivery failed after all attempts` errors.

**Where to look:**
1. **Sentry** — search for `webhook` errors. Each event includes `endpointId`, `url`, `orgId`, and the HTTP error.
2. **Vercel logs** — structured JSON entries with `"msg":"webhook attempt failed, retrying"` show each attempt with delay and attempt number.

**What's happening:**
- Webhook delivery retries 3 times with exponential backoff (1s → 2s → 4s).
- Each request includes `X-EthosFi-Event-Id` (for partner deduplication) and `X-EthosFi-Delivery-Attempt` (1/2/3).
- After 3 failures, the event is logged and dropped — no persistent retry queue (Phase 3 limitation).

**Likely fixes:**
- Partner endpoint is down → wait and re-trigger the workflow transition manually (the event will re-fire).
- Partner endpoint returns 4xx → check the webhook URL and secret in `webhook_endpoints` table.
- Network timeout → endpoint takes >10s to respond. Ask partner to optimize, or increase `AbortSignal.timeout` in `lib/workflow-engine.ts`.

**Idempotency note:** EthosFi does NOT guarantee exactly-once delivery. Partners must dedupe by `X-EthosFi-Event-Id`.

---

## Workflow stuck in unexpected state

**Symptom:** A case or application shows the wrong status, or a transition was rejected as invalid.

**Where to look:**
1. **Query workflow events** via the API:
   ```
   GET /api/v1/events?entity_type=case&entity_id=<UUID>&limit=50
   Authorization: Bearer etho_ak_...
   ```
   This returns the full transition history for that entity — every `from_state → to_state` with timestamps and actor.

2. **Check valid transitions** in `lib/workflow-engine.ts`:
   - Applications: `pending → scored → approved/declined/more_info`
   - Cases: `open ↔ escalated ↔ pending_info → cleared` (cleared is terminal)

3. **Supabase dashboard** — query `workflow_events` directly:
   ```sql
   SELECT * FROM workflow_events
   WHERE entity_id = '<UUID>'
   ORDER BY created_at;
   ```

**Likely fixes:**
- Entity is in a terminal state (`cleared`, `approved`, `declined`) → no further transitions allowed by design.
- `from_state` mismatch → the client sent a stale `previousStatus`. The workflow engine validates against the transition map, not the current DB state — fix the client to read current status before transitioning.

---

## Score computation error

**Symptom:** `/api/score` returns 500, or a score is missing `structured_score` / `score_pillars`.

**How scoring works:**
The pipeline has two independent scoring paths with try/catch isolation:
1. **AI Assessment (v1)** — Claude API call → `etho_score` (0-100) + narrative. If Claude fails, mock scores are used.
2. **Structured Score (v2)** — deterministic `computeEthoScoreV2()`. If this fails, `score_version='v1'` and `score_pillars=null`.

**Where to look:**
- Sentry: `scoring pipeline failed` (entire pipeline crashed) or `EthoScore v2 computation failed (non-fatal)` (v2 only).
- Vercel logs: structured JSON with `"route":"score"`.

**Key behavior:**
- v2 failure is non-fatal — the v1 AI score is still saved and returned.
- `risk_band` is always deterministic via `computeRiskBand()` — never AI-dependent.
- `ANTHROPIC_API_KEY` not set → mock score used (logged as warning, not error).

**Likely fixes:**
- 500 error → check Sentry for the full stack trace. Most likely a Supabase write failure (e.g. missing `organization_id`).
- Missing `score_pillars` → v2 computation threw. Check if the application form has unexpected null/NaN values.

---

## Manual backup before a risky migration

**Prerequisites:** Node.js, `.env.test` file (for test project) or equivalent for production.

**Verified method (JSON/REST API):**
```bash
node scripts/backup-restore-test.mjs
```
This script:
1. Exports all rows from key tables as JSON
2. Saves to `backups/test_backup.json`
3. Can simulate data loss and restore to verify the cycle works

**For production:** Modify the script to use production credentials (or upgrade to Supabase Pro tier for automatic daily backups).

**Note:** `scripts/backup-db.sh` (pg_dump-based) exists but is UNTESTED — requires `pg_dump`/`psql` which are not currently installed. Use the JSON method above until Postgres client tools are available.

**Supabase free tier has zero automatic backups.** Upgrading production to Pro ($25/mo) adds daily backups with 7-day retention.

---

## Sentry error monitoring

**What's captured:** Error message, stack trace, route, org_id (UUID only).

**What's scrubbed (allowlist approach):** Request bodies, auth headers, cookies, and all extra fields not in the safe list. Only operational keys (`route`, `orgId`, `caseId`, `error`, etc.) pass through — applicant names, emails, income, and all other PII are replaced with `[scrubbed]`.

**How to verify it's working:** Any `log.error()` call in the codebase automatically reports to Sentry when `SENTRY_DSN` is set.

**Key env vars:**
- `SENTRY_DSN` — server-side (set on Vercel)
- `NEXT_PUBLIC_SENTRY_DSN` — client-side (set on Vercel)

---

## Notification email not delivered

**Symptom:** Case escalated but no email received.

**Where to look:**
1. Sentry: `email send failed after all attempts`
2. Vercel logs: `"msg":"RESEND_API_KEY not set, skipping email"` (key missing) or `"msg":"email send failed, retrying"` (transient error)

**Retry behavior:** 3 attempts with exponential backoff (1s → 2s → 4s). Final failure logged to Sentry.

**Likely fixes:**
- `RESEND_API_KEY` not set → add it in Vercel env vars.
- Sender domain not verified → currently using `onboarding@resend.dev` (Resend shared sender). For production, verify `ethosfiai.com` in Resend dashboard.
- Recipient email invalid → check the email in `organization_members` / `auth.users`.
