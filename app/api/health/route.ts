import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const ts = new Date().toISOString()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY

  if (!url || !key) {
    return NextResponse.json({ status: 'degraded', db: 'not_configured', ts })
  }

  try {
    const supabase = createClient(url, key)
    const { error } = await supabase.from('organizations').select('id').limit(1)

    if (error) {
      return NextResponse.json({ status: 'degraded', db: 'error', ts })
    }

    return NextResponse.json({ status: 'ok', db: 'connected', ts })
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'unreachable', ts })
  }
}
