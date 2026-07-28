import { createClient } from '@supabase/supabase-js'

/**
 * Read-only traversal of the Phase 4 ontology graph (counterparties,
 * ontology_edges, persons) for a single case, keyed by case_ref.
 *
 * Design reference: docs/PHASE4_ONTOLOGY_DESIGN.md §6-§7. This surfaces
 * real data (created via the §6.6/§7.7 backfills) into the existing
 * Case / Investigation View — it does not itself write anything.
 */

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export type GraphConnection = {
  relation: string
  name: string
  linkedCaseRef?: string
}

export type GraphPerson = {
  id: string
  full_name: string
  email: string | null
}

export type CaseGraph = {
  connections: GraphConnection[]
  person: GraphPerson | null
}

/**
 * Returns null if this case_ref has no matching row in the `cases` table
 * (e.g. demo-only dossiers like Fatima Okoye/INV-1052 that were
 * deliberately not backfilled — see §6.6). Callers should fall back to
 * static dossier data in that case, not treat null as an error.
 */
export async function getCaseGraph(caseRef: string): Promise<CaseGraph | null> {
  const supabase = getSupabase()
  if (!supabase) return null

  const { data: caseRow } = await supabase
    .from('cases')
    .select('id, counterparty_id, application_id')
    .eq('case_ref', caseRef)
    .is('deleted_at', null)
    .maybeSingle()

  if (!caseRow) return null

  const nodeRefs: Array<{ type: string; id: string }> = [{ type: 'case', id: caseRow.id }]
  if (caseRow.counterparty_id) nodeRefs.push({ type: 'counterparty', id: caseRow.counterparty_id })

  const edgeRows: Array<{
    edge_type: string
    from_type: string
    from_id: string
    to_type: string
    to_id: string
  }> = []

  for (const ref of nodeRefs) {
    const { data: asFrom } = await supabase
      .from('ontology_edges')
      .select('edge_type, from_type, from_id, to_type, to_id')
      .eq('from_type', ref.type)
      .eq('from_id', ref.id)
      .is('deleted_at', null)
    if (asFrom) edgeRows.push(...asFrom)

    const { data: asTo } = await supabase
      .from('ontology_edges')
      .select('edge_type, from_type, from_id, to_type, to_id')
      .eq('to_type', ref.type)
      .eq('to_id', ref.id)
      .is('deleted_at', null)
    if (asTo) edgeRows.push(...asTo)
  }

  // Resolve counterparty names for every counterparty referenced by an edge.
  const counterpartyIds = new Set<string>()
  for (const e of edgeRows) {
    if (e.from_type === 'counterparty') counterpartyIds.add(e.from_id)
    if (e.to_type === 'counterparty') counterpartyIds.add(e.to_id)
  }

  let namesById: Record<string, string> = {}
  let caseRefByCounterpartyId: Record<string, string> = {}
  if (counterpartyIds.size > 0) {
    const ids = [...counterpartyIds]
    const { data: cps } = await supabase.from('counterparties').select('id, name').in('id', ids)
    namesById = Object.fromEntries((cps ?? []).map(c => [c.id, c.name]))

    // Does the other counterparty have its own open case, to link to?
    const { data: cases } = await supabase
      .from('cases')
      .select('case_ref, counterparty_id')
      .in('counterparty_id', ids)
      .is('deleted_at', null)
    caseRefByCounterpartyId = Object.fromEntries(
      (cases ?? []).map(c => [c.counterparty_id as string, c.case_ref])
    )
  }

  const connections: GraphConnection[] = []
  for (const e of edgeRows) {
    // Skip the case's own "investigates" edge onto its own counterparty —
    // that's already shown as the case's Entity Profile, not a connection.
    if (e.edge_type === 'investigates') continue

    let relation: string
    let otherId: string
    let otherType: string

    if (e.edge_type === 'owns') {
      const ourSideIsOwned = e.to_type === 'counterparty' && e.to_id === caseRow.counterparty_id
      relation = ourSideIsOwned ? 'Parent' : 'Subsidiary'
      otherId = ourSideIsOwned ? e.from_id : e.to_id
      otherType = ourSideIsOwned ? e.from_type : e.to_type
    } else if (e.edge_type === 'counterparty_of') {
      relation = 'Counterparty'
      const ourSideIsFrom = e.from_type === 'counterparty' && e.from_id === caseRow.counterparty_id
      otherId = ourSideIsFrom ? e.to_id : e.from_id
      otherType = ourSideIsFrom ? e.to_type : e.from_type
    } else {
      // Other edge types (related_to, references, relates_to, assessed,
      // acts_on) aren't rendered as "Connected Entities" in this view.
      continue
    }

    if (otherType !== 'counterparty') continue // 'person' edges not modeled yet, see §7.4

    connections.push({
      relation,
      name: namesById[otherId] ?? otherId,
      linkedCaseRef: caseRefByCounterpartyId[otherId],
    })
  }

  let person: GraphPerson | null = null
  if (caseRow.application_id) {
    const { data: app } = await supabase
      .from('applications')
      .select('applicant_person_id')
      .eq('id', caseRow.application_id)
      .maybeSingle()
    if (app?.applicant_person_id) {
      const { data: p } = await supabase
        .from('persons')
        .select('id, full_name, email')
        .eq('id', app.applicant_person_id)
        .maybeSingle()
      if (p) person = p
    }
  }

  return { connections, person }
}
