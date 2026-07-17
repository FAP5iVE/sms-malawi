/**
 * [CHANGE TYPE]: MAJOR REWRITE
 * [FILE]: apps/web/src/config/navigation.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Per-page role lists are no longer hand-maintained here. Each
 *   NavItem's `roles` is now sourced from the single shared PAGE_ACCESS map
 *   (@shared/constants/pageAccess) that proxy.ts also consumes, so the two
 *   can never drift apart (they had: proxy.ts held the R3 corrections adding
 *   'hr' to /finances and 'student' to /reports; this file previously did
 *   not — that drift is now structurally impossible). rolesFor() fails loudly
 *   if a nav href has no PAGE_ACCESS entry, rather than silently rendering an
 *   item with empty roles. Everything else (structure, icons, mobileLabel,
 *   badges, ordering, doc comments) is unchanged.
 *
 * Single source of truth for the authenticated shell navigation.
 *
 * Both Sidebar.tsx and MobileBottomNav.tsx consume this config — adding a new
 * page requires exactly ONE entry here (plus its PAGE_ACCESS entry), nowhere
 * else.
 *
 * Architecture:
 *   • Pure data module — no React, no hooks, no side effects.
 *   • NavItem defines structure; role/permission filtering happens in
 *     useNavigation().
 *   • Badge keys are resolved to live counts inside useNavigation().
 *   • mobileLabel is constrained to ≤9 chars — the mobile bottom nav tab uses
 *     text-[10px], so longer strings truncate visually.
 *
 * [DEPENDS ON]: @shared/constants/pageAccess (PAGE_ACCESS)
 */

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  BookOpen,
  GraduationCap,
  Clock,
  Banknote,
  Library,
  UserCog,
  Bell,
  CalendarDays,
  BarChart2,
  Award,
  ClipboardList,
  ShieldCheck,
  Settings,
} from 'lucide-react'

import type { UserRole }   from '@shared/types/roles'
import type { Permission } from '@shared/types/permissions'
import { PAGE_ACCESS }     from '@shared/constants/pageAccess'

/**
 * Resolves the shared PAGE_ACCESS role list for a nav href. Throws if the
 * href has no PAGE_ACCESS entry — a missing entry is a configuration bug, not
 * a silently-empty nav item.
 */
function rolesFor(href: string): readonly UserRole[] {
  const roles = PAGE_ACCESS[href]
  if (!roles) {
    throw new Error(`navigation.ts: no PAGE_ACCESS entry for nav href "${href}"`)
  }
  return roles
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE KEYS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Named sources for numeric badge counts on navigation items.
 *
 * 'pendingActions'      — PENDING approval count from /pending-actions/counts.
 * 'unreadNotifications' — Unread Firestore notification document count.
 */
export type NavBadgeKey = 'pendingActions' | 'unreadNotifications'

// ─────────────────────────────────────────────────────────────────────────────
// NAV ITEM TYPE
// ─────────────────────────────────────────────────────────────────────────────

export interface NavItem {
  /** Full label displayed in the expanded sidebar and the mobile "More" sheet. */
  readonly label: string

  /** Shortened label for the mobile bottom nav tab bar (≤9 characters). */
  readonly mobileLabel: string

  /**
   * Route pathname. Must exactly match a key in PAGE_ACCESS so sidebar active
   * state and route protection stay in sync.
   */
  readonly href: string

  /** Lucide icon component rendered at 16px in the sidebar, 20px in mobile nav. */
  readonly icon: LucideIcon

  /**
   * Roles that can see this navigation item — sourced from the shared
   * PAGE_ACCESS map, never hand-listed here. Filtering is applied inside
   * useNavigation().
   */
  readonly roles: readonly UserRole[]

  /**
   * Optional fine-grained permission gate beyond role membership.
   * If set, the item is hidden unless can(permission) returns true.
   */
  readonly permission?: Permission

  /**
   * If set, a numeric badge is rendered on this nav item. The count is
   * resolved by useNavigation(). A count of 0 or undefined suppresses it.
   */
  readonly badge?: NavBadgeKey
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION ITEMS — ordered by sidebar priority (top → bottom)
// ─────────────────────────────────────────────────────────────────────────────

export const NAV_ITEMS: readonly NavItem[] = [
  // ── Universal ─────────────────────────────────────────────────────────────
  {
    label:       'Dashboard',
    mobileLabel: 'Home',
    href:        '/dashboard',
    icon:        LayoutDashboard,
    roles:       rolesFor('/dashboard'),
  },

  // ── Academic / Student Operations ─────────────────────────────────────────
  {
    label:       'Students',
    mobileLabel: 'Students',
    href:        '/students',
    icon:        Users,
    roles:       rolesFor('/students'),
  },
  {
    label:       'Classes',
    mobileLabel: 'Classes',
    href:        '/classes',
    icon:        BookOpen,
    roles:       rolesFor('/classes'),
  },
  {
    label:       'Exams',
    mobileLabel: 'Exams',
    href:        '/exams',
    icon:        GraduationCap,
    roles:       rolesFor('/exams'),
  },
  {
    label:       'Timetable',
    mobileLabel: 'Timetable',
    href:        '/timetable',
    icon:        Clock,
    roles:       rolesFor('/timetable'),
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  {
    label:       'Finances',
    mobileLabel: 'Finance',
    href:        '/finances',
    icon:        Banknote,
    roles:       rolesFor('/finances'),
  },

  // ── Library ───────────────────────────────────────────────────────────────
  {
    label:       'Library',
    mobileLabel: 'Library',
    href:        '/library',
    icon:        Library,
    roles:       rolesFor('/library'),
  },

  // ── HR ────────────────────────────────────────────────────────────────────
  {
    label:       'HR',
    mobileLabel: 'HR',
    href:        '/hr',
    icon:        UserCog,
    roles:       rolesFor('/hr'),
  },

  // ── Communications ────────────────────────────────────────────────────────
  {
    label:       'Announcements',
    mobileLabel: 'Notices',
    href:        '/announcements',
    icon:        Bell,
    roles:       rolesFor('/announcements'),
    badge:       'unreadNotifications',
  },
  {
    label:       'Calendar',
    mobileLabel: 'Calendar',
    href:        '/calendar',
    icon:        CalendarDays,
    roles:       rolesFor('/calendar'),
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  {
    label:       'Reports',
    mobileLabel: 'Reports',
    href:        '/reports',
    icon:        BarChart2,
    roles:       rolesFor('/reports'),
  },
  {
    label:       'Placements',
    mobileLabel: 'Placement',
    href:        '/placements',
    icon:        Award,
    roles:       rolesFor('/placements'),
    permission:  'placement.view',
  },
  {
    label:       'My Placement',
    mobileLabel: 'MyPlace',
    href:        '/my-placement',
    icon:        Award,
    roles:       rolesFor('/my-placement'),
    permission:  'placement.viewOwn',
  },

  // ── Administration ────────────────────────────────────────────────────────
  {
    label:       'Applications',
    mobileLabel: 'Apply',
    href:        '/applications',
    icon:        ClipboardList,
    roles:       rolesFor('/applications'),
  },
  {
    label:       'User Mgmt',
    mobileLabel: 'Users',
    href:        '/user-management',
    icon:        ShieldCheck,
    roles:       rolesFor('/user-management'),
    badge:       'pendingActions',
  },
  {
    label:       'Settings',
    mobileLabel: 'Settings',
    href:        '/settings',
    icon:        Settings,
    roles:       rolesFor('/settings'),
  },
]
