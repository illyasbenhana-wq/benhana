'use client'
import { useState } from 'react'
import { Logo } from '../components/Logo'
import { DashboardSidebar } from '../components/DashboardSidebar'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  borderLine,
  shadowSm,
  googleFontsHref,
} from '../../lib/design-system/tokens-light'

type MappingField = string | null
type Mapping = Record<string, MappingField>
type RunStatus = 'idle' | 'mapping' | 'running' | 'completed' | 'error'

const REQUIRED_FIELDS = [
  { key: 'full_name', label: 'Full Name' },
  { key: 'monthly_income', label: 'Monthly Income' },
  { key: 'employment_type', label: 'Employment Type' },
  { key: 'loan_amount', label: 'Loan Amount' },
  { key: 'loan_purpose', label: 'Loan Purpose' },
  { key: 'loan_term_months', label: 'Loan Term (months)' },
  { key: 'actual_outcome', label: 'Loan Outcome (default/repaid)' },
]

const OPTIONAL_FIELDS = [
  { key: 'email', label: 'Email' },
  { key: 'employer_name', label: 'Employer Name' },
  { key: 'months_at_current_job', label: 'Months at Job' },
  { key: 'rent_months_paid', label: 'Rent Months Paid' },
  { key: 'rent_monthly_amount', label: 'Monthly Rent' },
  { key: 'gig_platforms', label: 'Gig Platforms' },
  { key: 'gig_monthly_avg', label: 'Gig Monthly Income' },
  { key: 'savings_amount', label: 'Savings Amount' },
]

export default function BacktestPage() {
  const [status, setStatus] = useState<RunStatus>('idle')
  const [csvText, setCsvText] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Mapping>({})
  const [runName, setRunName] = useState('')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState(false)

  const token = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') ?? '' : ''

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsvText(text)

    const res = await fetch(`/api/backtest/headers?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv_header: text.split('\n')[0] }),
    })

    if (res.status === 401) { setAuthError(true); return }
    const data = await res.json()
    setCsvHeaders(data.data.headers)
    setMapping(data.data.suggested_mapping)
    setStatus('mapping')
  }

  function updateMapping(field: string, csvCol: string | null) {
    setMapping(m => ({ ...m, [field]: csvCol }))
  }

  async function runBacktest() {
    setStatus('running')
    setError('')
    const res = await fetch(`/api/backtest/upload?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvText, name: runName || undefined, mapping }),
    })

    if (res.status === 401) { setAuthError(true); return }
    const data = await res.json()

    if (!res.ok) {
      setError(data.error?.message ?? 'Backtest failed')
      setStatus('error')
      return
    }

    setResult(data.data)
    setStatus('completed')
  }

  if (authError) {
    return (
      <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans, flexDirection: 'column', gap: SP.md }}>
        <link href={googleFontsHref} rel="stylesheet" />
        <p style={{ fontSize: FS.md, fontWeight: FW.medium }}>EthosFi Backtest Tool</p>
        <p style={{ color: C.textSecondary, fontSize: FS.sm }}>This tool requires an access token. Contact the platform admin.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans, overflow: 'hidden' }}>
      <link href={googleFontsHref} rel="stylesheet" />

      <DashboardSidebar />

      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <div style={{ borderBottom: borderLine, padding: `${SP.lg}px ${SP.xxl}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo size="md" />
          <div style={{ fontSize: FS.xs, color: C.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Backtest Tool · Internal Only</div>
        </div>

        <div style={{ maxWidth: 900, margin: '0 auto', padding: `${SP.xxl}px ${SP.xl}px` }}>
          <h1 style={{ fontFamily: F.sans, fontSize: FS.xl, fontWeight: FW.bold, margin: `0 0 8px` }}>Historical Portfolio Backtest</h1>
          <p style={{ color: C.textSecondary, fontSize: FS.sm, marginBottom: SP.xxl }}>Upload a CSV of historical loans → EthoScore v2 scores each row → performance report against actual outcomes.</p>

          {/* Step 1: Upload */}
          {status === 'idle' && (
            <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm, padding: SP.xxl, textAlign: 'center' }}>
              <div style={{ fontSize: FS.sm, color: C.textSecondary, marginBottom: SP.lg }}>Upload a CSV file with historical loan data</div>
              <input type="file" accept=".csv" onChange={handleFileUpload} style={{ color: C.textSecondary, fontSize: FS.sm }} />
              <div style={{ fontSize: FS.xs, color: C.textMuted, marginTop: SP.md }}>Expected: one row per loan, with columns for borrower info, loan details, and repayment outcome</div>
            </div>
          )}

          {/* Step 2: Field Mapping */}
          {status === 'mapping' && (
            <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm, padding: SP.xl }}>
              <div style={{ fontSize: FS.sm, fontWeight: FW.medium, marginBottom: 4 }}>Map Your Columns</div>
              <p style={{ fontSize: FS.xs, color: C.textSecondary, marginBottom: SP.xl }}>We auto-detected {csvHeaders.length} columns. Verify the mapping below.</p>

              <div style={{ marginBottom: SP.lg }}>
                <label style={{ fontSize: FS.xs, color: C.textSecondary }}>Run Name (optional)</label>
                <input value={runName} onChange={e => setRunName(e.target.value)} placeholder="Q1 2025 Portfolio" style={{ width: '100%', padding: '8px 12px', background: C.background, border: borderLine, borderRadius: R.control, color: C.textPrimary, fontSize: FS.sm, marginTop: 4 }} />
              </div>

              <div style={{ fontSize: FS.xs, color: C.accent, marginBottom: SP.md }}>Required Fields</div>
              {REQUIRED_FIELDS.map(f => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: SP.md, marginBottom: SP.sm }}>
                  <span style={{ width: 180, fontSize: FS.xs, color: C.textSecondary }}>{f.label}</span>
                  <select value={mapping[f.key] ?? ''} onChange={e => updateMapping(f.key, e.target.value || null)} style={{ flex: 1, padding: '6px 10px', background: C.background, border: borderLine, borderRadius: R.control, color: C.textPrimary, fontSize: FS.xs }}>
                    <option value="">— not mapped —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}

              <div style={{ fontSize: FS.xs, color: C.textMuted, marginBottom: SP.md, marginTop: SP.xl }}>Optional Fields</div>
              {OPTIONAL_FIELDS.map(f => (
                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: SP.md, marginBottom: SP.sm }}>
                  <span style={{ width: 180, fontSize: FS.xs, color: C.textMuted }}>{f.label}</span>
                  <select value={mapping[f.key] ?? ''} onChange={e => updateMapping(f.key, e.target.value || null)} style={{ flex: 1, padding: '6px 10px', background: C.background, border: borderLine, borderRadius: R.control, color: C.textPrimary, fontSize: FS.xs }}>
                    <option value="">— not mapped —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}

              <button onClick={runBacktest} style={{ marginTop: SP.xl, padding: '12px 32px', borderRadius: R.control, background: C.accent, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: FS.base, fontWeight: FW.medium }}>
                Run Backtest
              </button>
            </div>
          )}

          {/* Step 3: Running */}
          {status === 'running' && (
            <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, boxShadow: shadowSm, padding: SP.xxl, textAlign: 'center' }}>
              <div style={{ fontSize: FS.base, color: C.textSecondary }}>Scoring in progress...</div>
            </div>
          )}

          {/* Step 4: Error */}
          {status === 'error' && (
            <div style={{ background: `${C.riskHigh}0d`, border: `1px solid ${C.riskHigh}44`, borderRadius: R.card, padding: SP.xl }}>
              <div style={{ fontSize: FS.base, fontWeight: FW.medium, color: C.riskHigh, marginBottom: SP.sm }}>Backtest Failed</div>
              <p style={{ fontSize: FS.sm, color: C.textSecondary, margin: 0 }}>{error}</p>
              <button onClick={() => setStatus('mapping')} style={{ marginTop: SP.lg, padding: '8px 20px', borderRadius: R.control, background: C.surface, border: borderLine, color: C.textSecondary, cursor: 'pointer', fontSize: FS.xs }}>Try Again</button>
            </div>
          )}

          {/* Step 5: Results */}
          {status === 'completed' && result && (
            <div>
              {/* Summary Banner */}
              <div style={{ background: `${C.riskLow}0d`, border: `1px solid ${C.riskLow}44`, borderRadius: R.card, padding: `${SP.lg}px ${SP.xl}px`, marginBottom: SP.lg }}>
                <div style={{ fontSize: FS.sm, fontWeight: FW.medium, color: C.riskLow, marginBottom: SP.sm }}>Backtest Complete</div>
                <p style={{ fontSize: FS.sm, color: C.textSecondary, margin: 0, lineHeight: 1.6 }}>{result.summary?.plain_language_summary}</p>
              </div>

              {/* Metrics Grid */}
              {result.summary && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SP.md, marginBottom: SP.lg }}>
                  <div style={{ background: C.surface, border: borderLine, borderRadius: R.data, boxShadow: shadowSm, padding: '16px 20px' }}>
                    <div style={{ fontSize: FS.xs, color: C.textMuted, marginBottom: SP.sm }}>PRECISION</div>
                    <div style={{ fontSize: FS.xl, fontFamily: F.sans, fontWeight: FW.bold, color: C.accent }}>{Math.round(result.summary.precision * 100)}%</div>
                    <div style={{ fontSize: FS.xs, color: C.textMuted }}>of high-risk flags were actual defaults</div>
                  </div>
                  <div style={{ background: C.surface, border: borderLine, borderRadius: R.data, boxShadow: shadowSm, padding: '16px 20px' }}>
                    <div style={{ fontSize: FS.xs, color: C.textMuted, marginBottom: SP.sm }}>RECALL</div>
                    <div style={{ fontSize: FS.xl, fontFamily: F.sans, fontWeight: FW.bold, color: C.riskLow }}>{Math.round(result.summary.recall * 100)}%</div>
                    <div style={{ fontSize: FS.xs, color: C.textMuted }}>of actual defaults were caught</div>
                  </div>
                  <div style={{ background: C.surface, border: borderLine, borderRadius: R.data, boxShadow: shadowSm, padding: '16px 20px' }}>
                    <div style={{ fontSize: FS.xs, color: C.textMuted, marginBottom: SP.sm }}>ROWS SCORED</div>
                    <div style={{ fontSize: FS.xl, fontFamily: F.sans, fontWeight: FW.bold, color: C.textPrimary }}>{result.summary.scored_count}</div>
                    <div style={{ fontSize: FS.xs, color: C.textMuted }}>{result.summary.skipped_count} skipped · {result.summary.error_count} errors</div>
                  </div>
                </div>
              )}

              {/* Default Rate by Band */}
              {result.summary && (
                <div style={{ background: C.surface, border: borderLine, borderRadius: R.data, boxShadow: shadowSm, padding: `${SP.lg}px ${SP.xl}px`, marginBottom: SP.lg }}>
                  <div style={{ fontSize: FS.xs, color: C.textMuted, marginBottom: SP.lg, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Default Rate by Risk Band</div>
                  {(['low', 'medium', 'high'] as const).map(band => {
                    const rate = result.summary.default_rate_by_band[band]
                    const color = band === 'low' ? C.riskLow : band === 'medium' ? C.riskMedium : C.riskHigh
                    return (
                      <div key={band} style={{ display: 'flex', alignItems: 'center', gap: SP.md, marginBottom: SP.sm }}>
                        <span style={{ width: 70, fontSize: FS.xs, color, fontWeight: FW.medium, textTransform: 'capitalize' }}>{band}</span>
                        <div style={{ flex: 1, height: 8, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(rate * 100, 100)}%`, background: color, borderRadius: 4 }} />
                        </div>
                        <span style={{ width: 50, fontSize: FS.xs, color: C.textSecondary, textAlign: 'right' }}>{Math.round(rate * 100)}%</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Confusion Matrix */}
              {result.summary && (
                <div style={{ background: C.surface, border: borderLine, borderRadius: R.data, boxShadow: shadowSm, padding: `${SP.lg}px ${SP.xl}px`, marginBottom: SP.lg }}>
                  <div style={{ fontSize: FS.xs, color: C.textMuted, marginBottom: SP.lg, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Confusion Matrix</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.sm, maxWidth: 300 }}>
                    <div style={{ background: `${C.riskLow}14`, borderRadius: R.control, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: C.riskLow }}>{result.summary.confusion_matrix.tp}</div>
                      <div style={{ fontSize: 10, color: C.textMuted }}>True Positive</div>
                      <div style={{ fontSize: 9, color: C.textMuted }}>Flagged + Defaulted</div>
                    </div>
                    <div style={{ background: `${C.riskMedium}14`, borderRadius: R.control, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: C.riskMedium }}>{result.summary.confusion_matrix.fp}</div>
                      <div style={{ fontSize: 10, color: C.textMuted }}>False Positive</div>
                      <div style={{ fontSize: 9, color: C.textMuted }}>Flagged but Repaid</div>
                    </div>
                    <div style={{ background: `${C.riskHigh}14`, borderRadius: R.control, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: C.riskHigh }}>{result.summary.confusion_matrix.fn}</div>
                      <div style={{ fontSize: 10, color: C.textMuted }}>False Negative</div>
                      <div style={{ fontSize: 9, color: C.textMuted }}>Missed Default</div>
                    </div>
                    <div style={{ background: C.background, border: borderLine, borderRadius: R.control, padding: 12, textAlign: 'center' }}>
                      <div style={{ fontSize: FS.lg, fontWeight: FW.bold, color: C.textSecondary }}>{result.summary.confusion_matrix.tn}</div>
                      <div style={{ fontSize: 10, color: C.textMuted }}>True Negative</div>
                      <div style={{ fontSize: 9, color: C.textMuted }}>Passed + Repaid</div>
                    </div>
                  </div>
                </div>
              )}

              <button onClick={() => { setStatus('idle'); setCsvText(''); setResult(null) }} style={{ padding: '10px 24px', borderRadius: R.control, background: C.surface, border: borderLine, color: C.textSecondary, cursor: 'pointer', fontSize: FS.sm }}>Run Another Backtest</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
