import { createClient } from '@supabase/supabase-js'
import { computeEthoScoreV2, EthoScoreV2Result } from './ethoscore-v2'
import { computeRiskBand } from './scoring-engine'
import { ApplicationForm, EmploymentType } from '@/types'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FieldMapping {
  full_name: string | null
  email: string | null
  monthly_income: string | null
  employment_type: string | null
  employer_name: string | null
  months_at_current_job: string | null
  rent_months_paid: string | null
  rent_monthly_amount: string | null
  gig_platforms: string | null
  gig_monthly_avg: string | null
  savings_amount: string | null
  loan_amount: string | null
  loan_purpose: string | null
  loan_term_months: string | null
  actual_outcome: string | null
  employment_type_map?: Record<string, EmploymentType>
}

export interface BacktestRow {
  [key: string]: string | number | undefined
}

export interface BacktestSummary {
  default_rate_by_band: { low: number; medium: number; high: number }
  confusion_matrix: { tp: number; fp: number; tn: number; fn: number }
  precision: number
  recall: number
  missed_good_count: number
  avoided_bad_count: number
  scored_count: number
  skipped_count: number
  error_count: number
  plain_language_summary: string
}

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

export function parseCsv(text: string): { headers: string[]; rows: BacktestRow[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return { headers: [], rows: [] }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows: BacktestRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: BacktestRow = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? ''
    }
    rows.push(row)
  }

  return { headers, rows }
}

// ─── Field Mapping ───────────────────────────────────────────────────────────

const VALID_EMPLOYMENT_TYPES = new Set<EmploymentType>(['employed', 'self_employed', 'gig', 'freelance', 'unemployed'])

function mapRow(row: BacktestRow, mapping: FieldMapping): { form: ApplicationForm; outcome: string } | { error: string } {
  const get = (field: string | null): string => {
    if (!field) return ''
    return String(row[field] ?? '').trim()
  }

  const getNum = (field: string | null, fallback: number = 0): number => {
    const raw = get(field)
    const n = parseFloat(raw)
    return isNaN(n) ? fallback : n
  }

  const fullName = get(mapping.full_name)
  const loanAmount = getNum(mapping.loan_amount)

  if (!fullName && !loanAmount) {
    return { error: 'Missing both full_name and loan_amount — cannot score an empty row' }
  }

  // Map employment type with optional value translation
  let empType: EmploymentType = 'employed'
  const rawEmp = get(mapping.employment_type).toLowerCase()
  if (mapping.employment_type_map && rawEmp in mapping.employment_type_map) {
    empType = mapping.employment_type_map[rawEmp]
  } else if (VALID_EMPLOYMENT_TYPES.has(rawEmp as EmploymentType)) {
    empType = rawEmp as EmploymentType
  }

  // Parse gig platforms from comma-separated or JSON
  let gigPlatforms: string[] = []
  const gigRaw = get(mapping.gig_platforms)
  if (gigRaw) {
    // Intentional fallback: if gig_platforms isn't valid JSON, treat as semicolon-separated string
    try { gigPlatforms = JSON.parse(gigRaw) } catch { gigPlatforms = gigRaw.split(';').map(s => s.trim()).filter(Boolean) }
  }

  const outcomeRaw = get(mapping.actual_outcome).toLowerCase()
  let outcome = 'unknown'
  if (outcomeRaw === 'default' || outcomeRaw === 'defaulted' || outcomeRaw === 'charged_off' || outcomeRaw === 'bad') outcome = 'default'
  else if (outcomeRaw === 'repaid' || outcomeRaw === 'paid' || outcomeRaw === 'current' || outcomeRaw === 'good' || outcomeRaw === 'fully_paid') outcome = 'repaid'

  return {
    form: {
      full_name: fullName || 'Unknown',
      email: get(mapping.email) || 'unknown@backtest.local',
      monthly_income: getNum(mapping.monthly_income),
      employment_type: empType,
      employer_name: get(mapping.employer_name) || undefined,
      months_at_current_job: getNum(mapping.months_at_current_job) || undefined,
      rent_months_paid: getNum(mapping.rent_months_paid),
      rent_monthly_amount: getNum(mapping.rent_monthly_amount),
      gig_platforms: gigPlatforms,
      gig_monthly_avg: getNum(mapping.gig_monthly_avg),
      savings_amount: getNum(mapping.savings_amount),
      loan_amount: loanAmount || 1000,
      loan_purpose: get(mapping.loan_purpose) || 'Not specified',
      loan_term_months: getNum(mapping.loan_term_months, 12),
      consent_data_use: true,
      consent_ai_decision: true,
    },
    outcome,
  }
}

// ─── Batch Scoring ───────────────────────────────────────────────────────────

const CHUNK_SIZE = 50

export async function runBacktest(
  runId: string,
  orgId: string,
  rows: BacktestRow[],
  mapping: FieldMapping
): Promise<BacktestSummary> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Database not configured')

  await supabase
    .from('backtest_runs')
    .update({ status: 'processing' })
    .eq('id', runId)

  let scored = 0
  let skipped = 0
  let errors = 0
  const allResults: Array<{
    predicted_band: string | null
    actual_outcome: string
    status: string
  }> = []

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const inserts: any[] = []

    for (let j = 0; j < chunk.length; j++) {
      const rowIndex = i + j
      const mapped = mapRow(chunk[j], mapping)

      if ('error' in mapped) {
        inserts.push({
          run_id: runId,
          organization_id: orgId,
          row_index: rowIndex,
          input_data: chunk[j],
          status: 'skipped',
          error_reason: mapped.error,
          predicted_score: null,
          predicted_band: null,
          predicted_pillars: null,
          actual_outcome: 'unknown',
        })
        skipped++
        allResults.push({ predicted_band: null, actual_outcome: 'unknown', status: 'skipped' })
        continue
      }

      try {
        const v2 = computeEthoScoreV2(mapped.form)
        const band = computeRiskBand(v2.normalized)

        inserts.push({
          run_id: runId,
          organization_id: orgId,
          row_index: rowIndex,
          input_data: mapped.form,
          status: 'scored',
          error_reason: null,
          predicted_score: v2.total,
          predicted_band: band,
          predicted_pillars: v2.pillars,
          actual_outcome: mapped.outcome,
        })
        scored++
        allResults.push({ predicted_band: band, actual_outcome: mapped.outcome, status: 'scored' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Scoring failed'
        inserts.push({
          run_id: runId,
          organization_id: orgId,
          row_index: rowIndex,
          input_data: chunk[j],
          status: 'error',
          error_reason: msg,
          predicted_score: null,
          predicted_band: null,
          predicted_pillars: null,
          actual_outcome: mapped.outcome,
        })
        errors++
        allResults.push({ predicted_band: null, actual_outcome: mapped.outcome, status: 'error' })
      }
    }

    await supabase.from('backtest_results').insert(inserts)

    await supabase
      .from('backtest_runs')
      .update({ scored_rows: scored })
      .eq('id', runId)
  }

  const summary = generateSummary(allResults, scored, skipped, errors)

  await supabase
    .from('backtest_runs')
    .update({ status: 'completed', summary, scored_rows: scored })
    .eq('id', runId)

  return summary
}

// ─── Report Generation ───────────────────────────────────────────────────────

function generateSummary(
  results: Array<{ predicted_band: string | null; actual_outcome: string; status: string }>,
  scoredCount: number,
  skippedCount: number,
  errorCount: number
): BacktestSummary {
  const scored = results.filter(r => r.status === 'scored')

  // Default rate by band
  const bandCounts: Record<string, { total: number; defaults: number }> = {
    low: { total: 0, defaults: 0 },
    medium: { total: 0, defaults: 0 },
    high: { total: 0, defaults: 0 },
  }
  for (const r of scored) {
    if (r.predicted_band && bandCounts[r.predicted_band]) {
      bandCounts[r.predicted_band].total++
      if (r.actual_outcome === 'default') bandCounts[r.predicted_band].defaults++
    }
  }
  const defaultRateByBand = {
    low: bandCounts.low.total > 0 ? Math.round((bandCounts.low.defaults / bandCounts.low.total) * 1000) / 1000 : 0,
    medium: bandCounts.medium.total > 0 ? Math.round((bandCounts.medium.defaults / bandCounts.medium.total) * 1000) / 1000 : 0,
    high: bandCounts.high.total > 0 ? Math.round((bandCounts.high.defaults / bandCounts.high.total) * 1000) / 1000 : 0,
  }

  // Confusion matrix: high-risk prediction vs actual default
  // Positive = predicted high risk, Actual positive = defaulted
  let tp = 0, fp = 0, tn = 0, fn = 0
  for (const r of scored) {
    const predictedHighRisk = r.predicted_band === 'high'
    const actualDefault = r.actual_outcome === 'default'

    if (predictedHighRisk && actualDefault) tp++
    else if (predictedHighRisk && !actualDefault) fp++
    else if (!predictedHighRisk && actualDefault) fn++
    else tn++
  }

  const precision = (tp + fp) > 0 ? Math.round((tp / (tp + fp)) * 1000) / 1000 : 0
  const recall = (tp + fn) > 0 ? Math.round((tp / (tp + fn)) * 1000) / 1000 : 0

  // Missed good borrowers: flagged high-risk but actually repaid
  const missedGood = fp

  // Avoided bad loans: flagged high-risk and actually defaulted
  const avoidedBad = tp

  // Plain language summary
  const totalWithOutcome = scored.filter(r => r.actual_outcome !== 'unknown').length
  const unknownOutcome = scored.filter(r => r.actual_outcome === 'unknown').length

  let plainSummary = `EthoScore v2 was backtested against ${scoredCount} historical loan records.`

  if (totalWithOutcome > 0) {
    plainSummary += ` Of ${totalWithOutcome} loans with known outcomes, `
    plainSummary += `${tp} actual defaults were correctly flagged as high-risk (${Math.round(recall * 100)}% recall). `
    plainSummary += `${fp} loans were flagged high-risk but actually repaid (${Math.round(precision * 100)}% precision). `

    if (defaultRateByBand.high > defaultRateByBand.low) {
      plainSummary += `Default rates by risk band show clear separation: low=${Math.round(defaultRateByBand.low * 100)}%, medium=${Math.round(defaultRateByBand.medium * 100)}%, high=${Math.round(defaultRateByBand.high * 100)}%.`
    } else {
      plainSummary += `Risk band separation is weak — further calibration may be needed.`
    }
  }

  if (unknownOutcome > 0) {
    plainSummary += ` ${unknownOutcome} rows had no outcome data and were scored but excluded from accuracy metrics.`
  }

  if (skippedCount > 0 || errorCount > 0) {
    plainSummary += ` ${skippedCount} rows were skipped (incomplete data) and ${errorCount} rows had scoring errors.`
  }

  return {
    default_rate_by_band: defaultRateByBand,
    confusion_matrix: { tp, fp, tn, fn },
    precision,
    recall,
    missed_good_count: missedGood,
    avoided_bad_count: avoidedBad,
    scored_count: scoredCount,
    skipped_count: skippedCount,
    error_count: errorCount,
    plain_language_summary: plainSummary,
  }
}

// ─── Auto-Guess Mapping ─────────────────────────────────────────────────────

const GUESS_MAP: Record<string, string[]> = {
  full_name: ['name', 'borrower_name', 'borrower', 'full_name', 'applicant'],
  email: ['email', 'contact_email', 'email_address'],
  monthly_income: ['monthly_income', 'income', 'gross_income', 'gross_monthly_income', 'salary'],
  employment_type: ['employment_type', 'emp_type', 'emp_status', 'employment', 'job_type'],
  employer_name: ['employer', 'employer_name', 'company'],
  months_at_current_job: ['tenure', 'months_employed', 'tenure_months', 'months_at_current_job', 'job_tenure'],
  rent_months_paid: ['rent_months', 'rent_history', 'rent_months_paid', 'rent_history_months'],
  rent_monthly_amount: ['rent', 'monthly_rent', 'rent_amount', 'rent_monthly_amount'],
  gig_platforms: ['gig_platforms', 'platforms', 'gig_platform'],
  gig_monthly_avg: ['gig_income', 'gig_avg', 'gig_monthly_avg', 'platform_income'],
  savings_amount: ['savings', 'savings_amount', 'savings_balance', 'cash_reserves'],
  loan_amount: ['loan_amount', 'amount', 'requested_amount', 'principal', 'loan_size'],
  loan_purpose: ['purpose', 'loan_purpose', 'use_of_funds'],
  loan_term_months: ['term', 'loan_term', 'term_months', 'loan_term_months', 'duration'],
  actual_outcome: ['outcome', 'status', 'loan_status', 'result', 'default_status', 'repayment_status'],
}

export function guessMapping(headers: string[]): FieldMapping {
  const mapping: Record<string, string | null> = {}
  const lowerHeaders = headers.map(h => h.toLowerCase().replace(/[\s\-]/g, '_'))

  for (const [field, candidates] of Object.entries(GUESS_MAP)) {
    const match = lowerHeaders.findIndex(h => candidates.includes(h))
    mapping[field] = match >= 0 ? headers[match] : null
  }

  return mapping as unknown as FieldMapping
}
