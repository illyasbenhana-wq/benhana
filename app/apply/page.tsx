'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '../components/Logo'
import {
  color as C,
  fontFamily as F,
  fontSize as FS,
  fontWeight as FW,
  radius as R,
  space as SP,
  borderLine,
  googleFontsHref,
} from '../../lib/design-system/tokens-light'

const GIG_PLATFORMS = ['Deliveroo', 'Uber', 'Fiverr', 'Upwork', 'TaskRabbit', 'Etsy', 'Airbnb', 'Other']

const labelCss: React.CSSProperties = {
  fontFamily: F.sans, fontSize: FS.xs, fontWeight: FW.semibold,
  letterSpacing: '0.1em', textTransform: 'uppercase', color: C.textMuted,
}

const fieldLabelCss: React.CSSProperties = {
  fontSize: FS.sm, color: C.textSecondary, marginBottom: 6, display: 'block', letterSpacing: '0.02em',
}

const inputCss: React.CSSProperties = {
  background: C.surface, border: borderLine, color: C.textPrimary,
  padding: '12px 16px', borderRadius: R.control, width: '100%',
  fontFamily: F.sans, fontSize: FS.base, outline: 'none',
}

function StepLabel({ n, children, accent }: { n: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span style={{ fontFamily: F.mono, fontSize: FS.xs, color: C.textMuted }}>{n}</span>
      <span style={{ ...labelCss, color: accent ? C.accent : C.textMuted }}>{children}</span>
    </div>
  )
}

function Tag({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: R.control, fontSize: FS.sm, cursor: 'pointer',
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? C.accentSubtle : C.background,
        color: active ? C.accent : C.textSecondary,
        fontFamily: F.sans, transition: 'all 0.15s ease',
        textTransform: 'capitalize',
      }}
    >
      {children}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: SP.xl }}>
      <label style={fieldLabelCss}>{label}</label>
      {children}
    </div>
  )
}

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

  const stepBtnPrimary: React.CSSProperties = {
    padding: '14px 28px', borderRadius: R.control, fontFamily: F.sans, fontSize: FS.base,
    fontWeight: FW.medium, cursor: 'pointer', border: 'none', background: C.accent, color: '#fff',
    transition: 'background 0.15s ease',
  }
  const stepBtnSecondary: React.CSSProperties = {
    padding: '14px 28px', borderRadius: R.control, fontFamily: F.sans, fontSize: FS.base,
    fontWeight: FW.medium, cursor: 'pointer', background: C.background, color: C.textPrimary,
    border: borderLine, transition: 'background 0.15s ease',
  }

  return (
    <div style={{ minHeight: '100vh', background: C.background, color: C.textPrimary, fontFamily: F.sans }}>
      <link href={googleFontsHref} rel="stylesheet" />

      <style>{`
        * { box-sizing: border-box; }
        input:focus, select:focus { border-color: ${C.accent} !important; }
        input::placeholder { color: ${C.textMuted}; }
        select { background: ${C.surface}; border: 1px solid ${C.border}; color: ${C.textPrimary}; padding: 12px 16px; border-radius: ${R.control}px; width: 100%; font-family: inherit; font-size: ${FS.base}px; outline: none; }
        .progress-dot { width: 8px; height: 8px; border-radius: 50%; transition: all 0.3s; }
        .btn-primary:hover { background: ${C.accentHover}; }
        .btn-primary:disabled { background: ${C.border}; color: ${C.textSecondary}; cursor: not-allowed; }
        .btn-secondary:hover { background: ${C.surface}; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .fade-up { animation: fadeUp 0.4s ease forwards; }
      `}</style>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: `${SP.xxxl}px ${SP.xl}px` }}>

        {/* Header */}
        <div style={{ marginBottom: SP.xxxl }}>
          <div style={{ marginBottom: SP.xxl }}>
            <Logo size="md" />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: SP.xl }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="progress-dot" style={{ background: i <= step ? C.accent : C.border, width: i === step ? 24 : 8 }} />
            ))}
          </div>

          <div style={{ marginBottom: SP.sm }}>
            <StepLabel n={`0${step}`} accent>{['Your details', 'Financial picture', 'Loan request'][step - 1]}</StepLabel>
          </div>
          <h1 style={{ fontFamily: F.sans, fontSize: 24, fontWeight: FW.semibold, letterSpacing: '-0.01em', margin: 0, lineHeight: 1.2 }}>
            {['Tell us about yourself', 'Your financial picture', 'What do you need?'][step - 1]}
          </h1>
          <p style={{ color: C.textSecondary, fontSize: FS.base, marginTop: SP.sm }}>
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
            <Field label="Full name"><input style={inputCss} value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Fatima Al-Hassan" /></Field>
            <Field label="Email address"><input style={inputCss} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="fatima@email.com" /></Field>
            <Field label="Employment type">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['employed', 'self_employed', 'gig', 'freelance', 'unemployed'].map(t => (
                  <Tag key={t} active={form.employment_type === t} onClick={() => set('employment_type', t)}>{t.replace('_', ' ')}</Tag>
                ))}
              </div>
            </Field>
            {form.employment_type === 'employed' && (
              <Field label="Employer name"><input style={inputCss} value={form.employer_name} onChange={e => set('employer_name', e.target.value)} placeholder="Company name" /></Field>
            )}
            <Field label="Monthly income (£)"><input style={inputCss} type="number" value={form.monthly_income} onChange={e => set('monthly_income', e.target.value)} placeholder="2400" /></Field>
            <Field label="Months in current role"><input style={inputCss} type="number" value={form.months_at_current_job} onChange={e => set('months_at_current_job', e.target.value)} placeholder="18" /></Field>
            <button className="btn-primary" style={{ ...stepBtnPrimary, width: '100%', marginTop: SP.xs }}
              disabled={!form.full_name || !form.email || !form.monthly_income}
              onClick={() => setStep(2)}>Continue →</button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="fade-up">
            {/* Timely one-off guidance — accent-rule editorial block, not chrome */}
            <div style={{ borderLeft: `2px solid ${C.accent}`, background: `${C.accentSubtle}66`, padding: `${SP.md}px ${SP.lg}px`, marginBottom: SP.xl }}>
              <p style={{ fontSize: FS.sm, color: C.textSecondary, margin: 0, lineHeight: 1.6 }}>These signals are weighted heavily in your EthoScore™ — consistent rent payments and stable income are strong indicators of creditworthiness.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.lg }}>
              <Field label="Rent paid on time (months)"><input style={inputCss} type="number" value={form.rent_months_paid} onChange={e => set('rent_months_paid', e.target.value)} placeholder="18" /></Field>
              <Field label="Monthly rent (£)"><input style={inputCss} type="number" value={form.rent_monthly_amount} onChange={e => set('rent_monthly_amount', e.target.value)} placeholder="900" /></Field>
            </div>
            <Field label="Gig platforms (select all that apply)">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {GIG_PLATFORMS.map(p => (
                  <Tag key={p} active={form.gig_platforms.includes(p)} onClick={() => toggleGig(p)}>{p}</Tag>
                ))}
              </div>
            </Field>
            {form.gig_platforms.length > 0 && (
              <Field label="Average monthly gig income (£)"><input style={inputCss} type="number" value={form.gig_monthly_avg} onChange={e => set('gig_monthly_avg', e.target.value)} placeholder="600" /></Field>
            )}
            <Field label="Current savings (£)"><input style={inputCss} type="number" value={form.savings_amount} onChange={e => set('savings_amount', e.target.value)} placeholder="1500" /></Field>
            <div style={{ display: 'flex', gap: SP.md, marginTop: SP.xs }}>
              <button className="btn-secondary" style={stepBtnSecondary} onClick={() => setStep(1)}>← Back</button>
              <button className="btn-primary" style={{ ...stepBtnPrimary, flex: 1 }} onClick={() => setStep(3)}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="fade-up">
            <Field label="Loan amount (£)"><input style={inputCss} type="number" value={form.loan_amount} onChange={e => set('loan_amount', e.target.value)} placeholder="5000" /></Field>
            <Field label="What's it for?">
              <select value={form.loan_purpose} onChange={e => set('loan_purpose', e.target.value)}>
                <option value="">Select purpose</option>
                <option>Home improvement</option><option>Car purchase</option><option>Debt consolidation</option>
                <option>Business start-up</option><option>Education</option><option>Medical expenses</option>
                <option>Emergency fund</option><option>Other</option>
              </select>
            </Field>
            <Field label="Repayment term">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['6', '12', '24', '36', '48', '60'].map(t => (
                  <Tag key={t} active={form.loan_term_months === t} onClick={() => set('loan_term_months', t)}>{t} months</Tag>
                ))}
              </div>
            </Field>

            {/* Live computed figures the applicant needs to register — KPI-style stat pair, not a soft callout */}
            {form.loan_amount && form.monthly_income && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SP.md, marginBottom: SP.xl }}>
                <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, padding: '16px 18px' }}>
                  <div style={{ ...labelCss, marginBottom: 8 }}>Est. Monthly Payment</div>
                  <div style={{ fontFamily: F.mono, fontSize: 24, fontWeight: FW.bold, color: C.accent, lineHeight: 1 }}>
                    £{Math.round(Number(form.loan_amount) / Number(form.loan_term_months))}
                  </div>
                </div>
                <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, padding: '16px 18px' }}>
                  <div style={{ ...labelCss, marginBottom: 8 }}>Of Annual Income</div>
                  <div style={{ fontFamily: F.mono, fontSize: 24, fontWeight: FW.bold, color: C.accent, lineHeight: 1 }}>
                    {((Number(form.loan_amount) / (Number(form.monthly_income) * 12)) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            )}

            {/* Legal/compliance consent — deliberately boxed, distinct and unmissable */}
            <div style={{ background: C.surface, border: borderLine, borderRadius: R.card, padding: '18px 20px', marginBottom: SP.xl }}>
              <label style={{ display: 'flex', gap: SP.md, cursor: 'pointer', marginBottom: SP.md }}>
                <input type="checkbox" checked={form.consent_data_use} onChange={e => set('consent_data_use', e.target.checked)} style={{ width: 'auto' }} />
                <span style={{ fontSize: FS.sm, color: C.textSecondary, lineHeight: 1.5 }}>I consent to EthosFi processing my financial data to generate a credit score.</span>
              </label>
              <label style={{ display: 'flex', gap: SP.md, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.consent_ai_decision} onChange={e => set('consent_ai_decision', e.target.checked)} style={{ width: 'auto' }} />
                <span style={{ fontSize: FS.sm, color: C.textSecondary, lineHeight: 1.5 }}>I understand this assessment uses AI, compliant with EU AI Act Article 22, and I have the right to request human review.</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: SP.md }}>
              <button className="btn-secondary" style={stepBtnSecondary} onClick={() => setStep(2)}>← Back</button>
              <button className="btn-primary" style={{ ...stepBtnPrimary, flex: 1 }}
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
