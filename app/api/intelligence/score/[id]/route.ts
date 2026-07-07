import { NextRequest, NextResponse } from 'next/server'
import { fetchScoreForIntelligence } from '../../../../../lib/intelligence/fetchScore'

// Internal-only route backing /intelligence/score/[id]. See the security
// note in lib/intelligence/fetchScore.ts — no auth gating yet.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const result = await fetchScoreForIntelligence(id)
  if (!result) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }
  if (!result.score) {
    return NextResponse.json({ error: 'Score not found' }, { status: 404 })
  }

  return NextResponse.json({ application: result.application, score: result.score })
}
