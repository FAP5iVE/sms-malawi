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

// ─────────────────────────────────────────────────────────────────────────────
//  Class rankings, student-vs-class comparison and the top-ten announcement
//  text. Pure functions: examService does the queries, these do the maths and
//  the wording, so both can be unit-tested without a database.
// ─────────────────────────────────────────────────────────────────────────────

export interface Rankable {
  name:   string
  /** Percentage figure — overall term average, or one subject's average. */
  value:  number
  /** MSCE aggregate (6–54, LOWER is better). Null on the JCE track. */
  points: number | null
}

/**
 * Best first. `byPoints` (MSCE overall result) ranks on the aggregate with the
 * LOWER total better, ties broken on the higher average; students without a
 * valid six-subject aggregate go last, never first. Otherwise higher % wins.
 * Name is the final tie-break so the order never changes between calls.
 */
export function sortBest<T extends Rankable>(rows: readonly T[], byPoints: boolean): T[] {
  return [...rows].sort((a, b) => {
    if (byPoints) {
      const ap = a.points ?? Number.POSITIVE_INFINITY
      const bp = b.points ?? Number.POSITIVE_INFINITY
      if (ap !== bp) return ap - bp
    }
    return (b.value - a.value) || a.name.localeCompare(b.name)
  })
}

export interface SpreadStats {
  best:    number
  worst:   number
  average: number
  count:   number
}

/** Best / worst / mean of a set of figures. `higherIsBetter` is false for MSCE points. */
export function spreadOf(values: readonly number[], higherIsBetter = true, dp = 2): SpreadStats | null {
  if (values.length === 0) return null
  const hi = Math.max(...values)
  const lo = Math.min(...values)
  const f = 10 ** dp
  return {
    best:    higherIsBetter ? hi : lo,
    worst:   higherIsBetter ? lo : hi,
    average: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * f) / f,
    count:   values.length,
  }
}

export interface CohortMember {
  studentId: string
  name:      string
  average:   number
  points:    number | null
  /** subject → final term mark (%) */
  subjects:  Record<string, number>
}

export interface SubjectStanding {
  subject:  string
  you:      number
  best:     number
  worst:    number
  average:  number
  position: number
  outOf:    number
}

export interface StudentStanding {
  position: number
  outOf:    number
  /** Percentage comparison across the whole class. */
  overall:  { you: number } & SpreadStats
  /** MSCE only — aggregate points; "best" is the LOWEST total. Null on JCE. */
  points:   ({ you: number } & SpreadStats) | null
  subjects: SubjectStanding[]
}

/**
 * One student against their own class. Positions use the same ordering as the
 * stored classPosition (track-aware), so the number on the report card and the
 * number here can never disagree. Worst figures are returned as bare numbers —
 * callers must never attach a name to them.
 */
export function buildStudentStanding(
  studentId: string,
  cohort: readonly CohortMember[],
  byPoints: boolean,
): StudentStanding | null {
  const me = cohort.find((c) => c.studentId === studentId)
  if (!me) return null

  const ordered = sortBest(
    cohort.map((c) => ({ ...c, value: c.average })),
    byPoints,
  )
  const position = ordered.findIndex((c) => c.studentId === studentId) + 1

  const overall = spreadOf(cohort.map((c) => c.average))!
  const pointVals = cohort.map((c) => c.points).filter((p): p is number => p !== null)
  const pts = me.points !== null ? spreadOf(pointVals, false, 1) : null

  const subjects: SubjectStanding[] = Object.entries(me.subjects)
    .map(([subject, you]) => {
      const vals = cohort.map((c) => c.subjects[subject]).filter((v): v is number => typeof v === 'number')
      const s = spreadOf(vals)!
      return {
        subject, you,
        best: s.best, worst: s.worst, average: s.average,
        position: vals.filter((v) => v > you).length + 1,
        outOf: vals.length,
      }
    })
    .sort((a, b) => a.subject.localeCompare(b.subject))

  return {
    position,
    outOf: cohort.length,
    overall: { you: me.average, ...overall },
    points: pts ? { you: me.points as number, ...pts } : null,
    subjects,
  }
}

export interface AnnouncementClassGroup {
  className: string
  form:      number
  students:  { name: string }[]
}

/**
 * Plain-text body of the post-release "top performers" announcement.
 *
 * Plain text on purpose: the same string is shown in the announcements list,
 * the notification bell, push previews and email, so it has to read well with
 * no markup at all. The first line is a complete sentence (that is all a push
 * preview shows). Structure uses a tiny convention the announcements page
 * renders as headings and lists: "# " = form heading, "## " = class heading,
 * "1. Name" = a ranked row. Names only, no marks.
 */
export function buildTopPerformersBody(
  term: number,
  academicYear: string,
  groups: readonly AnnouncementClassGroup[],
  limit = 10,
): string {
  const lines: string[] = [
    `Congratulations to the top ${limit} students in every class for Term ${term}, ${academicYear}. Well done, and keep it up!`,
  ]
  const forms = Array.from(new Set(groups.map((g) => g.form))).sort((a, b) => a - b)
  for (const form of forms) {
    lines.push('', `# Form ${form}`)
    const inForm = groups.filter((g) => g.form === form).sort((a, b) => a.className.localeCompare(b.className))
    for (const g of inForm) {
      lines.push('', `## ${g.className}`)
      g.students.forEach((s, i) => lines.push(`${i + 1}. ${s.name}`))
    }
  }
  return lines.join('\n')
}
