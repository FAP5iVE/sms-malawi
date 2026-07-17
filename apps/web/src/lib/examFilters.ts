/**
 * apps/web/src/lib/examFilters.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: The two exam-list predicates the newly-wired dashboard stat
 *   cards share ("Exams This Week", "Marks Pending", "Results to
 *   Release"), defined once here instead of once per dashboard. Statuses
 *   mirror the ExamStatus enum in apps/web/prisma/schema.prisma:
 *   SCHEDULED → IN_PROGRESS → MARKS_PENDING → MARKS_DRAFT → MARKS_FINAL →
 *   RESULTS_APPROVED → RESULTS_RELEASED.
 * [DEPENDS ON]: @shared/types/api (ApiExam)
 */

import type { ApiExam } from '@shared/types/api'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Exams whose date falls within the coming week — from the start of today
 * (a same-day exam still counts even once its start time has passed) to
 * seven days out.
 */
export function examsInNextSevenDays(exams: readonly ApiExam[]): ApiExam[] {
  const now     = Date.now()
  const weekEnd = now + 7 * DAY_MS
  return exams.filter((e) => {
    const t = new Date(e.date).getTime()
    return Number.isFinite(t) && t >= now - DAY_MS && t <= weekEnd
  })
}

/** Exams still awaiting marks entry or finalisation. */
export function examsAwaitingMarks(exams: readonly ApiExam[]): ApiExam[] {
  return exams.filter(
    (e) => e.status === 'MARKS_PENDING' || e.status === 'MARKS_DRAFT',
  )
}

/** Exams whose results are approved and now await release to students. */
export function examsAwaitingRelease(exams: readonly ApiExam[]): ApiExam[] {
  return exams.filter((e) => e.status === 'RESULTS_APPROVED')
}

/** Exams whose results have been released. */
export function examsReleased(exams: readonly ApiExam[]): ApiExam[] {
  return exams.filter((e) => e.status === 'RESULTS_RELEASED')
}
