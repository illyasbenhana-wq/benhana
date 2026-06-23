import * as Sentry from '@sentry/nextjs'

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

    // Only include org_id UUID in context, never names/slugs
    if (event.contexts?.organization) {
      const org = event.contexts.organization as Record<string, unknown>
      delete org['name']
      delete org['slug']
    }

    return event
  },
})
