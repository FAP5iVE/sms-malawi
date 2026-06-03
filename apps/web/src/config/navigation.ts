/**
 * 
 *
 * Single source of truth for the authenticated shell navigation.
 *
 * Both Sidebar.tsx and MobileBottomNav.tsx (Phase C1) consume this config —
 * adding a new page requires exactly ONE entry here, nowhere else.
 *
 * Architecture:
 *   • Pure data module — no React, no hooks, no side effects.
 *     Safe to import in Server Components, hooks, and client components.
 *   • NavItem defines structure; role/permission filtering happens in useNavigation().
 *   • Badge keys are resolved to live counts inside useNavigation() so this
 *     file stays static and testable without TanStack Query overhead.
 *   • mobileLabel is constrained to ≤9 chars — the 60 px mobile bottom nav
 *     tab uses text-[10px], so longer strings truncate visually.
 *
 * Mobile bottom nav slot allocation (built by useNavigation):
 *   Slot 1 — Dashboard (always)
 *   Slots 2–4 — First 3 role-filtered items after Dashboard (by NAV_ITEMS order)
 *   Slot 5 — "More" ellipsis → opens full-item sheet overlay
 *
 * Ordering rationale:
 *   Items appear top-to-bottom in the sidebar and left-to-right in the bottom
 *   nav primary slots. Most-important items for the majority of roles are placed
 *   earlier in the array so they naturally land in the primary bottom nav slots.
 *
 * Phase B10 — extracted from Sidebar.tsx. Extended with:
 *   • mobileLabel field for bottom nav
 *   • permission optional gate (fine-grained beyond role)
 *   • badge optional key for live numeric counts
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
  ClipboardList,
  ShieldCheck,
  Settings,
} from 'lucide-react'

import type { UserRole }   from '@shared/types/roles'
import type { Permission } from '@shared/types/permissions'

// ─────────────────────────────────────────────────────────────────────────────
// BADGE KEYS
// Each key maps to a live data source resolved inside useNavigation().
// A count of 0 hides the badge — undefined means the key has no data yet.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Named sources for numeric badge counts on navigation items.
 *
 * 'pendingActions'      — PENDING approval count from /pending-actions/counts.
 *                         Shown on User Management for admin and high_rank.
 * 'unreadNotifications' — Unread Firestore notification document count.
 *                         Wired to Firestore in Phase C (notification bell).
 *                         Returns undefined (no badge) until then.
 */
export type NavBadgeKey = 'pendingActions' | 'unreadNotifications'

// ─────────────────────────────────────────────────────────────────────────────
// NAV ITEM TYPE
// ─────────────────────────────────────────────────────────────────────────────

export interface NavItem {
  /**
   * Full label displayed in the expanded sidebar and the mobile "More" sheet.
   * No length constraint — truncation is handled via CSS.
   */
  readonly label: string

  /**
   * Shortened label for the mobile bottom nav tab bar (≤9 characters recommended).
   * Displayed at text-[10px] under the 20px icon.
   * Example: 'User Management' → 'Users', 'Announcements' → 'Notices'
   */
  readonly mobileLabel: string

  /**
   * Route pathname.
   * Must exactly match the keys used in proxy.ts PAGE_ROLES so that sidebar
   * active state and route protection remain in sync.
   */
  readonly href: string

  /** Lucide icon component rendered at 16px in the sidebar, 20px in mobile nav. */
  readonly icon: LucideIcon

  /**
   * Roles that can see this navigation item.
   * Filtering is applied inside useNavigation() — not in this config file.
   * Mirrors the access lists in proxy.ts PAGE_ROLES.
   */
  readonly roles: readonly UserRole[]

  /**
   * Optional fine-grained permission gate beyond role membership.
   * If set, the item is hidden unless can(permission) returns true.
   * Use sparingly — most access control is handled by role alone.
   *
   * Example: a "Run Payroll" shortcut only visible to roles that hold
   * the 'finance.runPayroll' permission, even within the finance role.
   */
  readonly permission?: Permission

  /**
   * If set, a numeric badge is rendered on this nav item.
   * The count is resolved by useNavigation() from live query/Firestore data.
   * A count of 0 or undefined suppresses the badge entirely.
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
    roles: [
      'admin', 'high_rank', 'finance', 'library',
      'lower_rank', 'academic', 'hr', 'exam_officer', 'student',
    ],
  },

  // ── Academic / Student Operations ─────────────────────────────────────────
  // Placed early → lands in primary mobile nav slots for most staff/student roles.

  {
    label:       'Students',
    mobileLabel: 'Students',
    href:        '/students',
    icon:        Users,
    roles: [
      'admin', 'high_rank', 'finance', 'library',
      'lower_rank', 'academic', 'hr', 'exam_officer',
    ],
  },
  {
    label:       'Classes',
    mobileLabel: 'Classes',
    href:        '/classes',
    icon:        BookOpen,
    roles: ['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student'],
  },
  {
    label:       'Exams',
    mobileLabel: 'Exams',
    href:        '/exams',
    icon:        GraduationCap,
    roles: ['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student'],
  },
  {
    label:       'Timetable',
    mobileLabel: 'Timetable',
    href:        '/timetable',
    icon:        Clock,
    roles: [
      'admin', 'high_rank', 'lower_rank',
      'academic', 'exam_officer', 'student',
    ],
  },

  // ── Finance ───────────────────────────────────────────────────────────────

  {
    label:       'Finances',
    mobileLabel: 'Finance',
    href:        '/finances',
    icon:        Banknote,
    roles: ['admin', 'high_rank', 'finance', 'student'],
  },

  // ── Library ───────────────────────────────────────────────────────────────

  {
    label:       'Library',
    mobileLabel: 'Library',
    href:        '/library',
    icon:        Library,
    roles: [
      'admin', 'high_rank', 'finance', 'library',
      'lower_rank', 'academic', 'student', 'exam_officer',
    ],
  },

  // ── HR ────────────────────────────────────────────────────────────────────

  {
    label:       'HR',
    mobileLabel: 'HR',
    href:        '/hr',
    icon:        UserCog,
    roles: [
      'admin', 'high_rank', 'finance', 'library',
      'lower_rank', 'academic', 'hr', 'exam_officer',
    ],
  },

  // ── Communications ────────────────────────────────────────────────────────

  {
    label:       'Announcements',
    mobileLabel: 'Notices',
    href:        '/announcements',
    icon:        Bell,
    roles: [
      'admin', 'high_rank', 'finance', 'library',
      'lower_rank', 'academic', 'hr', 'exam_officer', 'student',
    ],
    // Badge wired to Firestore unread count in Phase C (notification bell phase)
    badge: 'unreadNotifications',
  },
  {
    label:       'Calendar',
    mobileLabel: 'Calendar',
    href:        '/calendar',
    icon:        CalendarDays,
    roles: [
      'admin', 'high_rank', 'finance', 'library',
      'lower_rank', 'academic', 'hr', 'exam_officer', 'student',
    ],
  },

  // ── Analytics ─────────────────────────────────────────────────────────────

  {
    label:       'Reports',
    mobileLabel: 'Reports',
    href:        '/reports',
    icon:        BarChart2,
    roles: [
      'admin', 'high_rank', 'finance', 'library',
      'lower_rank', 'academic', 'hr', 'exam_officer',
    ],
  },

  // ── Administration ────────────────────────────────────────────────────────

  {
    label:       'Applications',
    mobileLabel: 'Apply',
    href:        '/applications',
    icon:        ClipboardList,
    roles: ['admin', 'high_rank', 'lower_rank'],
  },
  {
    label:       'User Mgmt',
    mobileLabel: 'Users',
    href:        '/user-management',
    icon:        ShieldCheck,
    roles:       ['admin'],
    // Shows count of pending approval requests waiting for admin action
    badge:       'pendingActions',
  },
  {
    label:       'Settings',
    mobileLabel: 'Settings',
    href:        '/settings',
    icon:        Settings,
    roles: [
      'admin', 'high_rank', 'finance', 'library',
      'lower_rank', 'academic', 'hr', 'exam_officer', 'student',
    ],
  },
] as const
