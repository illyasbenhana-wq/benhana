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
      { label: 'EthoScore / Risk View', href: '/score' },
      { label: 'Investigations', href: '/case' },
      { label: 'Counterparty', href: '/case' },
    ],
  },
  {
    label: 'Portfolio',
    items: [
      { label: 'Lender Book', href: '/lender/dashboard' },
      { label: 'Client Reports', href: '/score' },
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
