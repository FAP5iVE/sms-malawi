/**
 * Pure class-performance selection for the executive view (no database access,
 * unit-tested).
 *
 * The data contract it relies on: `passRate` / `average` are `null` when a
 * class has no computed term results, and a number — including a genuine 0 —
 * when it has. A class with results where nobody passed is a real 0%, and is
 * exactly the class leadership most needs to see; a class with no results is
 * "not yet computed" and must never be reported as failing.
 */

/** A class is flagged when its pass rate is below this. */
export const CLASS_PASS_FLOOR = 60

export interface ClassPassStat {
  className: string
  /** Students on the class roster. */
  studentCount: number
  /** Students with a computed term result. */
  assessed: number
  /** Percent of assessed students who passed; null when nothing is assessed. */
  passRate: number | null
  /** Mean term average of assessed students; null when nothing is assessed. */
  average: number | null
}

/** True when the class has a measured pass rate (0 included) and a roster. */
function hasMeasuredRate(c: ClassPassStat): c is ClassPassStat & { passRate: number } {
  return c.studentCount > 0 && c.assessed > 0 && c.passRate !== null && Number.isFinite(c.passRate)
}

/** A class with students, a measured pass rate, and that rate below the floor. */
export function isLowPassClass(c: ClassPassStat): boolean {
  return hasMeasuredRate(c) && c.passRate >= 0 && c.passRate < CLASS_PASS_FLOOR
}

export function selectLowPassClasses<T extends ClassPassStat>(classes: readonly T[]): T[] {
  return classes.filter(isLowPassClass)
}

/**
 * The class with the lowest measured pass rate (ties: lower average, then
 * name, so the answer is deterministic). Undefined when no class has one.
 */
export function selectWeakestClass<T extends ClassPassStat>(classes: readonly T[]): T | undefined {
  return classes
    .filter(hasMeasuredRate)
    .slice()
    .sort(
      (a, b) =>
        (a.passRate as number) - (b.passRate as number) ||
        (a.average ?? Number.POSITIVE_INFINITY) - (b.average ?? Number.POSITIVE_INFINITY) ||
        a.className.localeCompare(b.className),
    )[0]
}

// ─── Headline KPIs ──────────────────────────────────────────────────────────

/**
 * The four figures a Headteacher is accountable for, in reading order. Each is
 * selected from a KPI the domain service already computes, so a headline can
 * never disagree with the report it links to.
 */
export const PRIMARY_KPI_KEYS = ['active', 'attendanceRate', 'schoolPassRate', 'collectionRate'] as const

/** The primary KPIs present in the groups, in PRIMARY_KPI_KEYS order. */
export function selectPrimaryKpis<K extends { key: string }>(groups: readonly { kpis: readonly K[] }[]): K[] {
  const all = groups.flatMap((g) => g.kpis)
  return PRIMARY_KPI_KEYS.flatMap((key) => {
    const found = all.find((k) => k.key === key)
    return found ? [found] : []
  })
}

// ─── Attention queue: owner, action, ranking ────────────────────────────────

/** Who normally acts on each attention key, and what they do. Keys not listed carry neither. */
export const ATTENTION_ROUTING: Readonly<Record<string, { owner: string; action: string }>> = {
  'classes-low-pass': { owner: 'Academic staff', action: 'Review class results' },
  'variances-open': { owner: 'Stores / admin', action: 'Resolve stocktake variances' },
  'applications-stale': { owner: 'Admissions office', action: 'Decide on applications' },
  'applications-pending': { owner: 'Admissions office', action: 'Review applications' },
  'awaiting-admission': { owner: 'Admissions office', action: 'Admit accepted applicants' },
  'students-no-class': { owner: 'Admissions office', action: 'Assign classes' },
  'missing-guardian-phone': { owner: 'Admissions office', action: 'Update guardian contacts' },
  'awaiting-maneb': { owner: 'Exam officer', action: 'Follow up MANEB results' },
  'classes-low-attendance': { owner: 'Class teachers', action: 'Follow up attendance' },
  'chronic-absentees': { owner: 'Class teachers', action: 'Contact guardians' },
  'stale-registers': { owner: 'Class teachers', action: 'Mark registers' },
  'arrears-severe': { owner: 'Finance office', action: 'Collect overdue fees' },
  'arrears-recent': { owner: 'Finance office', action: 'Send reminders' },
  'installments-overdue': { owner: 'Finance office', action: 'Follow up instalments' },
  'expenses-pending': { owner: 'Headteacher', action: 'Approve or decline expenses' },
  'budgets-high': { owner: 'Finance office', action: 'Review budgets' },
  'po-approval': { owner: 'Headteacher', action: 'Approve purchase orders' },
  'po-late': { owner: 'Procurement', action: 'Chase suppliers' },
  'contracts-expired': { owner: 'HR office', action: 'Renew or end contracts' },
  'contracts-soon': { owner: 'HR office', action: 'Plan contract renewals' },
  'leave-pending': { owner: 'Headteacher', action: 'Decide on leave' },
  'loans-pending': { owner: 'Headteacher', action: 'Decide on staff loans' },
  'promotions-pending': { owner: 'Headteacher', action: 'Decide on promotions' },
  'reviews-outstanding': { owner: 'HR office', action: 'Complete staff reviews' },
  'overdue-severe': { owner: 'Librarian', action: 'Recover long-overdue books' },
  overdue: { owner: 'Librarian', action: 'Send overdue notices' },
  'unapproved-digital': { owner: 'Librarian', action: 'Review digital resources' },
  'no-copies': { owner: 'Librarian', action: 'Restock or reserve' },
  lost: { owner: 'Librarian', action: 'Review lost copies' },
  'marks-missing': { owner: 'Subject teachers', action: 'Enter marks' },
  approval: { owner: 'Exam officer', action: 'Approve results' },
  release: { owner: 'Headteacher', action: 'Authorise release' },
  stalled: { owner: 'Exam officer', action: 'Move exams to marks entry' },
  'students-multi': { owner: 'Class teachers', action: 'Plan support' },
  'students-failing': { owner: 'Class teachers', action: 'Plan support' },
  'students-absence': { owner: 'Class teachers', action: 'Follow up absence' },
  'students-declining': { owner: 'Class teachers', action: 'Plan support' },
  'assignments-outstanding': { owner: 'Subject teachers', action: 'Chase submissions' },
  'exams-this-week': { owner: 'Subject teachers', action: 'Prepare for exams' },
  outages: { owner: 'System administrator', action: 'Restore service' },
  'services-degraded': { owner: 'System administrator', action: 'Check service health' },
  'repeated-failures': { owner: 'System administrator', action: 'Review sign-in security' },
  'unresolved-issues': { owner: 'System administrator', action: 'Triage errors' },
  'multi-ip': { owner: 'System administrator', action: 'Review account activity' },
  'audit-volume': { owner: 'System administrator', action: 'Review the audit log' },
  'inactive-accounts': { owner: 'System administrator', action: 'Review accounts' },
}

interface RoutableItem {
  key: string
  severity: 'critical' | 'watch' | 'info' | 'positive'
  count: number | null
  ageDays?: number | null
  owner?: string
  action?: string
}

/** Adds owner and action from the routing table; an owner or action already on the item is kept. */
export function enrichAttention<T extends RoutableItem>(items: readonly T[]): T[] {
  return items.map((i) => {
    const route = ATTENTION_ROUTING[i.key]
    if (!route) return i
    return { ...i, owner: i.owner ?? route.owner, action: i.action ?? route.action }
  })
}

const SEVERITY_ORDER = { critical: 0, watch: 1, info: 2, positive: 3 } as const

/**
 * Most urgent first: severity, then the oldest item (an item with no recorded
 * age sorts after one with an age), then the larger group. Items with nothing in
 * them (count 0 or null) are dropped.
 */
export function rankAttention<T extends RoutableItem>(items: readonly T[]): T[] {
  return items
    .filter((i) => (i.count ?? 0) > 0)
    .slice()
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        (b.ageDays ?? -1) - (a.ageDays ?? -1) ||
        (b.count ?? 0) - (a.count ?? 0),
    )
}
