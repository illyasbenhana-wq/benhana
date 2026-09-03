export type OrgRole = 'owner' | 'admin' | 'analyst' | 'viewer' | 'partner'

export type Resource = 'applications' | 'cases' | 'scores' | 'decisions' | 'audit_events' | 'outcomes' | 'historical_data' | 'decision_replay' | 'provenance' | 'counterfactual_analysis' | 'model_performance'

export type Action = 'read' | 'write' | 'delete' | 'approve'

// outcomes carries no 'delete' or 'approve' capability for any role — the
// Outcome Tracking API (see app/api/outcomes/route.ts) exposes create/read
// only, by design (outcomes are append-only; corrections are a new 'write').
// historical_data likewise carries no 'delete'/'approve' — the Historical
// Ingestion API (see app/api/historical-import/route.ts) exposes only
// create/read; historical_decision_records/historical_import_batches are
// append-only, so no role is ever granted a capability the API doesn't
// expose. Not granted to 'partner' — an external partner-API-key holder
// submitting arbitrary historical bulk data is a materially different,
// wider-blast-radius action than the read-only partner scopes this
// codebase already grants elsewhere; out of scope to decide without an
// explicit product call, so left unauthorized for now.
// decision_replay carries ONLY 'read' for any role, ever — Decision Replay
// (see app/api/decision-replay/[id]/route.ts) is a read-only
// reconstruction of existing evidence; there is no write/delete/approve
// action for it to expose, so none is defined here.
// provenance likewise carries ONLY 'read' — provenance_records are
// written exclusively as a server-side side effect of recordAuditEvent()
// (see lib/audit-engine.ts), never via a client-facing write endpoint; no
// role is ever granted 'write'/'delete'/'approve' on it.
// counterfactual_analysis also carries ONLY 'read' — running a simulation
// (see app/api/counterfactual/[decisionRecordId]/route.ts) is a POST
// request (it carries a body), but it persists nothing, so it is modeled
// as a 'read' capability on the underlying evidence, the same way
// decision_replay is: no write/delete/approve action exists for it.
// model_performance also carries ONLY 'read' for any role except
// 'partner' — the Observatory (see app/api/model-performance/route.ts)
// exposes portfolio-level intelligence, not per-applicant data, but is
// still not exposed to a partner-API-key holder, matching the same
// conservative default as decision_replay/provenance/counterfactual_analysis.
const MATRIX: Record<OrgRole, Record<Resource, Set<Action>>> = {
  owner: {
    applications: new Set(['read', 'write', 'delete', 'approve']),
    cases:        new Set(['read', 'write', 'delete', 'approve']),
    scores:       new Set(['read', 'write', 'delete', 'approve']),
    decisions:    new Set(['read', 'write', 'delete', 'approve']),
    audit_events: new Set(['read']),
    outcomes:     new Set(['read', 'write']),
    historical_data: new Set(['read', 'write']),
    decision_replay: new Set(['read']),
    provenance:      new Set(['read']),
    counterfactual_analysis: new Set(['read']),
    model_performance:       new Set(['read']),
  },
  admin: {
    applications: new Set(['read', 'write', 'approve']),
    cases:        new Set(['read', 'write', 'approve']),
    scores:       new Set(['read', 'write', 'approve']),
    decisions:    new Set(['read', 'write', 'approve']),
    audit_events: new Set(['read']),
    outcomes:     new Set(['read', 'write']),
    historical_data: new Set(['read', 'write']),
    decision_replay: new Set(['read']),
    provenance:      new Set(['read']),
    counterfactual_analysis: new Set(['read']),
    model_performance:       new Set(['read']),
  },
  analyst: {
    applications: new Set(['read', 'write']),
    cases:        new Set(['read', 'write']),
    scores:       new Set(['read']),
    decisions:    new Set(['read']),
    audit_events: new Set(['read']),
    outcomes:     new Set(['read', 'write']),
    historical_data: new Set(['read', 'write']),
    decision_replay: new Set(['read']),
    provenance:      new Set(['read']),
    counterfactual_analysis: new Set(['read']),
    model_performance:       new Set(['read']),
  },
  viewer: {
    applications: new Set(['read']),
    cases:        new Set(['read']),
    scores:       new Set(['read']),
    decisions:    new Set(['read']),
    audit_events: new Set(['read']),
    outcomes:     new Set(['read']),
    historical_data: new Set(['read']),
    decision_replay: new Set(['read']),
    provenance:      new Set(['read']),
    counterfactual_analysis: new Set(['read']),
    model_performance:       new Set(['read']),
  },
  partner: {
    applications: new Set(['read']),
    cases:        new Set([]),
    scores:       new Set(['read']),
    decisions:    new Set([]),
    audit_events: new Set([]),
    outcomes:     new Set(['read']),
    historical_data: new Set([]),
    decision_replay: new Set([]),
    provenance:      new Set([]),
    counterfactual_analysis: new Set([]),
    model_performance:       new Set([]),
  },
}

export function hasPermission(role: OrgRole, action: Action, resource: Resource): boolean {
  const resourcePerms = MATRIX[role]?.[resource]
  if (!resourcePerms) return false
  return resourcePerms.has(action)
}

export class PermissionDeniedError extends Error {
  constructor(role: OrgRole, action: Action, resource: Resource) {
    super(`Role "${role}" cannot "${action}" on "${resource}"`)
    this.name = 'PermissionDeniedError'
  }
}

export function assertPermission(role: OrgRole, action: Action, resource: Resource): void {
  if (!hasPermission(role, action, resource)) {
    throw new PermissionDeniedError(role, action, resource)
  }
}
