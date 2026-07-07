// PLACEHOLDER — original file exists locally, uncommitted. Reconcile before merge to main.
/**
 * Fictional demo compliance case for the analyst dashboard queue.
 *
 * This module was referenced by `app/dashboard/page.tsx` and
 * `app/[org]/dashboard/page.tsx` but was missing from the repo, which
 * broke `next build`. Recreated as a build-unblocking PLACEHOLDER using
 * clearly fictional demo data only — no real entity, no backend, no DB.
 *
 * Shape mirrors the local `ComplianceCase` / `Signal` types used in the
 * dashboard pages. Reconcile with the original (uncommitted) file before
 * merging to `main`.
 */

type Signal = { name: string; score: number; rationale: string }

type Severity = 'critical' | 'high' | 'medium' | 'low'
type CaseStatus = 'open' | 'escalated' | 'pending_info' | 'cleared'

export type ComplianceCase = {
  id: string
  case_ref: string
  entity_name: string
  case_type: string
  jurisdiction: string
  exposure_amount: number
  severity: Severity
  sla_hours: number
  sla_remaining_hours: number
  status: CaseStatus
  assigned_to: string
  opened_at: string
  risk_score: number
  ai_summary: string
  signals: Signal[]
}

export const FATIMA_OKOYE_CASE_REF = 'INV-1052'

export const fatimaOkoyeComplianceCase: ComplianceCase = {
  id: 'case-fatima-okoye-demo',
  case_ref: FATIMA_OKOYE_CASE_REF,
  entity_name: 'Fatima Okoye (DEMO — fictional)',
  case_type: 'Merchant Corridor Flag',
  jurisdiction: 'Nigeria / UK / UAE',
  exposure_amount: 160000,
  severity: 'medium',
  sla_hours: 48,
  sla_remaining_hours: 40.0,
  status: 'open',
  assigned_to: 'R. Okonkwo',
  opened_at: new Date(Date.now() - 7200000).toISOString(),
  risk_score: 58,
  ai_summary:
    'DEMO DATA — fictional entity. Fatima Okoye, a cross-border apparel merchant, triggered a corridor-monitoring flag after routing new-corridor volume through UAE free-zone accounts inconsistent with the Nigeria→UK profile established at onboarding. On-time payment history is strong (92%) and no sanctions or PEP matches were found; the flag reflects a corridor deviation, not confirmed wrongdoing. Enhanced merchant due diligence requested; monitoring continued pending corridor rationale.',
  signals: [
    { name: 'Corridor Deviation', score: 64, rationale: 'New UAE free-zone corridor outside the onboarding profile (Nigeria→UK apparel trade). Updated merchant risk assessment requested.' },
    { name: 'Payment Consistency', score: 22, rationale: '92% on-time rate across 22 months of trade-finance repayments — a mitigating strength, not a risk driver.' },
    { name: 'Counterparty Risk', score: 48, rationale: 'One UAE intermediary incorporated within the last 12 months; limited trade history. KYC refresh outstanding.' },
    { name: 'Velocity Anomaly', score: 31, rationale: 'Transaction frequency within normal parameters for the segment. No threshold-avoidance patterns detected.' },
  ],
}
