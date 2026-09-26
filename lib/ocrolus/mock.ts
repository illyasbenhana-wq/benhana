/**
 * Sandbox-only Ocrolus simulation (OCROLUS_MODE=mock).
 *
 * Exercises the exact same pipeline as live mode — book, upload, webhook
 * events, Detect + cash-flow fetch, re-score, Decision Package — with
 * fixed fixture data, so partners can test end to end without Ocrolus
 * credentials. Every result it produces is recorded with mode 'mock'.
 *
 * Deterministic test switches, by uploaded file name:
 *   contains "tampered"   → Detect finds an edit signal (→ human review)
 *   contains "unreadable" → Detect unable to process    (→ human review)
 *   contains "rejected"   → Ocrolus rejects the document
 */

import { randomUUID } from 'crypto'
import { OcrolusClient, OcrolusMode, UploadResult } from './client'

export type MockScenario = 'clean' | 'tampered' | 'unreadable' | 'rejected'

export function mockScenarioFor(fileName: string): MockScenario {
  const n = fileName.toLowerCase()
  if (n.includes('rejected')) return 'rejected'
  if (n.includes('tampered')) return 'tampered'
  if (n.includes('unreadable')) return 'unreadable'
  return 'clean'
}

// Shape follows the one Detect example in Ocrolus's deck.
function detectFixture(scenario: MockScenario): unknown {
  if (scenario === 'tampered') {
    return {
      form_analysis: [{
        signals: [{ identifier: 'dollar_amount_edits' }],
        form_authenticity: { score: 30, reason_codes: [{ code: '006-L', confidence: 'LOW', description: 'fields misaligned' }] },
      }],
    }
  }
  if (scenario === 'unreadable') return { form_analysis: [] }
  return { form_analysis: [{ signals: [], form_authenticity: { score: 95, reason_codes: [] } }] }
}

// Personal-account figures (GBP). Field names are illustrative — Ocrolus's
// data dictionary for cash_flow_features has not been received yet.
const CASH_FLOW_FIXTURE = {
  period_start: '2026-06-01',
  period_end: '2026-08-31',
  months_covered: 3,
  avg_monthly_credits_3m: 3950,
  avg_monthly_payroll_3m: 3600,
  avg_monthly_debits_3m: 3420,
  avg_daily_balance_3m: 2140,
  min_daily_balance_3m: 310,
  nsf_count_3m: 0,
  overdraft_days_3m: 0,
}

export class MockOcrolusClient implements OcrolusClient {
  mode: OcrolusMode = 'mock'
  private scenarios = new Map<string, MockScenario>()

  async createBook(): Promise<{ bookUuid: string }> {
    return { bookUuid: `mock-book-${randomUUID()}` }
  }

  async uploadStatement(bookUuid: string, _file: Blob, fileName: string): Promise<UploadResult> {
    this.scenarios.set(bookUuid, mockScenarioFor(fileName))
    return { docUuid: `mock-doc-${randomUUID()}`, duplicate: false }
  }

  scenarioFor(bookUuid: string): MockScenario {
    return this.scenarios.get(bookUuid) ?? 'clean'
  }

  async getDetectSignals(bookUuid: string): Promise<unknown> {
    return detectFixture(this.scenarioFor(bookUuid))
  }

  async getCashFlowFeatures(): Promise<unknown> {
    return { ...CASH_FLOW_FIXTURE }
  }
}
