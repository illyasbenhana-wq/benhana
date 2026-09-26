import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { log } from './logger'
import { BusinessProfile } from '@/types'

// ─── Counterparty linking (business-loan applications) ──────────────────────
//
// Schema already exists (supabase/migrations/20260722000000_add_ontology_
// counterparty_and_edges.sql) and was designed exactly for this case
// (docs/PHASE4_ONTOLOGY_DESIGN.md §6.3: "applications.counterparty_id ...
// exists for the business-loan case"), but nothing ever wrote to it.
//
// This is deliberately best-effort and non-fatal, mirroring the existing
// fireHooks()/deliverWebhooks() pattern in lib/workflow-engine.ts's
// transition(): it never throws, and a failure here never fails the
// application/score that already succeeded. counterparty_id is internal
// bookkeeping — it is NOT part of the partner-facing POST response (the
// Lendflow integration guide's response schema doesn't include it, and
// there's no request from Lendflow to expose it).

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export interface LinkCounterpartyParams {
  orgId: string
  applicationId: string
  business: BusinessProfile
  actorId: string
}

export interface LinkCounterpartyResult {
  linked: boolean
  counterpartyId?: string
  error?: string
}

/**
 * Best-effort: upserts a `counterparties` row for the business (per-tenant
 * dedup on name, per the migration's unique index), points
 * `applications.counterparty_id` at it, and records a `references` edge
 * (Application -> Counterparty, per docs/PHASE4_ONTOLOGY_DESIGN.md §6.4).
 * Never throws — every failure is caught, logged as a warning, and
 * reported back via `linked: false` so callers can decide whether to
 * surface it (today: nothing does, by design — see module doc above).
 */
export async function linkApplicationCounterparty(
  params: LinkCounterpartyParams
): Promise<LinkCounterpartyResult> {
  const { orgId, applicationId, business, actorId } = params

  try {
    const supabase = getSupabase()
    if (!supabase) {
      log.warn('counterparty link skipped: database not configured', { applicationId })
      return { linked: false, error: 'Database not configured' }
    }

    // Upsert on (organization_id, name) — matches the migration's
    // per-tenant unique index (counterparties_org_name_unique_idx).
    const { data: counterparty, error: upsertErr } = await supabase
      .from('counterparties')
      .upsert(
        {
          organization_id: orgId,
          name: business.legal_name,
          jurisdiction: business.jurisdiction ?? null,
          registration_number: business.registration_number ?? null,
          source: 'application_borrower',
          metadata: {
            trading_since_months: business.trading_since_months ?? null,
            annual_revenue: business.annual_revenue ?? null,
            sector: business.sector ?? null,
          },
        },
        { onConflict: 'organization_id,name', ignoreDuplicates: false }
      )
      .select()
      .single()

    if (upsertErr || !counterparty) {
      log.warn('counterparty upsert failed', { applicationId, orgId, error: upsertErr?.message })
      return { linked: false, error: upsertErr?.message ?? 'Counterparty upsert returned no row' }
    }

    const { error: linkErr } = await supabase
      .from('applications')
      .update({ counterparty_id: counterparty.id })
      .eq('id', applicationId)
      .eq('organization_id', orgId)

    if (linkErr) {
      log.warn('application.counterparty_id link failed', { applicationId, counterpartyId: counterparty.id, error: linkErr.message })
      return { linked: false, counterpartyId: counterparty.id, error: linkErr.message }
    }

    // Best-effort edge too — a missing edge doesn't invalidate the FK link
    // just made above, so its failure is logged but doesn't flip `linked`.
    const { error: edgeErr } = await supabase.from('ontology_edges').insert({
      organization_id: orgId,
      edge_type: 'references',
      from_type: 'application',
      from_id: applicationId,
      to_type: 'counterparty',
      to_id: counterparty.id,
      actor_id: actorId,
      rationale: 'Business-loan applicant identified in the application payload.',
    })
    if (edgeErr) {
      log.warn('ontology_edges insert failed (counterparty link itself still succeeded)', {
        applicationId, counterpartyId: counterparty.id, error: edgeErr.message,
      })
    }

    return { linked: true, counterpartyId: counterparty.id }
  } catch (err) {
    log.warn('counterparty link threw unexpectedly', {
      applicationId, error: err instanceof Error ? err.message : String(err),
    })
    return { linked: false, error: err instanceof Error ? err.message : String(err) }
  }
}
