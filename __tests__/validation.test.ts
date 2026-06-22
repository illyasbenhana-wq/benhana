import { describe, it, expect } from 'vitest'
import { validateApplicationForm } from '../types'

describe('validateApplicationForm', () => {
  const VALID_FORM = {
    full_name: 'Test User',
    email: 'test@example.com',
    monthly_income: 3000,
    employment_type: 'employed',
    loan_amount: 5000,
    loan_purpose: 'Home improvement',
    loan_term_months: 12,
    consent_data_use: true,
    consent_ai_decision: true,
  }

  it('accepts valid form', () => {
    const result = validateApplicationForm(VALID_FORM)
    expect(result.valid).toBe(true)
  })

  it('returns parsed ApplicationForm on success', () => {
    const result = validateApplicationForm(VALID_FORM)
    if (result.valid === false) throw new Error('Expected valid')
    expect(result.data.full_name).toBe('Test User')
    expect(result.data.email).toBe('test@example.com')
    expect(result.data.monthly_income).toBe(3000)
  })

  it('defaults optional fields', () => {
    const result = validateApplicationForm(VALID_FORM)
    if (result.valid === false) throw new Error('Expected valid')
    expect(result.data.rent_months_paid).toBe(0)
    expect(result.data.gig_platforms).toEqual([])
    expect(result.data.savings_amount).toBe(0)
  })

  it('rejects null/undefined', () => {
    expect(validateApplicationForm(null).valid).toBe(false)
    expect(validateApplicationForm(undefined).valid).toBe(false)
  })

  it('rejects empty full_name', () => {
    const result = validateApplicationForm({ ...VALID_FORM, full_name: '' })
    expect(result.valid).toBe(false)
  })

  it('rejects invalid email', () => {
    const result = validateApplicationForm({ ...VALID_FORM, email: 'not-an-email' })
    expect(result.valid).toBe(false)
  })

  it('rejects negative monthly_income', () => {
    const result = validateApplicationForm({ ...VALID_FORM, monthly_income: -100 })
    expect(result.valid).toBe(false)
  })

  it('rejects invalid employment_type', () => {
    const result = validateApplicationForm({ ...VALID_FORM, employment_type: 'astronaut' })
    expect(result.valid).toBe(false)
  })

  it('accepts all valid employment types', () => {
    for (const t of ['employed', 'self_employed', 'gig', 'freelance', 'unemployed']) {
      const result = validateApplicationForm({ ...VALID_FORM, employment_type: t })
      expect(result.valid).toBe(true)
    }
  })

  it('rejects zero loan_amount', () => {
    const result = validateApplicationForm({ ...VALID_FORM, loan_amount: 0 })
    expect(result.valid).toBe(false)
  })

  it('rejects empty loan_purpose', () => {
    const result = validateApplicationForm({ ...VALID_FORM, loan_purpose: '' })
    expect(result.valid).toBe(false)
  })

  it('rejects false consent_data_use', () => {
    const result = validateApplicationForm({ ...VALID_FORM, consent_data_use: false })
    expect(result.valid).toBe(false)
  })

  it('rejects false consent_ai_decision', () => {
    const result = validateApplicationForm({ ...VALID_FORM, consent_ai_decision: false })
    expect(result.valid).toBe(false)
  })

  it('filters non-string gig_platforms', () => {
    const result = validateApplicationForm({ ...VALID_FORM, gig_platforms: ['Uber', 123, null, 'Fiverr'] })
    if (result.valid === false) throw new Error('Expected valid')
    expect(result.data.gig_platforms).toEqual(['Uber', 'Fiverr'])
  })

  it('returns specific error message for each field', () => {
    const r1 = validateApplicationForm({ ...VALID_FORM, full_name: '' })
    if (r1.valid !== false) throw new Error('Expected invalid')
    expect(r1.error).toContain('full_name')

    const r2 = validateApplicationForm({ ...VALID_FORM, employment_type: 'x' })
    if (r2.valid !== false) throw new Error('Expected invalid')
    expect(r2.error).toContain('employment_type')
  })
})
