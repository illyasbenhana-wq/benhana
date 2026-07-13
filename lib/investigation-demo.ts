/**
 * EthosFi — Investigation Dossier demo data (UX-1 Screen 2)
 * ------------------------------------------------------------------
 * PLACEHOLDER / DESIGN-ONLY. Frontend seed data for the Case /
 * Investigation view (Screen 2). No backend, no API routes, no DB
 * access. These dossiers extend the dashboard's mock ComplianceCase
 * shape with two view-only concepts the current schema does not yet
 * model — a risk `timeline` and `connectedEntities`. Reconcile with
 * real `cases` / `workflow_events` / entity-graph data before merge to
 * main.
 *
 * Entities are clearly fictional. Keyed by case reference (e.g.
 * INV-1047) so the route /case/[ref] can resolve directly.
 */

export type DossierSignal = { name: string; score: number; rationale: string }

/** A single event on the investigation risk timeline. */
export type TimelineEvent = {
  /** Wall-clock time label, e.g. "14:22". */
  time: string
  /** Relative day label, e.g. "Today" / "Yesterday". */
  day: string
  /** Drives the dot glyph + color. */
  kind: 'sanctions' | 'anomaly' | 'signal' | 'opened' | 'note' | 'escalation'
  title: string
  detail: string
  /** Optional confidence percentage (0–100) shown in mono. */
  confidence?: number
}

/** An entity connected to the case subject (director, parent, linked case). */
export type ConnectedEntity = {
  relation: string
  name: string
  /** If this connection is itself an open case, its reference. */
  linkedCaseRef?: string
  note?: string
}

/** A single EthoScore pillar (0–1000 scale — never colored via caseRiskColor). */
export type EthoPillar = { name: string; value: number; humanNote: string }

export type InvestigationDossier = {
  id: string
  caseRef: string
  entityName: string
  caseType: string
  jurisdiction: string
  exposureAmount: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'escalated' | 'pending_info' | 'cleared'
  slaHours: number
  slaRemainingHours: number
  assignedTo: string
  openedAt: string
  riskScore: number
  aiSummary: string
  signals: DossierSignal[]
  timeline: TimelineEvent[]
  connectedEntities: ConnectedEntity[]
  /** EthoScore (0–1000, higher = better). Illustrative preview only. */
  ethoScore: number
  ethoPillars: EthoPillar[]
}

const h = 3600000

export const INVESTIGATION_DOSSIERS: Record<string, InvestigationDossier> = {
  'INV-1047': {
    id: 'case-1',
    caseRef: 'INV-1047',
    entityName: 'Meridian Capital Ltd',
    caseType: 'Sanctions Match',
    jurisdiction: 'OFAC / EU',
    exposureAmount: 2400000,
    severity: 'critical',
    status: 'open',
    slaHours: 4,
    slaRemainingHours: 1.2,
    assignedTo: 'S. Chen',
    openedAt: new Date(Date.now() - 3 * h).toISOString(),
    riskScore: 89,
    aiSummary:
      'Meridian Capital Ltd has been flagged against two OFAC SDN list entries and one EU Consolidated Sanctions List entry. Transaction flows totalling £2.4M were routed through correspondent accounts in three jurisdictions over a 72-hour window. The beneficial ownership structure presents opacity consistent with evasion typologies. Immediate escalation and account freeze recommended pending full investigation.',
    signals: [
      { name: 'Sanctions Exposure', score: 94, rationale: 'Entity matches 2 OFAC SDN entries and 1 EU Consolidated List entry with 98.4% confidence. Mandatory review within 4-hour SLA.' },
      { name: 'Velocity Anomaly', score: 82, rationale: '17 transactions within 6 hours on 3 May — 3.2× the 90-day baseline. Pattern consistent with layering behaviour.' },
      { name: 'Geographic Dispersion', score: 71, rationale: 'Counterparties across 8 jurisdictions including FATF high-risk: Iran, Myanmar, Russia.' },
      { name: 'Ownership Opacity', score: 88, rationale: '4 shell layers across BVI, Seychelles, Malta. Ultimate beneficial owner not positively identified.' },
    ],
    timeline: [
      { time: '14:22', day: 'Today', kind: 'sanctions', title: 'Sanctions hit confirmed', detail: 'OFAC SDN match verified by senior analyst. Account flagged for freeze.', confidence: 94 },
      { time: '13:45', day: 'Today', kind: 'anomaly', title: 'Velocity anomaly', detail: '+340% transaction volume vs 90-day baseline, concentrated over a 6-hour window.', confidence: 82 },
      { time: '11:30', day: 'Today', kind: 'opened', title: 'Case opened', detail: 'Auto-assigned to S. Chen under the 4-hour sanctions SLA policy.' },
      { time: '09:15', day: 'Today', kind: 'signal', title: 'Signal detected', detail: 'Geographic risk flag raised — counterparties in FATF high-risk jurisdictions.', confidence: 71 },
    ],
    connectedEntities: [
      { relation: 'Director', name: 'J. Hartwell' },
      { relation: 'Parent', name: 'Apex Holdings' },
      { relation: 'Linked', name: 'Vega Trade Finance', linkedCaseRef: 'INV-1038', note: 'open case' },
    ],
    ethoScore: 312,
    ethoPillars: [
      { name: 'Trust', value: 210, humanNote: 'Ownership could not be positively verified' },
      { name: 'Track Record', value: 340, humanNote: '3 years trading, 1 prior compliance query' },
      { name: 'Financial Health', value: 520, humanNote: 'Liquidity adequate; flows inconsistent with profile' },
      { name: 'ESG', value: 180, humanNote: 'Sanctions exposure materially lowers standing' },
    ],
  },

  'INV-1038': {
    id: 'case-2',
    caseRef: 'INV-1038',
    entityName: 'Vega Trade Finance',
    caseType: 'Velocity Anomaly',
    jurisdiction: 'UK / UAE',
    exposureAmount: 890000,
    severity: 'high',
    status: 'open',
    slaHours: 8,
    slaRemainingHours: 3.5,
    assignedTo: 'R. Okonkwo',
    openedAt: new Date(Date.now() - 4.5 * h).toISOString(),
    riskScore: 74,
    aiSummary:
      'Vega Trade Finance has exhibited a sustained surge in transaction frequency over the past 5 days, with volumes 280% above the established baseline. Activity is concentrated between 01:00–04:00 UTC. Two counterparties were previously flagged in unrelated structuring investigations. Enhanced due diligence and ongoing account monitoring recommended.',
    signals: [
      { name: 'Velocity Anomaly', score: 86, rationale: '280% above 90-day baseline; concentrated in low-activity hours (01:00–04:00 UTC) over 5 consecutive days.' },
      { name: 'Counterparty Risk', score: 72, rationale: 'Two counterparties appear in historical structuring case files (INV-0891, INV-0934). No current sanctions designation.' },
      { name: 'Geographic Dispersion', score: 61, rationale: 'Flows routed via UAE free-zone accounts before onward transfer to UK — common trade-based money laundering pathway.' },
      { name: 'Round-Sum Transactions', score: 58, rationale: '14 transactions at £49,500–£49,900 — consistent with threshold avoidance below the £50,000 reporting trigger.' },
    ],
    timeline: [
      { time: '12:08', day: 'Today', kind: 'anomaly', title: 'Velocity anomaly', detail: '280% above baseline for a 5th consecutive day, 01:00–04:00 UTC window.', confidence: 86 },
      { time: '10:52', day: 'Today', kind: 'signal', title: 'Counterparty flag', detail: 'Two counterparties matched to historical structuring files INV-0891, INV-0934.', confidence: 72 },
      { time: '08:40', day: 'Today', kind: 'opened', title: 'Case opened', detail: 'Auto-assigned to R. Okonkwo under the enhanced-monitoring policy.' },
      { time: '17:19', day: 'Yesterday', kind: 'signal', title: 'Signal detected', detail: 'Round-sum transactions clustered just below the £50,000 reporting threshold.', confidence: 58 },
    ],
    connectedEntities: [
      { relation: 'Director', name: 'A. Farouk' },
      { relation: 'Linked', name: 'Meridian Capital Ltd', linkedCaseRef: 'INV-1047', note: 'open case' },
      { relation: 'Counterparty', name: 'Gulf Bridge FZE' },
    ],
    ethoScore: 468,
    ethoPillars: [
      { name: 'Trust', value: 430, humanNote: 'KYC complete; two counterparties under review' },
      { name: 'Track Record', value: 510, humanNote: '4 years trading, no prior enforcement' },
      { name: 'Financial Health', value: 560, humanNote: 'Stable revenue; timing of flows atypical' },
      { name: 'ESG', value: 400, humanNote: 'No adverse media; jurisdiction risk noted' },
    ],
  },

  'INV-1021': {
    id: 'case-3',
    caseRef: 'INV-1021',
    entityName: 'Nakamura Holdings',
    caseType: 'PEP Relationship',
    jurisdiction: 'Japan / Singapore',
    exposureAmount: 1100000,
    severity: 'high',
    status: 'escalated',
    slaHours: 24,
    slaRemainingHours: 14.8,
    assignedTo: 'S. Chen',
    openedAt: new Date(Date.now() - 9 * h).toISOString(),
    riskScore: 68,
    aiSummary:
      'Nakamura Holdings is beneficially owned (32%) by a first-degree family member of a current Japanese cabinet minister — Tier 1 PEP under internal classification. Three inbound transfers totalling £1.1M from Singapore entities have no apparent commercial nexus to the entity\'s stated activities. Escalated to senior compliance review pending EDD completion.',
    signals: [
      { name: 'PEP Association', score: 82, rationale: 'UBO holds 32% equity through a family member who is a sitting Japanese cabinet minister (Tier 1 PEP). Annual enhanced review required.' },
      { name: 'Unexplained Inflows', score: 74, rationale: 'Three transfers totalling £1.1M from Singapore entities with no identifiable commercial nexus to stated activities (property management).' },
      { name: 'Source of Funds', score: 61, rationale: 'SOF documentation received for 2 of 3 transfers. Outstanding request issued 8 days ago; no response received.' },
      { name: 'Counterparty Risk', score: 44, rationale: 'One Singapore counterparty incorporated 3 months prior to transfer; no trading history identified. Possible shell vehicle.' },
    ],
    timeline: [
      { time: '15:04', day: 'Today', kind: 'escalation', title: 'Escalated to senior compliance', detail: 'Tier 1 PEP association confirmed; routed for EDD sign-off.', confidence: 82 },
      { time: '11:47', day: 'Today', kind: 'signal', title: 'Unexplained inflows', detail: '£1.1M across three Singapore transfers with no commercial nexus.', confidence: 74 },
      { time: '16:22', day: '2 days ago', kind: 'note', title: 'Source-of-funds request', detail: 'Outstanding for 8 days; 2 of 3 transfers documented.', confidence: 61 },
      { time: '09:03', day: '2 days ago', kind: 'opened', title: 'Case opened', detail: 'Auto-assigned to S. Chen under the PEP enhanced-review policy.' },
    ],
    connectedEntities: [
      { relation: 'UBO', name: 'K. Nakamura', note: 'Tier 1 PEP' },
      { relation: 'Parent', name: 'Nakamura Estate KK' },
      { relation: 'Counterparty', name: 'Lion City Ventures Pte' },
    ],
    ethoScore: 541,
    ethoPillars: [
      { name: 'Trust', value: 520, humanNote: 'PEP disclosed at onboarding; EDD in progress' },
      { name: 'Track Record', value: 610, humanNote: '7 years trading, no prior enforcement' },
      { name: 'Financial Health', value: 640, humanNote: 'Strong balance sheet; inflows unexplained' },
      { name: 'ESG', value: 470, humanNote: 'Governance transparency under review' },
    ],
  },

  'INV-1015': {
    id: 'case-4',
    caseRef: 'INV-1015',
    entityName: 'Atlas Logistics Co',
    caseType: 'Geographic Anomaly',
    jurisdiction: 'Netherlands / UAE / Nigeria',
    exposureAmount: 340000,
    severity: 'medium',
    status: 'pending_info',
    slaHours: 48,
    slaRemainingHours: 31.0,
    assignedTo: 'M. Vasquez',
    openedAt: new Date(Date.now() - 17 * h).toISOString(),
    riskScore: 51,
    aiSummary:
      'Atlas Logistics Co has initiated transfers to Nigerian counterparties, which falls outside the geographic risk profile established at onboarding (EU / UAE operations only). An information request was issued on 18 May 2026; response is pending. No sanctions or PEP matches identified at this time. Monitoring continued.',
    signals: [
      { name: 'Geographic Anomaly', score: 68, rationale: 'Transfers to Nigeria fall outside account-opening profile (EU / UAE only). Updated customer risk assessment required.' },
      { name: 'Profile Deviation', score: 62, rationale: 'Stated business is European freight logistics. Nigeria-directed payments are inconsistent with known activities.' },
      { name: 'Counterparty Risk', score: 41, rationale: 'Nigerian counterparty incorporated 6 months ago; no verifiable trade history. KYC documentation outstanding.' },
      { name: 'Velocity Anomaly', score: 29, rationale: 'Transaction frequency within normal parameters. No threshold avoidance patterns detected.' },
    ],
    timeline: [
      { time: '13:12', day: 'Today', kind: 'note', title: 'Information request sent', detail: 'Awaiting updated KYC and trade rationale for Nigeria-directed flows.' },
      { time: '10:26', day: 'Yesterday', kind: 'signal', title: 'Geographic anomaly', detail: 'Payments outside onboarding profile (EU / UAE only).', confidence: 68 },
      { time: '08:05', day: '2 days ago', kind: 'opened', title: 'Case opened', detail: 'Auto-assigned to M. Vasquez from the monitoring queue.' },
    ],
    connectedEntities: [
      { relation: 'Director', name: 'P. Okafor' },
      { relation: 'Counterparty', name: 'Lagos Freight Partners' },
    ],
    ethoScore: 612,
    ethoPillars: [
      { name: 'Trust', value: 560, humanNote: 'KYC refresh outstanding for new corridor' },
      { name: 'Track Record', value: 680, humanNote: '6 years trading, clean history' },
      { name: 'Financial Health', value: 700, humanNote: 'Healthy cash position and margins' },
      { name: 'ESG', value: 590, humanNote: 'No adverse media identified' },
    ],
  },

  'INV-1009': {
    id: 'case-5',
    caseRef: 'INV-1009',
    entityName: 'Elara Commodities',
    caseType: 'Structuring Pattern',
    jurisdiction: 'UK / Switzerland',
    exposureAmount: 520000,
    severity: 'medium',
    status: 'open',
    slaHours: 48,
    slaRemainingHours: 22.4,
    assignedTo: 'R. Okonkwo',
    openedAt: new Date(Date.now() - 26 * h).toISOString(),
    riskScore: 55,
    aiSummary:
      'Elara Commodities has made 11 transactions over 7 days, each below the £50,000 automated reporting threshold. The aggregate value is £520,000. Statistical distribution of amounts is concentrated in the £45,000–£49,900 range, inconsistent with commodity trading payment patterns. Consistent with deliberate structuring to avoid detection. Enhanced monitoring initiated.',
    signals: [
      { name: 'Structuring Pattern', score: 78, rationale: '11 transactions over 7 days, all below £50,000 threshold. Aggregate £520,000. Distribution inconsistent with legitimate trading.' },
      { name: 'Round-Sum Transactions', score: 71, rationale: '9 of 11 transactions are exact multiples of £5,000 in the £45,000–£49,900 band. Probability of random occurrence: <0.3%.' },
      { name: 'Frequency Deviation', score: 54, rationale: 'Average transaction count 220% above monthly baseline for this value band. No business justification provided.' },
      { name: 'Geographic Dispersion', score: 32, rationale: 'Counterparties are UK and Switzerland domiciled — within expected profile. No high-risk jurisdiction exposure.' },
    ],
    timeline: [
      { time: '14:48', day: 'Today', kind: 'signal', title: 'Structuring pattern', detail: '11 sub-threshold transactions over 7 days, aggregate £520K.', confidence: 78 },
      { time: '11:10', day: 'Yesterday', kind: 'signal', title: 'Round-sum flags', detail: '9 of 11 amounts are exact £5,000 multiples in the £45K–£49.9K band.', confidence: 71 },
      { time: '09:30', day: '2 days ago', kind: 'opened', title: 'Case opened', detail: 'Auto-assigned to R. Okonkwo under enhanced monitoring.' },
    ],
    connectedEntities: [
      { relation: 'Director', name: 'H. Meier' },
      { relation: 'Counterparty', name: 'Zug Metals AG' },
    ],
    ethoScore: 588,
    ethoPillars: [
      { name: 'Trust', value: 540, humanNote: 'Payment structuring lowers confidence' },
      { name: 'Track Record', value: 650, humanNote: '5 years trading, no prior enforcement' },
      { name: 'Financial Health', value: 690, humanNote: 'Solid trading revenue' },
      { name: 'ESG', value: 560, humanNote: 'No adverse media identified' },
    ],
  },
}

export function getDossier(ref: string | undefined): InvestigationDossier | null {
  if (!ref) return null
  const key = decodeURIComponent(ref).toUpperCase()
  return INVESTIGATION_DOSSIERS[key] ?? null
}

export const DOSSIER_REFS = Object.keys(INVESTIGATION_DOSSIERS)
