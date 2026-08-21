/**
 * EthosFi sidebar navigation taxonomy.
 *
 * Structure (grouping/collapse UX) is ported from the Fortress template's
 * sidebar. Labels and routes are entirely EthosFi's own — no Fortress
 * financial/trading terms (Fixed Income, FX Trading, Derivatives, Order
 * Management, Treasury, Market Data, Attribution) appear here, per the
 * approved mapping table. Fortress "Research" has no EthosFi equivalent
 * and was discarded rather than kept as an unused stub.
 */

// /score and /case are dynamic routes ([id] / [ref]) with no bare index
// page — linking to the bare path 404s. Every item that lands on either
// must carry a real demo id/ref (score: DEMO_VIEW's fixed id via the
// preview-only fallback in app/score/[id]/page.tsx; case: a key from
// INVESTIGATION_DOSSIERS in lib/investigation-demo.ts) — never the bare
// route. Investigations/Counterparty point at different case refs
// (INV-1047 / INV-1038) so they're not literal duplicates of each other.

export type NavItem = {
  label: string
  href: string
  badgeKey?: 'activeCases' // resolved to a live count by the shell, not hardcoded
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
    ],
  },
  {
    label: 'Cases',
    items: [
      { label: 'Case Queue', href: '/dashboard', badgeKey: 'activeCases' },
    ],
  },
  {
    label: 'Risk & Compliance',
    items: [
      { label: 'EthoScore / Risk View', href: '/score/a1000000-0000-0000-0000-000000000001' },
      { label: 'Investigations', href: '/case/INV-1047' },
      { label: 'Counterparty', href: '/case/INV-1038' },
    ],
  },
  {
    label: 'Portfolio',
    items: [
      { label: 'Lender Book', href: '/lender/dashboard' },
      { label: 'Client Reports', href: '/score/a1000000-0000-0000-0000-000000000001' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Applicant Intake', href: '/apply' },
      { label: 'Model Validation', href: '/backtest' },
    ],
  },
]
