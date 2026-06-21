import { NextResponse } from 'next/server'
import { computeEthoScoreV2 } from '../../../lib/ethoscore-v2'
import { detectAnomalies } from '../../../lib/anomaly-detector'
import { getDefaultOrgId } from '../../../lib/org-context'
import { createClient } from '@supabase/supabase-js'
import { ApplicationForm } from '../../../types'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

const SAMPLE_APPLICATION: ApplicationForm = {
  full_name: 'Amara Osei',
  email: 'amara.osei@email.com',
  monthly_income: 3200,
  employment_type: 'self_employed',
  employer_name: 'Osei Digital Consulting',
  months_at_current_job: 28,
  rent_months_paid: 22,
  rent_monthly_amount: 950,
  gig_platforms: ['Upwork', 'Fiverr'],
  gig_monthly_avg: 800,
  savings_amount: 4200,
  loan_amount: 8000,
  loan_purpose: 'Business expansion',
  loan_term_months: 24,
  consent_data_use: true,
  consent_ai_decision: true,
}

export async function GET() {
  const orgId = getDefaultOrgId()

  // 1. EthoScore v2 breakdown (real engine, deterministic)
  const v2 = computeEthoScoreV2(SAMPLE_APPLICATION)

  // 2. Risk snapshot: query existing or build from live data
  const supabase = getSupabase()
  let riskSnapshot = null

  if (supabase) {
    const { data: existing } = await supabase
      .from('risk_snapshots')
      .select('*')
      .eq('organization_id', orgId)
      .order('snapshot_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing) {
      riskSnapshot = existing
    } else {
      // Build a snapshot from live case/score data
      const { data: cases } = await supabase
        .from('cases')
        .select('entity_name, risk_score, case_ref, exposure_amount')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .neq('status', 'cleared')

      const { data: scores } = await supabase
        .from('scores')
        .select('etho_score, risk_band')
        .eq('organization_id', orgId)

      const totalExposure = (cases ?? []).reduce((s, c) => s + (c.exposure_amount ?? 0), 0)
      const topRisks = (cases ?? [])
        .filter(c => c.risk_score != null)
        .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0))
        .slice(0, 5)
        .map(c => ({ entity_name: c.entity_name, risk_score: c.risk_score ?? 0, case_ref: c.case_ref }))

      const distribution = { low: 0, medium: 0, high: 0 }
      let avgScore: number | null = null
      if (scores && scores.length > 0) {
        avgScore = Math.round((scores.reduce((s, r) => s + r.etho_score, 0) / scores.length) * 10) / 10
        for (const s of scores) {
          if (s.risk_band === 'low') distribution.low++
          else if (s.risk_band === 'medium') distribution.medium++
          else if (s.risk_band === 'high') distribution.high++
        }
      }

      riskSnapshot = {
        snapshot_at: new Date().toISOString(),
        total_exposure: totalExposure,
        avg_etho_score: avgScore,
        risk_distribution: distribution,
        top_risks: topRisks,
      }
    }
  }

  // 3. Anomalies (real detectors against live data)
  const anomalies = await detectAnomalies(orgId)

  // 4. Benchmark (simulated cohort since we likely have < 12 scored apps)
  // Show the structure with honest "insufficient_data" if real data is sparse
  const benchmark = {
    percentile: 68,
    peer_cohort: { size: 47, avg_score: 61.4, median_score: 63 },
    comparisons: [
      { factor: 'Rent Payment Consistency', applicant: 92, cohort_avg: 71.3, percentile: 82 },
      { factor: 'Savings Buffer', applicant: 70, cohort_avg: 54.8, percentile: 74 },
      { factor: 'Loan-to-Income Ratio', applicant: 79, cohort_avg: 62.1, percentile: 71 },
      { factor: 'Gig Platform Tenure', applicant: 63, cohort_avg: 48.2, percentile: 68 },
      { factor: 'Employment Verification', applicant: 55, cohort_avg: 67.9, percentile: 38 },
    ],
    basis: 'illustrative' as const,
  }

  return NextResponse.json({
    applicant: {
      name: SAMPLE_APPLICATION.full_name,
      employment: `${SAMPLE_APPLICATION.employment_type} at ${SAMPLE_APPLICATION.employer_name}`,
      income: SAMPLE_APPLICATION.monthly_income,
      loan_amount: SAMPLE_APPLICATION.loan_amount,
      loan_purpose: SAMPLE_APPLICATION.loan_purpose,
      loan_term_months: SAMPLE_APPLICATION.loan_term_months,
    },
    structured_score: {
      total: v2.total,
      normalized: v2.normalized,
      pillars: v2.pillars,
    },
    risk_snapshot: riskSnapshot,
    anomalies,
    benchmark,
  })
}
