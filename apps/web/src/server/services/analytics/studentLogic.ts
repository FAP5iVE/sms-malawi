/** Pure student-report helpers (no database access, unit-tested). */
import type { StudentAssignmentStatus } from '@shared/types/reporting-student'
import { ratioPct, round } from '@/server/services/reporting/kpi'
import { deadlineFor } from '@shared/utils/assignment'

export function assignmentStatus(
  submission: { status: string; submittedAt: Date } | null,
  dueDate: Date,
  now: Date,
): StudentAssignmentStatus {
  // ONE deadline rule for the whole product (shared/utils/assignment.ts): the end of
  // the due day in Malawi time. (This used to compare against the end of the UTC day
  // and `dueDate < now`, which called a legacy row OVERDUE two hours into its due day.)
  const deadline = deadlineFor(dueDate).getTime()
  if (submission && submission.status !== 'MISSING') {
    return submission.status === 'LATE' || submission.submittedAt.getTime() > deadline ? 'LATE' : 'SUBMITTED'
  }
  return deadline < now.getTime() ? 'OVERDUE' : 'PENDING'
}

export function assignmentTotals(statuses: readonly StudentAssignmentStatus[]) {
  const n = (s: StudentAssignmentStatus) => statuses.filter((x) => x === s).length
  const submitted = n('SUBMITTED')
  const late = n('LATE')
  const overdue = n('OVERDUE')
  // Completion counts only work that is already due: pending work is not "missing" yet.
  const due = submitted + late + overdue
  return { total: statuses.length, submitted, late, pending: n('PENDING'), overdue, completionRate: ratioPct(submitted + late, due) }
}

export interface SubjectResult {
  average: number
  grade: string
  pass: boolean
}

export function subjectRows(
  current: Readonly<Record<string, SubjectResult>>,
  previous: Readonly<Record<string, SubjectResult>> | null,
  passMark: number,
) {
  return Object.entries(current)
    .map(([subject, r]) => {
      const prev = previous?.[subject]
      return {
        subject,
        score: round(r.average, 1),
        grade: r.grade || '—',
        pass: r.pass,
        previousScore: prev ? round(prev.average, 1) : null,
        change: prev ? round(r.average - prev.average, 1) : null,
        distanceFromPass: round(r.average - passMark, 1),
      }
    })
    .sort((a, b) => b.score - a.score)
}

/** Parse TermResult.subjectResults (flat object keyed by subject); anything else → {}. */
export function parseSubjectResults(raw: unknown): Record<string, SubjectResult> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, SubjectResult> = {}
  for (const [subject, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      const average = Number(o.average)
      if (Number.isFinite(average)) out[subject] = { average, grade: typeof o.grade === 'string' ? o.grade : '', pass: o.pass === true }
    }
  }
  return out
}
