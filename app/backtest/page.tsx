'use client'
import { useState } from 'react'

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
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 16, fontWeight: 500 }}>EthosFi Backtest Tool</p>
        <p style={{ color: '#555', fontSize: 13 }}>This tool requires an access token. Contact the platform admin.</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      <div style={{ borderBottom: '1px solid #1a1a28', padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#4a9eff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 5V8C14 11.31 11.46 14.42 8 15C4.54 14.42 2 11.31 2 8V5L8 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18 }}>EthosFi</span>
        </div>
        <div style={{ fontSize: 12, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Backtest Tool · Internal Only</div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 32px' }}>
        <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 28, fontWeight: 400, margin: '0 0 8px' }}>Historical Portfolio Backtest</h1>
        <p style={{ color: '#555', fontSize: 13, marginBottom: 32 }}>Upload a CSV of historical loans → EthoScore v2 scores each row → performance report against actual outcomes.</p>

        {/* Step 1: Upload */}
        {status === 'idle' && (
          <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 14, padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Upload a CSV file with historical loan data</div>
            <input type="file" accept=".csv" onChange={handleFileUpload} style={{ color: '#888', fontSize: 13 }} />
            <div style={{ fontSize: 11, color: '#444', marginTop: 12 }}>Expected: one row per loan, with columns for borrower info, loan details, and repayment outcome</div>
          </div>
        )}

        {/* Step 2: Field Mapping */}
        {status === 'mapping' && (
          <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 14, padding: '24px' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Map Your Columns</div>
            <p style={{ fontSize: 12, color: '#555', marginBottom: 20 }}>We auto-detected {csvHeaders.length} columns. Verify the mapping below.</p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#888' }}>Run Name (optional)</label>
              <input value={runName} onChange={e => setRunName(e.target.value)} placeholder="Q1 2025 Portfolio" style={{ width: '100%', padding: '8px 12px', background: '#0a0a0f', border: '1px solid #2a2a38', borderRadius: 8, color: '#e8e6df', fontSize: 13, marginTop: 4 }} />
            </div>

            <div style={{ fontSize: 11, color: '#4a9eff', marginBottom: 12 }}>Required Fields</div>
            {REQUIRED_FIELDS.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ width: 180, fontSize: 12, color: '#888' }}>{f.label}</span>
                <select value={mapping[f.key] ?? ''} onChange={e => updateMapping(f.key, e.target.value || null)} style={{ flex: 1, padding: '6px 10px', background: '#0a0a0f', border: '1px solid #2a2a38', borderRadius: 6, color: '#e8e6df', fontSize: 12 }}>
                  <option value="">— not mapped —</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}

            <div style={{ fontSize: 11, color: '#555', marginBottom: 12, marginTop: 20 }}>Optional Fields</div>
            {OPTIONAL_FIELDS.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ width: 180, fontSize: 12, color: '#666' }}>{f.label}</span>
                <select value={mapping[f.key] ?? ''} onChange={e => updateMapping(f.key, e.target.value || null)} style={{ flex: 1, padding: '6px 10px', background: '#0a0a0f', border: '1px solid #2a2a38', borderRadius: 6, color: '#e8e6df', fontSize: 12 }}>
                  <option value="">— not mapped —</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}

            <button onClick={runBacktest} style={{ marginTop: 20, padding: '12px 32px', borderRadius: 10, background: '#4a9eff', color: '#000', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500 }}>
              Run Backtest
            </button>
          </div>
        )}

        {/* Step 3: Running */}
        {status === 'running' && (
          <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 14, padding: '32px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#888' }}>Scoring in progress...</div>
          </div>
        )}

        {/* Step 4: Error */}
        {status === 'error' && (
          <div style={{ background: '#2a0d0d', border: '1px solid #E24B4A44', borderRadius: 14, padding: '24px' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#E24B4A', marginBottom: 8 }}>Backtest Failed</div>
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{error}</p>
            <button onClick={() => setStatus('mapping')} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, background: '#2a2a38', color: '#888', border: 'none', cursor: 'pointer', fontSize: 12 }}>Try Again</button>
          </div>
        )}

        {/* Step 5: Results */}
        {status === 'completed' && result && (
          <div>
            {/* Summary Banner */}
            <div style={{ background: '#0d2a20', border: '1px solid #1D9E7544', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#1D9E75', marginBottom: 8 }}>Backtest Complete</div>
              <p style={{ fontSize: 13, color: '#888', margin: 0, lineHeight: 1.6 }}>{result.summary?.plain_language_summary}</p>
            </div>

            {/* Metrics Grid */}
            {result.summary && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>PRECISION</div>
                  <div style={{ fontSize: 28, fontFamily: '"DM Serif Display", serif', color: '#4a9eff' }}>{Math.round(result.summary.precision * 100)}%</div>
                  <div style={{ fontSize: 11, color: '#555' }}>of high-risk flags were actual defaults</div>
                </div>
                <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>RECALL</div>
                  <div style={{ fontSize: 28, fontFamily: '"DM Serif Display", serif', color: '#1D9E75' }}>{Math.round(result.summary.recall * 100)}%</div>
                  <div style={{ fontSize: 11, color: '#555' }}>of actual defaults were caught</div>
                </div>
                <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 12, padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 8 }}>ROWS SCORED</div>
                  <div style={{ fontSize: 28, fontFamily: '"DM Serif Display", serif', color: '#e8e6df' }}>{result.summary.scored_count}</div>
                  <div style={{ fontSize: 11, color: '#555' }}>{result.summary.skipped_count} skipped · {result.summary.error_count} errors</div>
                </div>
              </div>
            )}

            {/* Default Rate by Band */}
            {result.summary && (
              <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 16, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Default Rate by Risk Band</div>
                {(['low', 'medium', 'high'] as const).map(band => {
                  const rate = result.summary.default_rate_by_band[band]
                  const color = band === 'low' ? '#1D9E75' : band === 'medium' ? '#BA7517' : '#E24B4A'
                  return (
                    <div key={band} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <span style={{ width: 70, fontSize: 12, color, fontWeight: 500, textTransform: 'capitalize' }}>{band}</span>
                      <div style={{ flex: 1, height: 8, background: '#1a1a28', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(rate * 100, 100)}%`, background: color, borderRadius: 4 }} />
                      </div>
                      <span style={{ width: 50, fontSize: 12, color: '#888', textAlign: 'right' }}>{Math.round(rate * 100)}%</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Confusion Matrix */}
            {result.summary && (
              <div style={{ background: '#13131a', border: '1px solid #1a1a28', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 16, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Confusion Matrix</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 300 }}>
                  <div style={{ background: '#0d2a20', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#1D9E75' }}>{result.summary.confusion_matrix.tp}</div>
                    <div style={{ fontSize: 10, color: '#555' }}>True Positive</div>
                    <div style={{ fontSize: 9, color: '#444' }}>Flagged + Defaulted</div>
                  </div>
                  <div style={{ background: '#2a1e0a', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#BA7517' }}>{result.summary.confusion_matrix.fp}</div>
                    <div style={{ fontSize: 10, color: '#555' }}>False Positive</div>
                    <div style={{ fontSize: 9, color: '#444' }}>Flagged but Repaid</div>
                  </div>
                  <div style={{ background: '#2a0d0d', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#E24B4A' }}>{result.summary.confusion_matrix.fn}</div>
                    <div style={{ fontSize: 10, color: '#555' }}>False Negative</div>
                    <div style={{ fontSize: 9, color: '#444' }}>Missed Default</div>
                  </div>
                  <div style={{ background: '#0a0a0f', border: '1px solid #1a1a28', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#888' }}>{result.summary.confusion_matrix.tn}</div>
                    <div style={{ fontSize: 10, color: '#555' }}>True Negative</div>
                    <div style={{ fontSize: 9, color: '#444' }}>Passed + Repaid</div>
                  </div>
                </div>
              </div>
            )}

            <button onClick={() => { setStatus('idle'); setCsvText(''); setResult(null) }} style={{ padding: '10px 24px', borderRadius: 8, background: '#2a2a38', color: '#888', border: 'none', cursor: 'pointer', fontSize: 13 }}>Run Another Backtest</button>
          </div>
        )}
      </div>
    </div>
  )
}
