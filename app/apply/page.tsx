'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const GIG_PLATFORMS = ['Deliveroo', 'Uber', 'Fiverr', 'Upwork', 'TaskRabbit', 'Etsy', 'Airbnb', 'Other']

export default function ApplyPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    full_name: '', email: '',
    monthly_income: '', employment_type: 'employed',
    employer_name: '', months_at_current_job: '',
    rent_months_paid: '', rent_monthly_amount: '',
    gig_platforms: [] as string[], gig_monthly_avg: '',
    savings_amount: '',
    loan_amount: '', loan_purpose: '', loan_term_months: '12',
    consent_data_use: false, consent_ai_decision: false
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const toggleGig = (p: string) => {
    set('gig_platforms', form.gig_platforms.includes(p)
      ? form.gig_platforms.filter(x => x !== p)
      : [...form.gig_platforms, p])
  }

  const submit = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          monthly_income: Number(form.monthly_income),
          months_at_current_job: Number(form.months_at_current_job),
          rent_months_paid: Number(form.rent_months_paid),
          rent_monthly_amount: Number(form.rent_monthly_amount),
          gig_monthly_avg: Number(form.gig_monthly_avg),
          savings_amount: Number(form.savings_amount),
          loan_amount: Number(form.loan_amount),
          loan_term_months: Number(form.loan_term_months),
        })
      })
      const data = await res.json()
      if (data.application_id) {
        router.push(`/score/${data.application_id}`)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e6df', fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />

      <style>{`
        * { box-sizing: border-box; }
        input, select, textarea { background: #13131a; border: 1px solid #2a2a38; color: #e8e6df; padding: 12px 16px; border-radius: 10px; width: 100%; font-family: inherit; font-size: 15px; outline: none; transition: border-color 0.2s; }
        input:focus, select:focus, textarea:focus { border-color: #4a9eff; }
        input::placeholder { color: #555570; }
        .step-btn { padding: 14px 28px; border-radius: 10px; font-family: inherit; font-size: 15px; font-weight: 500; cursor: pointer; transition: all 0.2s; border: none; }
        .btn-primary { background: #4a9eff; color: #000; }
        .btn-primary:hover { background: #6ab4ff; }
        .btn-primary:disabled { background: #2a4a70; color: #556; cursor: not-allowed; }
        .btn-secondary { background: transparent; color: #888; border: 1px solid #2a2a38; }
        .btn-secondary:hover { border-color: #444; color: #aaa; }
        .tag { padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer; border: 1px solid #2a2a38; background: transparent; color: #888; transition: all 0.2s; }
        .tag.active { border-color: #4a9eff; color: #4a9eff; background: #0d1f33; }
        .progress-dot { width: 8px; height: 8px; border-radius: 50%; transition: all 0.3s; }
        label { font-size: 13px; color: #888; margin-bottom: 6px; display: block; letter-spacing: 0.02em; }
        .field { margin-bottom: 20px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.4s ease forwards; }
      `}</style>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#4a9eff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14 5V8C14 11.31 11.46 14.42 8 15C4.54 14.42 2 11.31 2 8V5L8 2Z" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            </div>
            <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18, letterSpacing: '-0.01em' }}>EthosFi</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="progress-dot" style={{ background: i <= step ? '#4a9eff' : '#2a2a38', width: i === step ? 24 : 8 }} />
            ))}
          </div>

          <p style={{ fontSize: 11, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Step {step} of 3 · {['Your details', 'Financial picture', 'Loan request'][step - 1]}
          </p>
          <h1 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 32, fontWeight: 400, margin: 0, lineHeight: 1.2 }}>
            {['Tell us about yourself', 'Your financial picture', 'What do you need?'][step - 1]}
          </h1>
          <p style={{ color: '#666', fontSize: 15, marginTop: 8 }}>
            {[
              'No credit score needed. We look at the full picture.',
              'Alternative signals that traditional banks ignore.',
              'Almost there — your EthoScore™ takes under 30 seconds.'
            ][step - 1]}
          </p>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div className="fade-up">
            <div className="field"><label>Full name</label><input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Fatima Al-Hassan" /></div>
            <div className="field"><label>Email address</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="fatima@email.com" /></div>
            <div className="field">
              <label>Employment type</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {['employed', 'self_employed', 'gig', 'freelance', 'unemployed'].map(t => (
                  <button key={t} className={`tag ${form.employment_type === t ? 'active' : ''}`} onClick={() => set('employment_type', t)}>
                    {t.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            {form.employment_type === 'employed' && (
              <div className="field"><label>Employer name</label><input value={form.employer_name} onChange={e => set('employer_name', e.target.value)} placeholder="Company name" /></div>
            )}
            <div className="field"><label>Monthly income (£)</label><input type="number" value={form.monthly_income} onChange={e => set('monthly_income', e.target.value)} placeholder="2400" /></div>
            <div className="field"><label>Months in current role</label><input type="number" value={form.months_at_current_job} onChange={e => set('months_at_current_job', e.target.value)} placeholder="18" /></div>
            <button className="step-btn btn-primary" style={{ width: '100%', marginTop: 8 }}
              disabled={!form.full_name || !form.email || !form.monthly_income}
              onClick={() => setStep(2)}>Continue →</button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="fade-up">
            <div style={{ background: '#13131a', border: '1px solid #2a2a38', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
              <p style={{ fontSize: 13, color: '#888', margin: 0 }}>These signals are weighted heavily in your EthoScore™ — consistent rent payments and stable income are strong indicators of creditworthiness.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="field"><label>Rent paid on time (months)</label><input type="number" value={form.rent_months_paid} onChange={e => set('rent_months_paid', e.target.value)} placeholder="18" /></div>
              <div className="field"><label>Monthly rent (£)</label><input type="number" value={form.rent_monthly_amount} onChange={e => set('rent_monthly_amount', e.target.value)} placeholder="900" /></div>
            </div>
            <div className="field">
              <label>Gig platforms (select all that apply)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {GIG_PLATFORMS.map(p => (
                  <button key={p} className={`tag ${form.gig_platforms.includes(p) ? 'active' : ''}`} onClick={() => toggleGig(p)}>{p}</button>
                ))}
              </div>
            </div>
            {form.gig_platforms.length > 0 && (
              <div className="field"><label>Average monthly gig income (£)</label><input type="number" value={form.gig_monthly_avg} onChange={e => set('gig_monthly_avg', e.target.value)} placeholder="600" /></div>
            )}
            <div className="field"><label>Current savings (£)</label><input type="number" value={form.savings_amount} onChange={e => set('savings_amount', e.target.value)} placeholder="1500" /></div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button className="step-btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
              <button className="step-btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(3)}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="fade-up">
            <div className="field"><label>Loan amount (£)</label><input type="number" value={form.loan_amount} onChange={e => set('loan_amount', e.target.value)} placeholder="5000" /></div>
            <div className="field"><label>What's it for?</label>
              <select value={form.loan_purpose} onChange={e => set('loan_purpose', e.target.value)}>
                <option value="">Select purpose</option>
                <option>Home improvement</option><option>Car purchase</option><option>Debt consolidation</option>
                <option>Business start-up</option><option>Education</option><option>Medical expenses</option>
                <option>Emergency fund</option><option>Other</option>
              </select>
            </div>
            <div className="field"><label>Repayment term</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {['6', '12', '24', '36', '48', '60'].map(t => (
                  <button key={t} className={`tag ${form.loan_term_months === t ? 'active' : ''}`} onClick={() => set('loan_term_months', t)}>{t} months</button>
                ))}
              </div>
            </div>
            {form.loan_amount && form.monthly_income && (
              <div style={{ background: '#0d1f33', border: '1px solid #1a3a5c', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#4a9eff' }}>
                  ~£{Math.round(Number(form.loan_amount) / Number(form.loan_term_months))}/month · {((Number(form.loan_amount) / (Number(form.monthly_income) * 12)) * 100).toFixed(0)}% of annual income
                </p>
              </div>
            )}

            <div style={{ background: '#13131a', border: '1px solid #2a2a38', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
              <label style={{ display: 'flex', gap: 12, cursor: 'pointer', marginBottom: 12 }}>
                <input type="checkbox" checked={form.consent_data_use} onChange={e => set('consent_data_use', e.target.checked)} style={{ width: 'auto' }} />
                <span style={{ fontSize: 13, color: '#999', lineHeight: 1.5 }}>I consent to EthosFi processing my financial data to generate a credit score.</span>
              </label>
              <label style={{ display: 'flex', gap: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.consent_ai_decision} onChange={e => set('consent_ai_decision', e.target.checked)} style={{ width: 'auto' }} />
                <span style={{ fontSize: 13, color: '#999', lineHeight: 1.5 }}>I understand this assessment uses AI, compliant with EU AI Act Article 22, and I have the right to request human review.</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="step-btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
              <button className="step-btn btn-primary" style={{ flex: 1 }}
                disabled={!form.loan_amount || !form.loan_purpose || !form.consent_data_use || !form.consent_ai_decision || loading}
                onClick={submit}>
                {loading ? 'Scoring...' : 'Get my EthoScore™ →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
