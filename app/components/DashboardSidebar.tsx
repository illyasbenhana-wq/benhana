'use client'
/**
 * EthosFi persistent sidebar — grouping/collapse UX ported from the
 * Fortress template's sidebar.tsx (collapsible nav groups, active-state
 * highlighting, user footer). Content is entirely EthosFi's own; see
 * lib/design-system/nav-groups.ts for the taxonomy and the approved
 * Fortress mapping table for what was kept vs. discarded.
 */
import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navGroups } from '../../lib/design-system/nav-groups'
import { sidebar as S, shellLayout } from '../../lib/design-system/fortress-shell-tokens'
import { fontFamily as F, fontSize as FS, fontWeight as FW } from '../../lib/design-system/tokens-light'

function NavGroupBlock({
  label,
  items,
  isActive,
  activeCaseCount,
}: {
  label: string
  items: { label: string; href: string; badgeKey?: 'activeCases' }[]
  isActive: (href: string) => boolean
  activeCaseCount: number
}) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ marginBottom: 4 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', width: '100%', background: 'none', border: 'none',
          cursor: 'pointer', padding: '6px 12px', color: S.textMuted, fontFamily: F.sans,
          fontSize: 10, fontWeight: FW.semibold, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease', fontSize: 9 }}>▶</span>
      </button>
      {open && (
        <div style={{ marginTop: 2 }}>
          {items.map(item => {
            const active = isActive(item.href)
            const badge = item.badgeKey === 'activeCases' ? activeCaseCount : undefined
            return (
              <Link
                key={item.label}
                href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8,
                  margin: '0 8px 2px', textDecoration: 'none', fontFamily: F.sans, fontSize: FS.sm,
                  fontWeight: FW.medium, color: active ? '#FFFFFF' : S.textSecondary,
                  background: active ? S.surfaceActive : 'transparent',
                }}
              >
                <span style={{ flex: 1 }}>{item.label}</span>
                {badge !== undefined && badge > 0 && (
                  <span style={{
                    minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'rgba(255,255,255,0.12)',
                    color: S.textPrimary, fontSize: 10, fontWeight: FW.semibold, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{badge}</span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function DashboardSidebar({
  activeCaseCount = 0,
  roleLabel = 'Analyst',
}: {
  activeCaseCount?: number
  roleLabel?: string
}) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <aside style={{
      width: shellLayout.sidebarWidth, flexShrink: 0, height: '100vh', background: S.background,
      borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ height: shellLayout.headerHeight, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: `1px solid ${S.border}`, flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: S.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans, fontSize: 13, fontWeight: FW.bold, color: '#0F172A' }}>E</div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontFamily: F.sans, fontSize: FS.sm, fontWeight: FW.bold, color: S.textPrimary }}>EthosFi</span>
          <span style={{ fontFamily: F.sans, fontSize: 9, fontWeight: FW.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted }}>Risk Intelligence</span>
        </div>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {navGroups.map(group => (
          <NavGroupBlock key={group.label} label={group.label} items={group.items} isActive={isActive} activeCaseCount={activeCaseCount} />
        ))}
      </nav>

      <div style={{ borderTop: `1px solid ${S.border}`, padding: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: S.surfaceActive, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.sans, fontSize: 11, fontWeight: FW.bold, color: S.textPrimary }}>
            {roleLabel.slice(0, 2).toUpperCase()}
          </div>
          <span style={{ fontFamily: F.sans, fontSize: FS.sm, color: S.textSecondary }}>{roleLabel}</span>
        </div>
      </div>
    </aside>
  )
}
