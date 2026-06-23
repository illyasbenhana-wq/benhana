import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDefaultOrgId } from '../../../../lib/org-context'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Token gate
  const token = req.nextUrl.searchParams.get('token')
  if (process.env.BACKTEST_ACCESS_TOKEN && token !== process.env.BACKTEST_ACCESS_TOKEN) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing backtest token' } }, { status: 401 })
  }

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }, { status: 503 })
  }

  const { id } = await params
  const orgId = getDefaultOrgId()

  const { data: run, error: runErr } = await supabase
    .from('backtest_runs')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .single()

  if (runErr || !run) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Backtest run not found' } }, { status: 404 })
  }

  // Fetch per-row results
  const { data: results } = await supabase
    .from('backtest_results')
    .select('row_index, status, error_reason, predicted_score, predicted_band, actual_outcome')
    .eq('run_id', id)
    .eq('organization_id', orgId)
    .order('row_index', { ascending: true })

  return NextResponse.json({
    data: {
      run,
      results: results ?? [],
    },
  })
}
