/**
 * Pure examination-workflow maths (no database access, unit-tested).
 */
import type {
  ApiCompletionGroup,
  ApiExamBlocker,
  ApiMarkCompletionRow,
  ExamStageKey,
} from '@shared/types/reporting-exams'
import { daysBetween, mean, ratioPct } from '@/server/services/reporting/kpi'

export const EXAM_STAGES: { key: ExamStageKey; label: string }[] = [
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'MARKS_PENDING', label: 'Marks pending' },
  { key: 'MARKS_DRAFT', label: 'Marks draft' },
  { key: 'MARKS_FINAL', label: 'Marks final' },
  { key: 'RESULTS_APPROVED', label: 'Results approved' },
  { key: 'RESULTS_RELEASED', label: 'Results released' },
]

export function buildCompletionRow(input: {
  exam: {
    id: string; title: string; subject: string; type: string; classId: string
    className: string; form: number; status: string; date: Date
  }
  teacherUid: string | null
  teacher: string | null
  expected: number
  entered: number
  absent: number
  finalised: number
  lastFinalisedAt: Date | null
}): ApiMarkCompletionRow {
  const { exam, expected, entered, absent, finalised } = input
  const accounted = entered + absent
  const fullyFinal = expected > 0 && finalised >= Math.min(accounted, expected) && accounted >= expected
  return {
    examId: exam.id,
    title: exam.title,
    subject: exam.subject,
    type: exam.type,
    classId: exam.classId,
    className: exam.className,
    form: exam.form,
    status: exam.status,
    date: exam.date.toISOString(),
    teacherUid: input.teacherUid,
    teacher: input.teacher,
    expected,
    entered,
    absent,
    missing: Math.max(0, expected - accounted),
    finalised,
    completionRate: ratioPct(Math.min(accounted, expected), expected),
    turnaroundDays: fullyFinal && input.lastFinalisedAt ? Math.max(0, daysBetween(exam.date, input.lastFinalisedAt)) : null,
  }
}

export function groupCompletion(
  rows: readonly ApiMarkCompletionRow[],
  keyOf: (r: ApiMarkCompletionRow) => { key: string; label: string },
): ApiCompletionGroup[] {
  const groups = new Map<string, { label: string; rows: ApiMarkCompletionRow[] }>()
  for (const r of rows) {
    const { key, label } = keyOf(r)
    const g = groups.get(key) ?? { label, rows: [] }
    g.rows.push(r)
    groups.set(key, g)
  }
  return Array.from(groups.entries())
    .map(([key, g]) => {
      const expected = g.rows.reduce((s, r) => s + r.expected, 0)
      const entered = g.rows.reduce((s, r) => s + r.entered, 0)
      const absent = g.rows.reduce((s, r) => s + r.absent, 0)
      const missing = g.rows.reduce((s, r) => s + r.missing, 0)
      return {
        key,
        label: g.label,
        exams: g.rows.length,
        expected,
        entered,
        absent,
        missing,
        completionRate: ratioPct(expected - missing, expected),
        avgTurnaroundDays: mean(g.rows.map((r) => r.turnaroundDays).filter((d): d is number => d !== null)),
      }
    })
    .sort((a, b) => (a.completionRate ?? 101) - (b.completionRate ?? 101) || b.missing - a.missing)
}

/**
 * Why is this exam not progressing, and who must act? Returns null when the
 * exam is moving normally or is complete (RESULTS_RELEASED).
 */
export function classifyBlocker(
  row: ApiMarkCompletionRow,
  now: Date,
  statusChangedAt: Date | null,
): ApiExamBlocker | null {
  const base = {
    examId: row.examId,
    title: row.title,
    subject: row.subject,
    className: row.className,
    status: row.status,
    missing: row.missing,
    daysWaiting: statusChangedAt ? Math.max(0, daysBetween(statusChangedAt, now)) : null,
  }
  const examDay = new Date(row.date)
  switch (row.status) {
    case 'SCHEDULED':
    case 'IN_PROGRESS':
      return examDay.getTime() < now.getTime() - 86_400_000
        ? { ...base, reason: 'Exam date has passed but it has not moved to marks entry', owner: 'exam_officer' }
        : null
    case 'MARKS_PENDING':
    case 'MARKS_DRAFT':
      return row.missing > 0
        ? { ...base, reason: `${row.missing} mark${row.missing === 1 ? '' : 's'} still to enter or mark absent`, owner: 'teacher' }
        : { ...base, reason: 'All marks are in but not yet finalised by the teacher', owner: 'teacher' }
    case 'MARKS_FINAL':
      return { ...base, reason: 'Finalised marks awaiting exam-officer results approval', owner: 'exam_officer' }
    case 'RESULTS_APPROVED':
      return { ...base, reason: 'Approved results awaiting high-rank release authorisation', owner: 'high_rank' }
    default:
      return null
  }
}
