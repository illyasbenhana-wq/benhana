import { NextRequest, NextResponse } from 'next/server'
import { getCaseGraph } from '../../../../../lib/ontology-graph'

/**
 * Read-only ontology graph lookup for the Case / Investigation View
 * (app/case/[ref]/page.tsx). Unauthenticated, same posture as
 * /api/demo-data — this page is itself unauthenticated on preview
 * deployments (see lib/preview-bypass.ts) and this route exposes no
 * more than what the page already renders.
 *
 * Returns { connections: [], person: null } (not an error) when the
 * case_ref has no matching DB row — most dossiers in
 * lib/investigation-demo.ts are still frontend-only mock data (§6.6/§7.7
 * backfilled only the 5 AML demo cases), so "no graph data" is an
 * expected, common response, not a failure.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  const { ref } = await params
  const graph = await getCaseGraph(decodeURIComponent(ref).toUpperCase())

  return NextResponse.json(graph ?? { connections: [], person: null })
}
