/** Pure teaching-analytics maths (no database access, unit-tested). */
import type { SpreadKind, StudentFlag } from '@shared/types/reporting-academic'
import { mean, median, ratioPct, stdDev } from '@/server/services/reporting/kpi'

export const ABSENCE_FLAG_PCT = 15
/** Minimum recorded days before an absence rate can flag a student. */
export const ABSENCE_MIN_DAYS = 5
export const DECLINE_POINTS = 10
/** A class is "uneven" at/above this standard deviation (percentage points). */
export const WIDE_SPREAD_SD = 20
/** …and "class-wide weak" when the average is under the pass mark with a spread at/below this. */
export const TIGHT_SPREAD_SD = 12

export const SCORE_BUCKETS = ['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79', '80–89', '90–100'] as const

export const scorePct = (mark: number, max: number): number | null =>
  Number.isFinite(mark) && Number.isFinite(max) && max > 0 ? (mark / max) * 100 : null

export function distribution(scores: readonly number[]): { bucket: string; count: number }[] {
  const counts = new Array<number>(10).fill(0)
  for (const s of scores) {
    const i = Math.min(9, Math.max(0, Math.floor(s / 10)))
    counts[i] = (counts[i] ?? 0) + 1
  }
  return SCORE_BUCKETS.map((bucket, i) => ({ bucket, count: counts[i] ?? 0 }))
}

export interface ScoreSummary {
  assessed: number
  average: number | null
  median: number | null
  min: number | null
  max: number | null
  stdDev: number | null
  passRate: number | null
}

export function summarise(scores: readonly number[], passMark: number): ScoreSummary {
  return {
    assessed: scores.length,
    average: mean(scores),
    median: median(scores),
    min: scores.length ? Math.round(Math.min(...scores) * 10) / 10 : null,
    max: scores.length ? Math.round(Math.max(...scores) * 10) / 10 : null,
    stdDev: stdDev(scores),
    passRate: ratioPct(scores.filter((s) => s >= passMark).length, scores.length),
  }
}

/** Separates "the whole class is struggling" from "results are very uneven". */
export function spreadKind(average: number | null, sd: number | null, passMark: number): SpreadKind | null {
  if (average === null || sd === null) return null
  if (average < passMark && sd <= TIGHT_SPREAD_SD) return 'class-wide'
  if (sd >= WIDE_SPREAD_SD) return 'wide-spread'
  return null
}

export interface StudentFlagInput {
  average: number | null
  subjectAverages: readonly { subject: string; average: number }[]
  passMark: number
  absentDays: number
  recordedDays: number
  previousAverage: number | null
}

export interface StudentFlagResult {
  flags: StudentFlag[]
  failingSubjects: string[]
  absenceRate: number | null
  change: number | null
}

export function flagStudent(input: StudentFlagInput): StudentFlagResult {
  const failing = input.subjectAverages.filter((s) => s.average < input.passMark).map((s) => s.subject).sort()
  const absenceRate = ratioPct(input.absentDays, input.recordedDays)
  const change =
    input.average !== null && input.previousAverage !== null
      ? Math.round((input.average - input.previousAverage) * 10) / 10
      : null
  const flags: StudentFlag[] = []
  if (input.average !== null && input.average < input.passMark) flags.push('LOW_AVERAGE')
  if (failing.length >= 2) flags.push('SUBJECT_FAILS')
  if (absenceRate !== null && input.recordedDays >= ABSENCE_MIN_DAYS && absenceRate >= ABSENCE_FLAG_PCT) flags.push('ABSENCE')
  if (change !== null && change <= -DECLINE_POINTS) flags.push('DECLINING')
  return { flags, failingSubjects: failing, absenceRate, change }
}

export interface AssignmentInput {
  expected: number
  submitted: number
  late: number
  dueDate: Date
}

export function assignmentStats(a: AssignmentInput, now: Date) {
  return {
    completionRate: ratioPct(a.submitted, a.expected),
    overdue: a.dueDate.getTime() < now.getTime() && a.submitted < a.expected,
  }
}
