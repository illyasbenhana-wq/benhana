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
 *
 * Sidebar is light, matching the rest of the "Ramp" body — reverted from
 * an earlier dark-navy sidebar decision. Colors are drawn straight from
 * tokens-light.ts so the sidebar reads as the same surface as page content,
 * not as separate chrome.
 */
import { color as C } from './tokens-light'

export const sidebar = {
  background: C.background,
  surfaceHover: C.accentSubtle,
  surfaceActive: C.accentSubtle,
  border: C.border,
  textPrimary: C.textPrimary,
  textSecondary: C.textSecondary,
  textMuted: C.textMuted,
  accent: C.accent,
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
