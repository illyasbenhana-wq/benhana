/**
 * Selects the cash-flow figures EthoScore's bank-verified prompt receives.
 *
 * Ocrolus's cash_flow_features data dictionary hasn't been received, so
 * field names are not assumed: the payload is flattened, identifying
 * fields are dropped, and numeric metrics whose names look financial are
 * kept (capped). The FULL raw payload is still frozen verbatim in the
 * Decision Package snapshot — this only decides what the model is shown.
 */

import type { VerifiedBankData } from '../scoring-engine'

const MAX_METRICS = 30

// Never sent to the model: identity / account details.
const IDENTIFYING = /(account|holder|name|address|iban|sort_?code|routing|number|email|phone|uuid|(^|_)pk$|(^|_)id$)/i
const FINANCIAL = /(income|credit|deposit|payroll|salary|balance|debit|spend|expense|nsf|overdraft|rent|loan|inflow|outflow|revenue|transfer|months?_covered)/i

function flatten(value: unknown, prefix: string, out: Record<string, unknown>, depth: number): void {
  if (depth > 4 || value === null || value === undefined) return
  if (Array.isArray(value)) return // per-transaction lists are not summary metrics
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out, depth + 1)
    }
    return
  }
  out[prefix] = value
}

export function selectBankMetrics(raw: unknown): VerifiedBankData {
  const flat: Record<string, unknown> = {}
  flatten(raw, '', flat, 0)

  const metrics: Record<string, number> = {}
  for (const [key, value] of Object.entries(flat)) {
    if (Object.keys(metrics).length >= MAX_METRICS) break
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const leaf = key.split('.').pop() ?? key
    if (IDENTIFYING.test(leaf) || !FINANCIAL.test(key)) continue
    metrics[key] = Math.round(value * 100) / 100
  }

  const start = typeof flat.period_start === 'string' ? flat.period_start : typeof flat.start_date === 'string' ? flat.start_date : null
  const end = typeof flat.period_end === 'string' ? flat.period_end : typeof flat.end_date === 'string' ? flat.end_date : null

  return { metrics, statementPeriod: start && end ? `${start} to ${end}` : undefined }
}
