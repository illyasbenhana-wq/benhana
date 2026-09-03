import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '../../../lib/api-guard'
import { getOrgById } from '../../../lib/org-context'
import { ingestHistoricalCsv, HistoricalFieldMapping } from '../../../lib/historical-ingestion'

// Phase 2, Step 4 — minimal, internal, server-side historical-ingestion
// endpoint. No dashboard, no UI, no public/partner surface (uses the
// session-based RBAC pattern from Step 2's outcomes route, not the
// partner-API-key family). Writes only via lib/historical-ingestion.ts,
// which itself writes only historical_import_batches/
// historical_decision_records.

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'write', 'historical_data')
  if ('error' in auth) return auth.error
  const { context } = auth

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 })
  }

  const { csv, mapping, source_lender_org_id } = body as {
    csv?: unknown
    mapping?: unknown
    source_lender_org_id?: unknown
  }

  if (typeof csv !== 'string' || csv.trim() === '') {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'csv field is required (string)' } }, { status: 400 })
  }
  if (typeof mapping !== 'object' || mapping === null || Array.isArray(mapping)) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'mapping field is required (object)' } }, { status: 400 })
  }
  const m = mapping as Record<string, unknown>
  if (typeof m.decision_date !== 'string' || m.decision_date.trim() === '') {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'mapping.decision_date is required (string column name)' } }, { status: 400 })
  }
  const fieldMapping: HistoricalFieldMapping = {
    decision_date: m.decision_date,
    status: typeof m.status === 'string' ? m.status : null,
    loan_amount: typeof m.loan_amount === 'string' ? m.loan_amount : null,
    external_id: typeof m.external_id === 'string' ? m.external_id : null,
  }

  // organization_id is NEVER taken from the request body — only from the
  // authenticated session context, matching Step 2's outcomes route.
  //
  // source_lender_org_id: defaults to the caller's own org (self-import)
  // when omitted. ARCHITECTURAL CORRECTION: previously, any value
  // referencing a real, non-deleted organizations row was accepted — this
  // let any authenticated org cite any other real org as the source
  // lender, since no lending-relationship/grant table exists in this
  // codebase to authorize that claim. Until such a mechanism is
  // deliberately built, this endpoint is self-import only: a supplied
  // source_lender_org_id must equal the caller's own context.orgId, or
  // the request is rejected. The field itself is unchanged in the
  // request/response contract and in historical_import_batches/
  // historical_decision_records — only the authorization check is new —
  // so no migration and no schema change is required, and cross-org
  // import can be re-enabled later without a schema change once a real
  // grant mechanism exists.
  let sourceLenderOrgId = context.orgId
  if (source_lender_org_id !== undefined && source_lender_org_id !== null) {
    if (typeof source_lender_org_id !== 'string') {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'source_lender_org_id must be a string' } }, { status: 400 })
    }
    // Existence check first (preserves the original 400 behavior for a
    // nonexistent id), authorization check second (403, distinct from
    // "doesn't exist") — order matters for callers debugging which case
    // they hit, and neither check performs any write.
    const sourceOrg = await getOrgById(source_lender_org_id)
    if (!sourceOrg) {
      return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'source_lender_org_id does not reference a known organization' } }, { status: 400 })
    }
    if (source_lender_org_id !== context.orgId) {
      return NextResponse.json({
        error: { code: 'FORBIDDEN', message: 'source_lender_org_id must match the authenticated organization — cross-organization historical import is not currently authorized' },
      }, { status: 403 })
    }
    sourceLenderOrgId = sourceOrg.id
  }

  const result = await ingestHistoricalCsv({
    organizationId: context.orgId,
    sourceLenderOrgId,
    importedBy: context.userId,
    csv,
    mapping: fieldMapping,
  })

  if (!result.success) {
    return NextResponse.json({ error: { code: 'INGESTION_FAILED', message: result.error ?? 'Historical ingestion failed' } }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      batch_id: result.batchId,
      row_count: result.rowCount,
      accepted_count: result.acceptedCount,
      rejected_count: result.rejectedCount,
      duplicate_count: result.duplicateCount,
    },
  }, { status: 201 })
}
