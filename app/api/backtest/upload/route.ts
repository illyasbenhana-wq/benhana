import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseCsv, guessMapping, runBacktest, FieldMapping } from '../../../../lib/backtest-engine'
import { getDefaultOrgId } from '../../../../lib/org-context'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  // Token gate
  const token = req.nextUrl.searchParams.get('token')
  if (process.env.BACKTEST_ACCESS_TOKEN && token !== process.env.BACKTEST_ACCESS_TOKEN) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing backtest token' } }, { status: 401 })
  }

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database not configured' } }, { status: 503 })
  }

  let body: { csv?: string; name?: string; mapping?: FieldMapping }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 })
  }

  if (!body.csv || typeof body.csv !== 'string') {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'csv field is required (string)' } }, { status: 400 })
  }

  const { headers, rows } = parseCsv(body.csv)
  if (rows.length === 0) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'CSV has no data rows' } }, { status: 400 })
  }

  const mapping = body.mapping ?? guessMapping(headers)
  const orgId = getDefaultOrgId()
  const runName = body.name ?? `Backtest ${new Date().toISOString().slice(0, 16)}`

  // Create the run record
  const { data: run, error: runErr } = await supabase
    .from('backtest_runs')
    .insert({
      organization_id: orgId,
      name: runName,
      source: 'csv_upload',
      field_mapping: mapping,
      total_rows: rows.length,
      status: 'pending',
    })
    .select()
    .single()

  if (runErr || !run) {
    return NextResponse.json({ error: { code: 'INSERT_FAILED', message: runErr?.message ?? 'Failed to create backtest run' } }, { status: 500 })
  }

  // Run scoring in the background (fire-and-forget for large batches)
  // For small batches, we wait for completion
  if (rows.length <= 200) {
    try {
      const summary = await runBacktest(run.id, orgId, rows, mapping)
      return NextResponse.json({
        data: { run_id: run.id, status: 'completed', total_rows: rows.length, summary },
      }, { status: 201 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Backtest failed'
      await supabase.from('backtest_runs').update({ status: 'failed' }).eq('id', run.id)
      return NextResponse.json({ error: { code: 'BACKTEST_FAILED', message: msg } }, { status: 500 })
    }
  }

  // Large batch: return immediately, run async
  runBacktest(run.id, orgId, rows, mapping).catch(async (err) => {
    const { log } = require('../../../../lib/logger'); log.error('async backtest run failed', { runId: run.id, error: err instanceof Error ? err.message : String(err) })
    await supabase?.from('backtest_runs').update({ status: 'failed' }).eq('id', run.id)
  })

  return NextResponse.json({
    data: { run_id: run.id, status: 'processing', total_rows: rows.length },
    meta: { message: 'Large batch — scoring in progress. Poll GET /api/backtest/{run_id} for status.' },
  }, { status: 202 })
}
