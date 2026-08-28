/**
 * [CHANGE TYPE]: NEW FILE (high priority)
 * [FILE]: packages/shared/constants/pageAccess.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: THE single source of per-page role access. Previously
 *   W/config/navigation.ts (NAV_ITEMS[].roles) and W/proxy.ts (PAGE_ROLES)
 *   hand-maintained the same role-per-page mapping independently — and had
 *   already drifted (proxy.ts held the R3 corrections adding 'hr' to
 *   /finances and 'student' to /reports; navigation.ts did not). Both now
 *   import PAGE_ACCESS, so a role-access change is impossible to make in one
 *   place without it appearing in the other. Canonical values are proxy.ts's
 *   R3-corrected lists (the security-reviewed set).
 *
 *   This is UX-level routing/visibility data only — real authorization is
 *   always enforced server-side via requirePermission/requireRole. See
 *   sms-erp-security.
 * [DEPENDS ON]: @shared/types/roles (UserRole)
 */
import type { UserRole } from '../types/roles'

const ALL_ROLES: readonly UserRole[] = [
  'admin', 'high_rank', 'finance', 'library', 'lower_rank',
  'academic', 'hr', 'exam_officer', 'student',
]

const ALL_STAFF: readonly UserRole[] = [
  'admin', 'high_rank', 'finance', 'library', 'lower_rank',
  'academic', 'hr', 'exam_officer',
]

/**
 * Roles ALLOWED to reach each page path. Keys are exact route paths (also the
 * NAV_ITEMS hrefs and the proxy prefix keys).
 */
export const PAGE_ACCESS: Record<string, readonly UserRole[]> = {
  '/dashboard': ALL_ROLES,
  '/students': ALL_STAFF,
  '/classes': ['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student'],
  // [PRODUCTION FIX 2026-07-31] Students previously had no dedicated place
  // to see their own attendance at all — the class detail page's
  // Attendance tab was a teacher marking tool with no student-facing mode.
  '/attendance': ['student'],
  '/exams': ['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student'],
  '/timetable': ALL_ROLES,
  '/finances': ['admin', 'high_rank', 'finance', 'student', 'hr'],
  '/library': ALL_ROLES,
  '/hr': ALL_STAFF,
  '/announcements': ALL_ROLES,
  // [PRODUCTION FIX — Issue #6] New admin gallery management page. Matches
  // gallery.ts's requireRole(['admin', 'high_rank', 'lower_rank']) exactly —
  // no approval workflow for this content type, unlike Announcements/News.
  '/gallery': ['admin', 'high_rank', 'lower_rank'],
  '/calendar': ALL_ROLES,
  '/reports': ALL_ROLES,
  '/applications': ['admin', 'high_rank', 'lower_rank'],
  '/user-management': ['admin'],
  '/settings': ALL_ROLES,
  // R18 — University Placement Module. The cohort console is viewable by every
  // role (placement.view / placement.viewAnalytics are universal; management
  // controls inside are permission-gated). The student self-service page is
  // student-only.
  '/placements': ALL_ROLES,
  '/my-placement': ['student'],
  // Monitoring — infra/error visibility, kept to the top two administrative
  // tiers only (same tier as /user-management), unlike /reports' ALL_ROLES:
  // error/outage data can incidentally reference internal identifiers or
  // stack traces not appropriate for broad staff visibility.
  '/monitoring': ['admin', 'high_rank'],
}

/**
 * Returns the roles allowed for a pathname, or null if the path has no
 * PAGE_ACCESS restriction. Exact match first, then longest-prefix match —
 * the behaviour proxy.ts's getAllowedRoles() previously implemented inline.
 */
export function getAllowedRolesForPath(pathname: string): readonly UserRole[] | null {
  const match = Object.keys(PAGE_ACCESS)
    .filter((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .sort((a, b) => b.length - a.length)[0]

  return match ? (PAGE_ACCESS[match] ?? null) : null
}