'use client'

/**
 * 
 *
 * Provides role-filtered, badge-resolved navigation items for every
 * navigation surface in the authenticated shell: Sidebar, MobileBottomNav,
 * and the "More" sheet overlay.
 *
 * Responsibilities:
 *   1. Filter NAV_ITEMS by the current user's role (reads from authStore).
 *   2. Apply optional per-item permission gate (reads from usePermissions).
 *   3. Resolve badge keys to live numeric counts (TanStack Query / Firestore).
 *   4. Compute active state from the current pathname.
 *   5. Split items into primaryItems (bottom nav) and moreItems (More sheet).
 *
 * Consumers:
 *   Sidebar.tsx          — renders `items` in a vertical list
 *   MobileBottomNav.tsx  — renders `primaryItems` as tab icons + moreItems in sheet
 *
 * Badge data sources:
 *   'pendingActions'      — /pending-actions/counts endpoint (admin + high_rank only)
 *   'unreadNotifications' — Firestore notifications/{uid}/items count (Phase C)
 *
 * Mobile bottom nav slot allocation:
 *   primaryItems = [Dashboard, ...first 3 non-Dashboard role-filtered items]
 *   moreItems    = all remaining role-filtered items
 *   The MobileBottomNav component adds a hardcoded "More" ellipsis as slot 5.
 *
 * Phase B10 — extracted from inline Sidebar.tsx NAV_ITEMS array.
 */

import { useMemo }             from 'react'
import { usePathname }         from 'next/navigation'
import { useAuthStore }        from '@/store/authStore'
import { usePermissions }      from '@/hooks/usePermissions'
import { usePendingActionCounts } from '@/hooks/usePendingActions'
import { NAV_ITEMS }           from '@/config/navigation'
import type { NavItem, NavBadgeKey } from '@/config/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// RETURN TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A NavItem after role filtering, with active state and badge count resolved
 * to their current live values.
 */
export interface NavItemResolved extends NavItem {
  /** True when the current pathname matches this item's href (exact or prefix). */
  active: boolean
  /**
   * Resolved numeric badge count.
   * undefined means no badge should be displayed (either no badge key, count is 0,
   * or the data source has not yet loaded).
   */
  badgeCount: number | undefined
}

export interface UseNavigationReturn {
  /**
   * All role-filtered items with active state and badge counts resolved.
   * Ordered by NAV_ITEMS declaration order.
   * Used by Sidebar.tsx for full vertical list rendering.
   */
  items: NavItemResolved[]

  /**
   * Primary items for the mobile bottom nav (5-slot tab bar).
   * Always contains [Dashboard] + next 3 role-visible items after Dashboard = 4 items.
   * The MobileBottomNav component appends the hardcoded "More" slot as item 5.
   *
   * If fewer than 4 items are visible (edge case for very restricted roles),
   * all visible items are primary and moreItems is empty.
   */
  primaryItems: NavItemResolved[]

  /**
   * Overflow items for the mobile "More" full-screen sheet.
   * All role-filtered items NOT in primaryItems, in NAV_ITEMS order.
   * Empty when the role has ≤4 total visible items.
   */
  moreItems: NavItemResolved[]

  /**
   * True when auth has initialised and items have been computed.
   * Use to defer rendering navigation skeletons.
   */
  ready: boolean

  /** Returns true if the given href matches the current pathname (exact or prefix). */
  isActive: (href: string) => boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

export function useNavigation(): UseNavigationReturn {
  const pathname                   = usePathname()
  const { role, initialized }      = useAuthStore()
  const { can }                    = usePermissions()

  // Pending actions count — only fetched for admin and high_rank.
  // usePendingActionCounts() has its own `enabled` guard for other roles.
  const { data: pendingCounts } = usePendingActionCounts()

  // ── isActive ──────────────────────────────────────────────────────────────
  // Stable function reference — not memoized because it's recreated on every
  // render anyway via closure. Callers that need a stable ref should wrap in
  // useCallback with [pathname] dep.
  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  // ── Badge count resolver ──────────────────────────────────────────────────
  // Returns undefined (suppress badge) instead of 0 to avoid rendering "0"
  // badges which are confusing and noisy in a navigation context.
  function resolveBadgeCount(key: NavBadgeKey | undefined): number | undefined {
    if (!key) return undefined

    switch (key) {
      case 'pendingActions': {
        const count = pendingCounts?.pending
        return count !== undefined && count > 0 ? count : undefined
      }
      case 'unreadNotifications': {
        // Wired to Firestore in Phase C when the real-time notification feed is built.
        // Returns undefined (no badge) until then.
        return undefined
      }
    }
  }

  // ── Role + permission filtered items with resolved state ──────────────────
  const items: NavItemResolved[] = useMemo(() => {
    if (!role || !initialized) return []

    return (NAV_ITEMS as readonly NavItem[])
      .filter((item) => {
        // Primary gate — role must be in the item's allowed roles list
        if (!(item.roles as readonly string[]).includes(role)) return false
        // Secondary gate — optional fine-grained permission check
        // Only applied when the item declares a required permission.
        // Most items don't use this; it's reserved for edge-case access control.
        if (item.permission !== undefined && !can(item.permission)) return false
        return true
      })
      .map((item): NavItemResolved => ({
        ...item,
        active:     isActive(item.href),
        badgeCount: resolveBadgeCount(item.badge),
      }))
    // isActive and resolveBadgeCount are intentionally excluded from deps —
    // they are pure functions that close over `pathname` and `pendingCounts`
    // which ARE listed as deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, initialized, pathname, pendingCounts, can])

  // ── Primary / overflow split ──────────────────────────────────────────────
  // The mobile bottom nav has 5 slots:
  //   Slot 1:   Dashboard (pinned)
  //   Slots 2–4: First 3 role-visible items after Dashboard
  //   Slot 5:   "More" (hardcoded by MobileBottomNav — not in this array)
  const { primaryItems, moreItems } = useMemo<{
    primaryItems: NavItemResolved[]
    moreItems:    NavItemResolved[]
  }>(() => {
    if (items.length === 0) {
      return { primaryItems: [], moreItems: [] }
    }

    // Locate Dashboard in the filtered list (guaranteed visible for all roles)
    const dashIdx = items.findIndex((item) => item.href === '/dashboard')

    if (dashIdx === -1) {
      // Defensive fallback: if Dashboard isn't visible (shouldn't happen),
      // treat the first 4 items as primary.
      return {
        primaryItems: items.slice(0, 4),
        moreItems:    items.slice(4),
      }
    }

    const dashboard   = items[dashIdx]!
    // All items except Dashboard, in their original order
    const withoutDash = items.filter((_, idx) => idx !== dashIdx)

    // Primary: Dashboard + first 3 of the remaining items = 4 total
    const primary  = [dashboard, ...withoutDash.slice(0, 3)]
    const overflow = withoutDash.slice(3)

    return { primaryItems: primary, moreItems: overflow }
  }, [items])

  return {
    items,
    primaryItems,
    moreItems,
    ready:    initialized && role !== null,
    isActive,
  }
}
