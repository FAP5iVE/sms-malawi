/**
 * Pure exam-workflow maths (no database access, unit-tested).
 *
 * The workflow state is Exam.status — the one authoritative status the exam
 * service writes. This module never invents a second status; it only measures
 * how long an exam has been in the status it is in, using the best timestamp
 * the application recorded for entering it:
 *
 *   1. the audit entry written when the transition happened (finalised,
 *      approved, released, unlocked),
 *   2. otherwise timestamps on the marks themselves,
 *   3. otherwise the exam date,
 *   4. otherwise Exam.updatedAt — which moves on any edit, so it is flagged
 *      `updated_at` and shown as approximate.
 */
import type { ApiExamBlocker, ApiMarkCompletionRow } from '@shared/types/reporting-exams'
import { daysBetween, mean } from '@/server/services/reporting/kpi'

/** Audit actions that change an exam's workflow state or edit its results. */
export const WORKFLOW_ACTIONS = [
  'exam.created',
  'exam.updated',
  'exam.deleted',
  'exam.marks_finalized',
  'exam.results_approved',
  'exam.results_released',
  'exam.marks_unlocked',
  'exam.marks_corrected_in_review',
  'exam.term_results_released',
] as const

export const ACTION_LABEL: Record<string, string> = {
  'exam.created': 'Exam scheduled',
  'exam.updated': 'Exam details changed',
  'exam.deleted': 'Exam deleted',
  'exam.marks_finalized': 'Marks finalised',
  'exam.results_approved': 'Results approved',
  'exam.results_released': 'Results released',
  'exam.marks_unlocked': 'Marks unlocked for re-entry',
  'exam.marks_corrected_in_review': 'Marks corrected in review',
  'exam.term_results_released': 'Term results released (all classes)',
}

/** Actions that rewrite or release results — flagged in the trail. */
export const SENSITIVE_ACTIONS: ReadonlySet<string> = new Set([
  'exam.marks_unlocked',
  'exam.marks_corrected_in_review',
  'exam.results_released',
  'exam.term_results_released',
])

/**
 * Report defaults: days an exam may sit in a stage before it is called delayed.
 * The school does not store its own deadlines, so these are stated in the report.
 */
export const DELAY_AFTER_DAYS = {
  /** Days after the exam date before an exam still SCHEDULED / IN_PROGRESS counts as stalled. */
  afterExamDate: 1,
  /** Days in MARKS_PENDING / MARKS_DRAFT. */
  marksEntry: 14,
  /** Days in MARKS_FINAL waiting for the exam officer. */
  approval: 7,
  /** Days in RESULTS_APPROVED waiting for release authorisation. */
  release: 7,
} as const

export interface AuditEvent {
  action: string
  entityId: string
  at: Date
  actorUid: string
  actorRole: string
}

export interface MarkTiming {
  firstMarkAt: Date | null
  lastFinalisedAt: Date | null
}

export type StageSource = 'audit' | 'marks' | 'exam_date' | 'updated_at'

export interface Timeline {
  marksStartedAt: Date | null
  finalisedAt: Date | null
  approvedAt: Date | null
  releasedAt: Date | null
  lastUnlockedAt: Date | null
  unlockCount: number
  correctionCount: number
  /** When the exam entered its current status, as best known. */
  stageEnteredAt: Date | null
  stageSource: StageSource
}

const latest = (events: readonly AuditEvent[], action: string): Date | null => {
  let t: Date | null = null
  for (const e of events) if (e.action === action && (t === null || e.at.getTime() > t.getTime())) t = e.at
  return t
}

export function buildTimeline(input: {
  exam: { type: string; status: string; date: Date; updatedAt: Date }
  events: readonly AuditEvent[]
  /** When the whole term's results were released together (exam.term_results_released), if ever. */
  termReleaseAt: Date | null
  marks: MarkTiming
}): Timeline {
  const { exam, events, marks } = input
  const lastUnlockedAt = latest(events, 'exam.marks_unlocked')
  const finalisedAudit = latest(events, 'exam.marks_finalized')
  const approvedAt = latest(events, 'exam.results_approved')
  const releasedAudit = latest(events, 'exam.results_released')
  const finalisedAt = finalisedAudit ?? (exam.status === 'MARKS_FINAL' || exam.status === 'RESULTS_APPROVED' || exam.status === 'RESULTS_RELEASED' ? marks.lastFinalisedAt : null)
  const releasedAt = releasedAudit ?? (exam.type === 'END_TERM' && exam.status === 'RESULTS_RELEASED' ? input.termReleaseAt : null)

  let at: Date | null = null
  let source: StageSource = 'updated_at'
  const pick = (d: Date | null, s: StageSource) => {
    if (d) { at = d; source = s }
  }
  switch (exam.status) {
    case 'RESULTS_RELEASED':
      pick(releasedAt, 'audit')
      break
    case 'RESULTS_APPROVED':
      pick(approvedAt, 'audit')
      break
    case 'MARKS_FINAL':
      if (finalisedAudit) pick(finalisedAudit, 'audit')
      else pick(marks.lastFinalisedAt, 'marks')
      break
    case 'MARKS_DRAFT':
      if (lastUnlockedAt) pick(lastUnlockedAt, 'audit')
      else pick(marks.firstMarkAt, 'marks')
      break
    case 'MARKS_PENDING':
      if (lastUnlockedAt) pick(lastUnlockedAt, 'audit')
      else pick(exam.date, 'exam_date')
      break
    default:
      pick(exam.date, 'exam_date')
  }
  if (at === null) at = exam.updatedAt

  return {
    marksStartedAt: marks.firstMarkAt,
    finalisedAt,
    approvedAt,
    releasedAt,
    lastUnlockedAt,
    unlockCount: events.filter((e) => e.action === 'exam.marks_unlocked').length,
    correctionCount: events.filter((e) => e.action === 'exam.marks_corrected_in_review').length,
    stageEnteredAt: at,
    stageSource: source,
  }
}

/** Days in the current stage and whether that exceeds the report's delay threshold. */
export function assessDelay(status: string, stageEnteredAt: Date | null, now: Date): { daysInStage: number | null; delayed: boolean; thresholdDays: number | null } {
  const daysInStage = stageEnteredAt ? Math.max(0, daysBetween(stageEnteredAt, now)) : null
  const threshold =
    status === 'SCHEDULED' || status === 'IN_PROGRESS' ? DELAY_AFTER_DAYS.afterExamDate
    : status === 'MARKS_PENDING' || status === 'MARKS_DRAFT' ? DELAY_AFTER_DAYS.marksEntry
    : status === 'MARKS_FINAL' ? DELAY_AFTER_DAYS.approval
    : status === 'RESULTS_APPROVED' ? DELAY_AFTER_DAYS.release
    : null
  return { daysInStage, delayed: threshold !== null && daysInStage !== null && daysInStage > threshold, thresholdDays: threshold }
}

export interface StageSummary {
  key: string
  count: number
  delayed: number
  avgDaysInStage: number | null
  oldestDaysInStage: number | null
}

export function summariseStages(
  stages: readonly string[],
  rows: readonly { status: string; daysInStage: number | null; delayed: boolean }[],
): StageSummary[] {
  return stages.map((key) => {
    const inStage = rows.filter((r) => r.status === key)
    const days = inStage.map((r) => r.daysInStage).filter((d): d is number => d !== null)
    return {
      key,
      count: inStage.length,
      delayed: inStage.filter((r) => r.delayed).length,
      avgDaysInStage: key === 'RESULTS_RELEASED' ? null : mean(days),
      oldestDaysInStage: key === 'RESULTS_RELEASED' || days.length === 0 ? null : Math.max(...days),
    }
  })
}

export interface OwnerWork {
  owner: ApiExamBlocker['owner']
  exams: number
  delayed: number
  marksMissing: number
  oldestDays: number | null
}

/** Outstanding work grouped by who has to act next. Every row not yet released has exactly one owner or none (not yet due). */
export function workByOwner(
  rows: readonly (Pick<ApiMarkCompletionRow, 'missing'> & { owner: ApiExamBlocker['owner'] | null; delayed: boolean; daysInStage: number | null })[],
): OwnerWork[] {
  return (['teacher', 'exam_officer', 'high_rank'] as const).map((owner) => {
    const mine = rows.filter((r) => r.owner === owner)
    const days = mine.map((r) => r.daysInStage).filter((d): d is number => d !== null)
    return {
      owner,
      exams: mine.length,
      delayed: mine.filter((r) => r.delayed).length,
      marksMissing: owner === 'teacher' ? mine.reduce((s, r) => s + r.missing, 0) : 0,
      oldestDays: days.length ? Math.max(...days) : null,
    }
  })
}

/**
 * Can this term's end-of-term results be released together? Same rule as
 * examService.releaseTermEndResults: every end-of-term exam must already be
 * approved (or released) before any is released.
 */
export function termReleaseReadiness(exams: readonly { className: string; status: string }[]) {
  const approved = exams.filter((e) => e.status === 'RESULTS_APPROVED').length
  const released = exams.filter((e) => e.status === 'RESULTS_RELEASED').length
  const notReady = exams.filter((e) => e.status !== 'RESULTS_APPROVED' && e.status !== 'RESULTS_RELEASED')
  return {
    endTermExams: exams.length,
    approved,
    released,
    notReady: notReady.map((e) => ({ className: e.className, status: e.status })),
    /** Nothing blocks a joint release and at least one exam is waiting for it. */
    readyToRelease: exams.length > 0 && notReady.length === 0 && approved > 0,
    allReleased: exams.length > 0 && released === exams.length,
  }
}

export interface ManebRow {
  examType: string
  status: string
  overallGrade: string | null
}

export const MANEB_STATUS_ORDER = ['REGISTERED', 'SITTING', 'RESULTS_RECEIVED', 'CERTIFIED'] as const

/** MANEB records by exam type and status — always JCE and MSCE, even with no records. External examination records held by the school, not school-entered marks. */
export function summariseManeb(records: readonly ManebRow[]) {
  const types = [...new Set(['JCE', 'MSCE', ...records.map((r) => r.examType)])].sort()
  return types.map((examType) => {
    const mine = records.filter((r) => r.examType === examType)
    const count = (s: string) => mine.filter((r) => r.status === s).length
    return {
      examType,
      candidates: mine.length,
      byStatus: MANEB_STATUS_ORDER.map((status) => ({ status, count: count(status) })),
      awaitingResults: count('REGISTERED') + count('SITTING'),
      resultsReceived: count('RESULTS_RECEIVED') + count('CERTIFIED'),
      /** Results received but no overall classification recorded. */
      resultsWithoutGrade: mine.filter((r) => (r.status === 'RESULTS_RECEIVED' || r.status === 'CERTIFIED') && !r.overallGrade).length,
    }
  })
}
