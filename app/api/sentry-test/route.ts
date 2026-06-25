import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { log } from '../../../lib/logger'

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (token !== 'sentry-verify-2026') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const fakePiiContext = {
    route: 'sentry-test',
    orgId: 'aaaaaaaa-0000-0000-0000-000000000001',
    applicant_name: 'FAKE_PII_John_Smith',
    applicant_email: 'FAKE_PII_john@secret.com',
    applicant_income: 85000,
  }

  Sentry.setContext('organization', {
    id: fakePiiContext.orgId,
    name: 'FAKE_ORG_NAME_SHOULD_BE_SCRUBBED',
    slug: 'fake-slug-should-be-scrubbed',
  })

  log.error('sentry-test: deliberate error with fake PII context', fakePiiContext)

  try {
    throw new Error('Deliberate test exception for Sentry verification')
  } catch (err) {
    Sentry.captureException(err, {
      extra: fakePiiContext,
    })
  }

  // Wait for Sentry to actually send before the serverless function exits
  await Sentry.flush(3000)

  return NextResponse.json({
    status: 'sent',
    triggered_at: new Date().toISOString(),
    check_url: 'https://ilyas-benhana.sentry.io/issues/',
  })
}
