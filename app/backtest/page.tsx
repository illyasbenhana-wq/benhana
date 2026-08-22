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
      <style>{`
        .ethos-kpi-card { transition: box-shadow .2s ease, border-color .2s ease; }
        .ethos-kpi-card:hover { box-shadow: 0 4px 16px -4px rgba(15,23,42,0.10); border-color: ${C.textSecondary}; }
      `}</style>

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
              <div style={{ fontSize: FS.sm, color: C.accent, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: SP.lg }}>Scoring in progress</div>
              <div style={{ width: 240, height: 2, background: C.border, borderRadius: 2, overflow: 'hidden', margin: '0 auto' }}>
                <div style={{ height: '100%', background: C.accent, animation: 'backtestLoad 1.5s ease-in-out infinite', width: '40%' }} />
              </div>
              <style>{`@keyframes backtestLoad { 0%{transform:translateX(-100%)} 100%{transform:translateX(700%)} }`}</style>
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
              {/* Summary — the headline moment, Tier-3 weight */}
              <div style={{ background: `${C.riskLow}0d`, border: `1px solid ${C.riskLow}44`, borderRadius: R.card, padding: `${SP.xl}px ${SP.xxl}px`, marginBottom: SP.xl }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm, marginBottom: SP.md }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.riskLow, flexShrink: 0 }} />
                  <span style={{ fontSize: FS.base, fontWeight: FW.semibold, color: C.riskLow }}>Backtest Complete</span>
                </div>
                <p style={{ fontSize: FS.base, color: C.textPrimary, margin: 0, lineHeight: 1.65, maxWidth: 620 }}>{result.summary?.plain_language_summary}</p>
              </div>

              {/* KPI cards — 3 distinct metrics, real hierarchy per card */}
              {result.summary && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: SP.md, marginBottom: SP.xl }}>
                  {[
                    { label: 'Precision', value: `${Math.round(result.summary.precision * 100)}%`, sub: 'of high-risk flags were actual defaults', color: C.accent },
                    { label: 'Recall', value: `${Math.round(result.summary.recall * 100)}%`, sub: 'of actual defaults were caught', color: C.riskLow },
                    { label: 'Rows Scored', value: String(result.summary.scored_count), sub: `${result.summary.skipped_count} skipped · ${result.summary.error_count} errors`, color: C.textPrimary },
                  ].map(kpi => (
                    <div key={kpi.label} className="ethos-kpi-card" style={{ background: C.surface, border: borderLine, borderRadius: R.data, boxShadow: shadowSm, padding: '18px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: SP.md }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: kpi.color, flexShrink: 0 }} />
                        <span style={{ fontSize: FS.xs, color: C.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{kpi.label}</span>
                      </div>
                      <div style={{ fontSize: 30, fontFamily: F.mono, fontWeight: FW.bold, color: kpi.color, lineHeight: 1, marginBottom: 6 }}>{kpi.value}</div>
                      <div style={{ fontSize: FS.xs, color: C.textMuted }}>{kpi.sub}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Default Rate by Band — one coherent mini-chart: shared
                  0-100% axis, gridlines, single title, not 3 disconnected rows */}
              {result.summary && (
                <div style={{ background: C.surface, border: borderLine, borderRadius: R.data, boxShadow: shadowSm, padding: `${SP.lg}px ${SP.xl}px`, marginBottom: SP.xl }}>
                  <div style={{ fontSize: FS.xs, color: C.textMuted, marginBottom: SP.xl, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Default Rate by Risk Band</div>
                  {(['low', 'medium', 'high'] as const).map((band, i) => {
                    const rate = result.summary.default_rate_by_band[band]
                    const color = band === 'low' ? C.riskLow : band === 'medium' ? C.riskMedium : C.riskHigh
                    return (
                      <div key={band} style={{ display: 'flex', alignItems: 'center', gap: SP.md, marginBottom: i < 2 ? SP.md : SP.sm }}>
                        <span style={{ width: 70, fontSize: FS.xs, color, fontWeight: FW.medium, textTransform: 'capitalize' }}>{band}</span>
                        <div style={{ flex: 1, position: 'relative', height: 8, background: C.background, border: borderLine, borderRadius: 4, overflow: 'hidden' }}>
                          {/* 25/50/75% gridlines, shared across all 3 bars */}
                          {[25, 50, 75].map(gl => (
                            <div key={gl} style={{ position: 'absolute', left: `${gl}%`, top: 0, bottom: 0, width: 1, background: C.border }} />
                          ))}
                          <div style={{ position: 'relative', height: '100%', width: `${Math.min(rate * 100, 100)}%`, background: color, borderRadius: 4 }} />
                        </div>
                        <span style={{ width: 50, fontSize: FS.xs, color: C.textSecondary, textAlign: 'right', fontFamily: F.mono }}>{Math.round(rate * 100)}%</span>
                      </div>
                    )
                  })}
                  <div style={{ display: 'flex', paddingLeft: 70 + SP.md, marginTop: SP.sm }}>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.textMuted, fontFamily: F.mono }}>
                      <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                    </div>
                    <span style={{ width: 50 }} />
                  </div>
                </div>
              )}

              {/* Confusion Matrix — ONE real 2x2 matrix with shared internal
                  borders and axis labels, not 4 independently-boxed tiles
                  inside an outer card. */}
              {result.summary && (
                <div style={{ marginBottom: SP.xl }}>
                  <div style={{ fontSize: FS.xs, color: C.textMuted, marginBottom: SP.lg, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Confusion Matrix</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', maxWidth: 420 }}>
                    <div />
                    <div style={{ textAlign: 'center', fontSize: FS.xs, color: C.textMuted, paddingBottom: SP.sm }}>Predicted Default</div>
                    <div style={{ textAlign: 'center', fontSize: FS.xs, color: C.textMuted, paddingBottom: SP.sm }}>Predicted Repaid</div>

                    <div style={{ display: 'flex', alignItems: 'center', fontSize: FS.xs, color: C.textMuted, paddingRight: SP.sm }}>Actual Default</div>
                    <div style={{ background: `${C.riskLow}14`, border: borderLine, borderRight: 'none', borderBottom: 'none', padding: '16px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: FS.xl, fontFamily: F.mono, fontWeight: FW.bold, color: C.riskLow }}>{result.summary.confusion_matrix.tp}</div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>True Positive</div>
                    </div>
                    <div style={{ background: `${C.riskHigh}14`, border: borderLine, borderBottom: 'none', padding: '16px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: FS.xl, fontFamily: F.mono, fontWeight: FW.bold, color: C.riskHigh }}>{result.summary.confusion_matrix.fn}</div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>False Negative</div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', fontSize: FS.xs, color: C.textMuted, paddingRight: SP.sm }}>Actual Repaid</div>
                    <div style={{ background: `${C.riskMedium}14`, border: borderLine, borderRight: 'none', padding: '16px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: FS.xl, fontFamily: F.mono, fontWeight: FW.bold, color: C.riskMedium }}>{result.summary.confusion_matrix.fp}</div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>False Positive</div>
                    </div>
                    <div style={{ background: C.background, border: borderLine, padding: '16px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: FS.xl, fontFamily: F.mono, fontWeight: FW.bold, color: C.textSecondary }}>{result.summary.confusion_matrix.tn}</div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>True Negative</div>
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
