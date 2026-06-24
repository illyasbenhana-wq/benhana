import * as Sentry from '@sentry/nextjs'

// Allowlist: only these keys survive in event.extra / event.contexts
// Everything else is stripped. This is safer than blocklisting PII fields.
const SAFE_EXTRA_KEYS = new Set([
  'route',
  'orgId',
  'error',
  'caseId',
  'entityType',
  'entityId',
  'eventId',
  'toState',
  'fromState',
  'table',
  'runId',
  'endpointId',
  'url',
  'type',
  'keys',
  'status',
  'model_id',
  'actions_count',
  'confidence',
  'summary_length',
  'raw_response_length',
  'scored_count',
  'skipped_count',
  'error_count',
])

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const key of Object.keys(obj)) {
    if (SAFE_EXTRA_KEYS.has(key)) {
      cleaned[key] = obj[key]
    } else {
      cleaned[key] = '[scrubbed]'
    }
  }
  return cleaned
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
  enabled: !!process.env.SENTRY_DSN,

  beforeSend(event) {
    // Scrub request bodies (contain applicant PII)
    if (event.request) {
      delete event.request.data
      delete event.request.cookies
    }

    // Scrub sensitive headers
    if (event.request?.headers) {
      delete event.request.headers['authorization']
      delete event.request.headers['cookie']
    }

    // Scrub extra data — allowlist only safe keys
    if (event.extra) {
      event.extra = scrubObject(event.extra as Record<string, unknown>)
    }

    // Scrub contexts — only keep org UUID
    if (event.contexts) {
      for (const [ctxName, ctxValue] of Object.entries(event.contexts)) {
        if (ctxName === 'organization' && ctxValue && typeof ctxValue === 'object') {
          const org = ctxValue as Record<string, unknown>
          event.contexts[ctxName] = { id: org['id'], type: 'organization' } as any
        }
      }
    }

    return event
  },
})
