import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockCaptureMessage } = vi.hoisted(() => ({ mockCaptureMessage: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({
  captureMessage: mockCaptureMessage,
}))

import { log, alertCalibrationColumnsMissing, alertEthoscoreAssessedEventFailed, alertDecisionRecordPersistFailed } from '../lib/logger'

describe('log.warnToSentry / degraded-path alerts', () => {
  const originalDsn = process.env.SENTRY_DSN

  beforeEach(() => {
    mockCaptureMessage.mockReset()
    process.env.SENTRY_DSN = 'https://fake-dsn.example/1'
  })

  afterEach(() => {
    if (originalDsn === undefined) delete process.env.SENTRY_DSN
    else process.env.SENTRY_DSN = originalDsn
  })

  it('does not call Sentry for plain log.warn (unchanged behavior)', () => {
    log.warn('benign warning', { route: 'score' })
    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  it('log.warnToSentry calls Sentry.captureMessage at warning level', () => {
    log.warnToSentry('something degraded', { route: 'score' })

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    expect(mockCaptureMessage).toHaveBeenCalledWith('something degraded', {
      level: 'warning',
      extra: { route: 'score' },
    })
  })

  it('log.warnToSentry does not call Sentry when SENTRY_DSN is unset', () => {
    delete process.env.SENTRY_DSN
    log.warnToSentry('something degraded', { route: 'score' })
    expect(mockCaptureMessage).not.toHaveBeenCalled()
  })

  it('alertCalibrationColumnsMissing fires a warning-level Sentry event with only scoreId/errorCode/table — no application data', () => {
    alertCalibrationColumnsMissing({ scoreId: 'score-123', errorCode: '42703' })

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    const [message, options] = mockCaptureMessage.mock.calls[0]
    expect(message).toMatch(/calibration columns missing/i)
    expect(message).toMatch(/migration not applied/i)
    expect(options).toEqual({
      level: 'warning',
      extra: {
        table: 'scores',
        scoreId: 'score-123',
        errorCode: '42703',
      },
    })
  })

  it('alertEthoscoreAssessedEventFailed fires a warning-level Sentry event scoped to scoreId/error/eventType', () => {
    alertEthoscoreAssessedEventFailed({ scoreId: 'score-456', error: 'Failed to log workflow event: some db error' })

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    const [message, options] = mockCaptureMessage.mock.calls[0]
    expect(message).toMatch(/ethoscore_assessed event not recorded/i)
    expect(options).toEqual({
      level: 'warning',
      extra: {
        table: 'workflow_events',
        eventType: 'ethoscore_assessed',
        scoreId: 'score-456',
        error: 'Failed to log workflow event: some db error',
      },
    })
  })

  it('alertDecisionRecordPersistFailed fires a warning-level Sentry event scoped to applicationId/error/table — no application data', () => {
    alertDecisionRecordPersistFailed({ applicationId: 'app-789', error: 'relation "decision_records" does not exist' })

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
    const [message, options] = mockCaptureMessage.mock.calls[0]
    expect(message).toMatch(/decision_records not persisted/i)
    expect(options).toEqual({
      level: 'warning',
      extra: {
        table: 'decision_records',
        applicationId: 'app-789',
        error: 'relation "decision_records" does not exist',
      },
    })
  })
})
