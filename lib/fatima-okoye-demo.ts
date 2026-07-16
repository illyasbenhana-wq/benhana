import { MerchantProfile } from './merchant-scoring'

/** Shared demo persona — Merchant Intelligence + compliance dashboard alerts. */
export const FATIMA_OKOYE_CASE_REF = 'INV-1052'
export const FATIMA_OKOYE_ENTITY = 'Okoye Apparel Trading'

export const fatimaOkoyeProfile: MerchantProfile = {
  id: 'fatima-okoye-001',
  name: 'Fatima Okoye',
  country: 'Lagos, Nigeria',
  industry: 'Apparel & Textiles',
  annualRevenue: 120000,
  tradeCorridors: [
    { region: 'United Kingdom', volume: 80000 },
    { region: 'United Arab Emirates', volume: 30000 },
    { region: 'Ghana', volume: 50000 },
  ],
  paymentHistory: { onTimeRate: 0.92, avgDelayDays: 2 },
  esgScore: 68,
}

export const fatimaOkoyeMerchantAlert = {
  title: 'Corridor risk — UK → Lagos',
  detail: 'Inbound GBP flows +22% vs 30-day baseline; 3 corridors active (UK, UAE, Ghana).',
  caseRef: FATIMA_OKOYE_CASE_REF,
}

export function fatimaOkoyeRecommendationRationale(
  recommendation: 'approve' | 'review' | 'decline'
): string {
  switch (recommendation) {
    case 'approve':
      return 'Payment consistency and corridor diversity support onboarding; maintain standard monitoring.'
    case 'decline':
      return 'Corridor or counterparty signals exceed appetite; pause limit increases pending EDD.'
    default:
      return 'Fatima Okoye shows strong on-time payments and viable cross-border trade, but UK→Nigeria volume spike (INV-1052) requires analyst review before limit increase.'
  }
}

/** Compliance case row for dashboard sidebar / critical alerts (mock + optional DB seed). */
export const fatimaOkoyeComplianceCase = {
  id: 'case-6',
  case_ref: FATIMA_OKOYE_CASE_REF,
  entity_name: FATIMA_OKOYE_ENTITY,
  case_type: 'Corridor Risk',
  jurisdiction: 'Nigeria / UK / UAE / Ghana',
  exposure_amount: 160000,
  severity: 'medium' as const,
  sla_hours: 24,
  sla_remaining_hours: 18.5,
  status: 'open' as const,
  assigned_to: 'R. Okonkwo',
  opened_at: new Date(Date.now() - 7200000).toISOString(),
  risk_score: 58,
  ai_summary:
    'Okoye Apparel Trading (principal: Fatima Okoye, Lagos) shows elevated UK→Nigeria corridor activity — +22% vs 30-day baseline across apparel settlements. No sanctions or PEP hits. Merchant Intelligence trust score is moderate; payment history is strong (92% on-time). AI recommendation: manual review before raising settlement limits. Aligns with transaction monitoring alert INV-1052.',
  signals: [
    {
      name: 'Corridor Risk',
      score: 64,
      rationale: 'UK→Lagos volume spike; three active corridors (UK, UAE, Ghana) — within trade profile but above recent baseline.',
    },
    {
      name: 'Payment Consistency',
      score: 28,
      rationale: '92% on-time settlement rate; avg 2-day delay — low risk vs peer SMEs in corridor.',
    },
    {
      name: 'Geographic Dispersion',
      score: 55,
      rationale: 'Counterparties across UK, UAE, and Ghana; no FATF high-risk jurisdiction in current window.',
    },
    {
      name: 'Merchant Profile Match',
      score: 42,
      rationale: 'Fatima Okoye — apparel & textiles, $120K annual revenue; alternative signals consistent with stated activity.',
    },
  ],
}
