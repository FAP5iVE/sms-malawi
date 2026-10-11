/**
 * Reporting thresholds — the single place that decides when a KPI is
 * "healthy", "watch" or "critical". Defined as constants (not magic numbers
 * scattered through services) so a school can later promote them to
 * SystemSettings without touching any calculation.
 *
 * Each rule is `{ watch, critical }` on the KPI's natural scale. `higherIsBetter`
 * decides which side of the boundary is bad.
 */

export interface ThresholdRule {
  /** Boundary at which the KPI moves from healthy to watch. */
  watch: number
  /** Boundary at which the KPI moves from watch to critical. */
  critical: number
  higherIsBetter: boolean
}

export const THRESHOLDS = {
  /** Class / school pass rate, percent. */
  passRate: { watch: 70, critical: 50, higherIsBetter: true },
  /** Mean assessment score, percent. */
  average: { watch: 55, critical: 45, higherIsBetter: true },
  /** Attendance rate, percent. */
  attendanceRate: { watch: 90, critical: 85, higherIsBetter: true },
  /** Fees collected ÷ billed, percent. */
  collectionRate: { watch: 80, critical: 60, higherIsBetter: true },
  /** Assignment completion, percent. */
  assignmentCompletion: { watch: 75, critical: 50, higherIsBetter: true },
  /** Exam marks entered ÷ expected, percent. */
  markCompletion: { watch: 95, critical: 75, higherIsBetter: true },
  /** Share of receivables more than 60 days overdue, percent. */
  severeArrearsShare: { watch: 20, critical: 40, higherIsBetter: false },
  /** Failed ÷ total logins, percent. */
  loginFailureRate: { watch: 5, critical: 15, higherIsBetter: false },
  /** Overdue ÷ active library loans, percent. */
  libraryOverdueRate: { watch: 10, critical: 25, higherIsBetter: false },
  /** Budget used ÷ budget, percent. */
  budgetUtilisation: { watch: 90, critical: 100, higherIsBetter: false },
  /** Age in days of the oldest application still awaiting a first decision. */
  applicationReviewAge: { watch: 7, critical: 14, higherIsBetter: false },
} as const satisfies Record<string, ThresholdRule>

export type ThresholdKey = keyof typeof THRESHOLDS

/** Days ahead that count as "expiring soon" for contracts / documents. */
export const EXPIRY_LOOKAHEAD_DAYS = 60

/** Receivables aging buckets, in days past due. */
export const AGING_BUCKETS = [
  { key: 'current', label: 'Current', minDays: -Infinity, maxDays: 0 },
  { key: 'd1_30', label: '1–30 days', minDays: 1, maxDays: 30 },
  { key: 'd31_60', label: '31–60 days', minDays: 31, maxDays: 60 },
  { key: 'd61_90', label: '61–90 days', minDays: 61, maxDays: 90 },
  { key: 'd90_plus', label: '90+ days', minDays: 91, maxDays: Infinity },
] as const

/** Minimum sample before a ratio is reported rather than "N/A". */
export const MIN_SAMPLE = 1
