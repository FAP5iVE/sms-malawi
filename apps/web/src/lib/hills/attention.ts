/**
 * apps/web/src/lib/hills/attention.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 8b-0: foundations)
 * [PURPOSE]: The rules behind attention badges (RULEBOOK section 6), apart from
 *   React so the plain node test runner can check them
 *   (tools/hills/__tests__/attention.test.mts).
 *
 *   A badge says "something here needs you". It is drawn only from a number the
 *   page ALREADY loads. If no such number exists the section shows no badge: a
 *   wrong badge is worse than none (R6.3). No query is added by this file.
 *
 * Nothing here fetches, reads a store or changes what a page loads.
 */

/** Largest number shown as is; anything above reads "99+" (R6.2). */
export const BADGE_MAX = 99

/**
 * More than this many badges on one screen means: stop and reconsider (R6.4).
 * The map below is tested against it.
 */
export const BADGE_BUDGET_PER_SCREEN = 3

export interface BadgePlan {
  show: boolean
  /** Text inside the badge ("5", "99+"); empty when hidden. */
  text: string
  /** Full sentence for screen readers, e.g. "5 waiting for your review". */
  label: string
}

const HIDDEN: BadgePlan = { show: false, text: '', label: '' }

/** A usable count is a finite whole number above zero. Anything else shows nothing. */
export function isUsableCount(count: unknown): count is number {
  return typeof count === 'number' && Number.isFinite(count) && Number.isInteger(count) && count > 0
}

/** "7" up to 99, then "99+". */
export function formatBadgeCount(count: number): string {
  return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count)
}

/**
 * Plan for a count badge. `noun` finishes the sentence: "waiting for your review",
 * "unread". NaN, negatives, zero, decimals, null and undefined all hide the badge.
 */
export function countBadgePlan(count: unknown, noun: string): BadgePlan {
  if (!isUsableCount(count)) return HIDDEN
  const spoken = count > BADGE_MAX ? `More than ${BADGE_MAX}` : String(count)
  return { show: true, text: formatBadgeCount(count), label: `${spoken} ${noun}`.trim() }
}

/** Plan for a dot (something needs you but the number would not change what you do). */
export function dotBadgePlan(on: unknown, noun: string): BadgePlan {
  if (on !== true) return HIDDEN
  return { show: true, text: '', label: noun.trim() }
}

// ─────────────────────────────────────────────────────────────────────────────
// WHICH MODULE MAY SHOW WHICH COUNT (R6.6)
// ─────────────────────────────────────────────────────────────────────────────

export type BadgeSurface = 'sidebar' | 'bottom-bar' | 'header' | 'tab'

export interface AttentionSource {
  /** Plain words for the screen reader sentence. */
  noun: string
  /** Where the number is drawn. */
  surfaces: readonly BadgeSurface[]
  /**
   * 'loaded'      the page or the shell already fetches this number.
   * 'needs-query' it would need a new request. NOT ALLOWED to draw (R6.3);
   *               listed so the owner can decide later.
   */
  status: 'loaded' | 'needs-query'
  /** Where the number comes from today (file or hook), so nobody has to hunt. */
  source: string
}

/**
 * Counts that are attention counts (they change what the person does next).
 * Keys are stable ids used by AttentionBadge callers. The file in `source` is
 * where the number already lives; nothing here adds a request.
 */
export const ATTENTION_SOURCES = {
  approvalsAwaitingMe: {
    noun: 'waiting for your review',
    surfaces: ['sidebar', 'bottom-bar', 'tab'],
    status: 'loaded',
    source: 'hooks/useApprovals.ts useApprovalBadge().awaitingMyReview (already drives the nav badge)',
  },
  notificationsUnread: {
    noun: 'unread notifications',
    surfaces: ['header'],
    status: 'loaded',
    source: 'hooks/useNotificationFeed.ts (the header bell already shows it)',
  },
  hrLeavePending: {
    noun: 'leave requests waiting',
    surfaces: ['tab'],
    status: 'loaded',
    source: 'app/(auth)/hr/page.tsx pendingLeave',
  },
  hrContractsExpiring: {
    noun: 'contracts expiring soon',
    surfaces: ['tab'],
    status: 'loaded',
    source: 'app/(auth)/hr/page.tsx expiringContracts',
  },
  placementsToVerify: {
    noun: 'claims to verify',
    surfaces: ['tab'],
    status: 'loaded',
    source: 'app/(auth)/placements/page.tsx pendingCount',
  },
  announcementsAwaitingApproval: {
    noun: 'announcements waiting for approval',
    surfaces: ['tab'],
    status: 'loaded',
    source: 'app/(auth)/announcements/page.tsx pendingCount',
  },
  monitoringUnresolved: {
    noun: 'unresolved problems',
    surfaces: ['tab'],
    status: 'loaded',
    source: 'app/(auth)/monitoring/page.tsx summary.unresolvedIssues',
  },
  studentAssignmentsDue: {
    noun: 'assignments still to do',
    surfaces: ['tab'],
    status: 'loaded',
    source: 'app/(auth)/classes/[id]/page.tsx countOutstanding (students only)',
  },
  /* Candidates that would need a NEW request at shell level. Not drawn. */
  feesUnpaid: {
    noun: 'unpaid fees',
    surfaces: ['sidebar', 'bottom-bar'],
    status: 'needs-query',
    source: 'none at shell level (Finances loads it only inside its own page)',
  },
  libraryOverdue: {
    noun: 'overdue books',
    surfaces: ['sidebar', 'bottom-bar'],
    status: 'needs-query',
    source: 'none at shell level (Library loads it only inside its own page)',
  },
  attendanceNotMarked: {
    noun: 'classes not marked today',
    surfaces: ['sidebar', 'bottom-bar'],
    status: 'needs-query',
    source: 'none at shell level',
  },
} as const satisfies Record<string, AttentionSource>

export type AttentionKey = keyof typeof ATTENTION_SOURCES

/** True only for a source whose number is already loaded. */
export function mayShowBadge(key: AttentionKey): boolean {
  return ATTENTION_SOURCES[key].status === 'loaded'
}

/** Sentence noun for a key. */
export function attentionNoun(key: AttentionKey): string {
  return ATTENTION_SOURCES[key].noun
}

/**
 * Tab badges that exist today but are TOTALS, not things waiting for the person
 * (R6.2: a number only when it changes what the user does next). Each page's
 * batch (8b-1 to 8b-3) drops the number; the tab keeps its label. Recorded here
 * so the sweep is not forgotten. `unsure` means the page was not read in 8b-0.
 */
export const INFORMATIONAL_TAB_COUNTS: ReadonlyArray<{
  file: string
  tab: string
  reason: string
  unsure?: boolean
}> = [
  { file: 'app/(auth)/library/page.tsx', tab: 'Fines & Penalties Ledger', reason: 'total number of fines, a list size' },
  { file: 'app/(auth)/library/page.tsx', tab: 'Catalog Distribution', reason: 'number of categories, a list size' },
  { file: 'app/(auth)/library/page.tsx', tab: 'Active Borrowings', reason: 'total loans, a list size' },
  { file: 'app/(auth)/library/page.tsx', tab: 'Fine waivers', reason: 'may be requests waiting for review; check in 8b-2', unsure: true },
  { file: 'app/(auth)/announcements/page.tsx', tab: 'Published', reason: 'total published, a list size' },
  { file: 'app/(auth)/announcements/page.tsx', tab: 'Drafts', reason: 'own drafts, a list size' },
  { file: 'app/(auth)/classes/[id]/page.tsx', tab: 'Assignments (staff)', reason: 'total assignments for staff; only the student count is attention' },
  { file: 'components/classes/assignments/AssignmentDetailModal.tsx', tab: 'Class list', reason: 'total students, a list size' },
  { file: 'components/approvals/ApprovalsCenter.tsx', tab: 'Approved, Rejected, Cancelled, Expired', reason: 'the number is typed into the label, e.g. "Approved (12)"; a total, not a request waiting. Only Pending is attention' },
]
