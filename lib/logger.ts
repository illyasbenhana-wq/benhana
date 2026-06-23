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

export const log = {
  debug: (msg: string, ctx?: LogContext) => emit('debug', msg, ctx),
  info:  (msg: string, ctx?: LogContext) => emit('info', msg, ctx),
  warn:  (msg: string, ctx?: LogContext) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit('error', msg, ctx),
}
