import { NextRequest, NextResponse } from 'next/server'
import { parseCsv, guessMapping } from '../../../../lib/backtest-engine'

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (process.env.BACKTEST_ACCESS_TOKEN && token !== process.env.BACKTEST_ACCESS_TOKEN) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing backtest token' } }, { status: 401 })
  }

  let body: { csv_header: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 })
  }

  if (!body.csv_header) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'csv_header is required' } }, { status: 400 })
  }

  const { headers } = parseCsv(body.csv_header + '\ndummy')
  const suggested = guessMapping(headers)

  return NextResponse.json({
    data: { headers, suggested_mapping: suggested },
  })
}
