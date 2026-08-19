/**
 * EthosFi Design System — Fortress Shell Tokens
 * ------------------------------------------------------------------
 * Additive tokens for the persistent sidebar shell + KPI-row pattern
 * ported (visually, not architecturally) from the Fortress dashboard
 * template. These extend, and do not modify, tokens-light.ts — every
 * existing screen that imports tokens-light (case, score, intelligence)
 * is untouched by this file.
 *
 * Ported concepts only: sidebar chrome color, KPI-tile treatment, nav
 * grouping/collapse pattern. No Fortress business language — see
 * lib/design-system/nav-groups.ts for the EthosFi-only nav taxonomy.
 */
import { color as C } from './tokens-light'

export const sidebar = {
  background: '#0F172A', // deliberately dark, breaks from the light "Ramp" body to read as persistent chrome
  surfaceHover: 'rgba(255,255,255,0.06)',
  surfaceActive: 'rgba(29,78,216,0.22)', // tinted with C.accent
  border: 'rgba(255,255,255,0.08)',
  textPrimary: '#E2E8F0',
  textSecondary: 'rgba(226,232,240,0.55)',
  textMuted: 'rgba(226,232,240,0.35)',
  accent: '#60A5FA', // lighter accent for contrast against the dark sidebar
} as const

export const kpiTile = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
} as const

export const shellLayout = {
  sidebarWidth: 240,
  sidebarWidthCollapsed: 64,
  headerHeight: 64,
} as const
