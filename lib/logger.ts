import * as Sentry from '@sentry/nextjs'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  [key: string]: unknown
}

function emit(level: LogLevel, msg: string, ctx?: LogContext) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  }
  const json = JSON.stringify(entry)
  if (level === 'error') {
    console.error(json)
    if (process.env.SENTRY_DSN) {
      Sentry.captureMessage(msg, {
        level: 'error',
        extra: ctx,
      })
    }
  } else if (level === 'warn') {
    console.warn(json)
  } else {
    console.log(json)
  }
}

// Plain warn() is console-only by design — the codebase has many benign,
// expected warnings (e.g. mock-mode fallbacks) that shouldn't page anyone.
// Use warnToSentry() only for warnings that represent a real degraded state
// someone should know about (e.g. silently losing AI Act traceability data).
// `ctx` still goes through the same beforeSend allowlist as error-level
// events (see sentry.server.config.ts SAFE_EXTRA_KEYS) — never pass
// application/applicant data here, only IDs and error codes.
function warnToSentry(msg: string, ctx?: LogContext) {
  emit('warn', msg, ctx)
  if (process.env.SENTRY_DSN) {
    Sentry.captureMessage(msg, {
      level: 'warning',
      extra: ctx,
    })
  }
}

export const log = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info:  (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
  warn:  (msg: string, ctx?: LogContext) => emit('warn', msg, ctx),
  warnToSentry,
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
}

// ─── Named calibration-degradation alerts ───────────────────────────────────
// Small, purpose-built wrappers (rather than callers hand-assembling `ctx`)
// so the exact fields sent to Sentry are fixed, reviewable, and unit-testable
// in one place. No application/applicant data — only IDs and error codes.

export function alertCalibrationColumnsMissing(ctx: { scoreId: string; errorCode?: string }) {
  warnToSentry('EthoScore calibration columns missing — migration not applied?', {
    table: 'scores',
    scoreId: ctx.scoreId,
    errorCode: ctx.errorCode,
  })
}

export function alertEthoscoreAssessedEventFailed(ctx: { scoreId: string; error?: string }) {
  warnToSentry('ethoscore_assessed event not recorded — migration not applied?', {
    table: 'workflow_events',
    eventType: 'ethoscore_assessed',
    scoreId: ctx.scoreId,
    error: ctx.error,
  })
}
