import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { log } from '../../../lib/logger'

export async function POST(req: NextRequest) {
  // Token gate — same pattern as backtest
  const token = req.nextUrl.searchParams.get('token')
  if (token !== 'sentry-verify-2026') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Simulate a request context with fake PII that should be scrubbed
  const fakePiiContext = {
    route: 'sentry-test',
    orgId: 'aaaaaaaa-0000-0000-0000-000000000001',
    applicant_name: 'FAKE_PII_John_Smith',
    applicant_email: 'FAKE_PII_john@secret.com',
    applicant_income: 85000,
  }

  // Set Sentry scope with org_id (UUID only — should survive scrubbing)
  Sentry.setContext('organization', {
    id: fakePiiContext.orgId,
    name: 'FAKE_ORG_NAME_SHOULD_BE_SCRUBBED',
    slug: 'fake-slug-should-be-scrubbed',
  })

  // 1. Test log.error → Sentry.captureMessage
  log.error('sentry-test: deliberate error with fake PII context', fakePiiContext)

  // 2. Test Sentry.captureException directly
  try {
    throw new Error('Deliberate test exception for Sentry verification')
  } catch (err) {
    Sentry.captureException(err, {
      extra: fakePiiContext,
    })
  }

  return NextResponse.json({
    status: 'sent',
    message: 'Two Sentry events fired: one captureMessage via log.error, one captureException. Check your Sentry dashboard.',
    check_url: 'https://ilyas-benhana.sentry.io/issues/',
  })
}
