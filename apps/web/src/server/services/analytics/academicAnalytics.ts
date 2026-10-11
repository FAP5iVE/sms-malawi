/**
 * academicAnalytics.ts — a teacher's view of their own classes.
 *
 * Scope is resolved server-side from the caller's uid and never widened by the
 * client: every class they are form teacher of (all subjects), plus every
 * (class, subject) pair they are assigned to via getTeacherSubjectAssignments.
 * Student fee data is deliberately NOT part of this domain — the "needs
 * attention" list uses academic and attendance signals only.
 *
 * Averages use finalised marks (MARKS_FINAL and later), absent students are
 * excluded from averages, and the pass mark follows the school's grade scale
 * (getPassMarkThreshold) rather than a hard-coded 50.
 */
import 'server-only'
import { addDays } from 'date-fns'
import { prisma } from '@/lib/prisma'
import type { AttentionItem, ReportInsight, ReportSectionData } from '@shared/types/reporting'
import type {
  ApiAssignmentReport, ApiAssignmentRow, ApiExamReadiness, ApiStudentAttentionReport,
  ApiStudentAttentionRow, ApiTeachingClass, ApiTeachingReport, ApiTeachingSubjectRow, StudentFlag,
} from '@shared/types/reporting-academic'
import { getTermDateRange } from '@/server/services/attendanceService'
import { getTeacherSubjectAssignments } from '@/server/services/classService'
import { getPassMarkThreshold } from '@/server/services/gradeService'
import { getAttendanceReport } from './attendanceAnalytics'
import { getMarkCompletion } from './examAnalytics'
import {
  ABSENCE_FLAG_PCT, DECLINE_POINTS, assignmentStats, distribution, flagStudent, scorePct, spreadKind, summarise,
} from './academicLogic'
import { daysBetween, kpi, mean, ratioPct, thresholdKpi } from '@/server/services/reporting/kpi'
import { compact, markCompletionInsight, passRateInsight, sortInsights } from '@/server/services/reporting/insights'

const FINAL_STATUSES = ['MARKS_FINAL', 'RESULTS_APPROVED', 'RESULTS_RELEASED'] as const
const MANEB_TYPES = ['MANEB_JCE', 'MANEB_MSCE'] as const
const READINESS_LOOKAHEAD_DAYS = 30
const STUDENT_LIST_CAP = 40
const ASSIGNMENT_LIST_CAP = 60

interface TeachingScope {
  uid: string
  academicYear: string
  formClassIds: Set<string>
  pairs: Set<string>
  classIds: string[]
}

async function resolveScope(uid: string, academicYear: string): Promise<TeachingScope> {
  const [owned, pairs] = await Promise.all([
    prisma.class.findMany({ where: { teacherId: uid, academicYear, status: 'ACTIVE' }, select: { id: true } }),
    getTeacherSubjectAssignments(uid, academicYear),
  ])
  const formClassIds = new Set<string>(owned.map((c) => c.id))
  const classIds = new Set<string>(formClassIds)
  pairs.forEach((p) => {
    const id = p.split('|')[0]
    if (id) classIds.add(id)
  })
  return { uid, academicYear, formClassIds, pairs, classIds: Array.from(classIds) }
}

const inScope = (s: TeachingScope, classId: string, subject: string) =>
  s.formClassIds.has(classId) || s.pairs.has(`${classId}|${subject}`)

interface PassMarks {
  forForm: (form: number) => number
}

async function loadPassMarks(): Promise<PassMarks> {
  const [lower, upper] = await Promise.all([getPassMarkThreshold('INTERNAL_F1F2'), getPassMarkThreshold('INTERNAL_F3F4')])
  return { forForm: (form) => (form <= 2 ? lower : upper) }
}

interface ScoreRow {
  classId: string
  className: string
  form: number
  subject: string
  examId: string
  studentId: string
  pct: number
  pass: boolean
}

interface LoadedScores {
  rows: ScoreRow[]
  absentMarks: number
}

async function loadScores(
  scope: TeachingScope,
  academicYear: string,
  term: number,
  passMarks: PassMarks,
): Promise<LoadedScores> {
  if (scope.classIds.length === 0) return { rows: [], absentMarks: 0 }
  const exams = await prisma.exam.findMany({
    where: {
      academicYear, term, classId: { in: scope.classIds },
      status: { in: [...FINAL_STATUSES] }, type: { notIn: [...MANEB_TYPES] },
    },
    select: {
      id: true, classId: true, subject: true, maxMark: true,
      class: { select: { name: true, form: true } },
      marks: { select: { studentId: true, mark: true, absent: true } },
    },
  })
  const rows: ScoreRow[] = []
  let absentMarks = 0
  for (const e of exams) {
    if (!inScope(scope, e.classId, e.subject)) continue
    const passMark = passMarks.forForm(e.class.form)
    for (const m of e.marks) {
      if (m.absent) { absentMarks += 1; continue }
      if (m.mark === null) continue
      const pct = scorePct(Number(m.mark), Number(e.maxMark))
      if (pct === null) continue
      rows.push({
        classId: e.classId, className: e.class.name, form: e.class.form, subject: e.subject,
        examId: e.id, studentId: m.studentId, pct, pass: pct >= passMark,
      })
    }
  }
  return { rows, absentMarks }
}

/** Per student: mean of per-subject means (so a subject with many tests doesn't dominate). */
function studentSubjectAverages(rows: readonly ScoreRow[]) {
  const bySubject = new Map<string, Map<string, number[]>>()
  for (const r of rows) {
    const subjects = bySubject.get(r.studentId) ?? new Map<string, number[]>()
    const list = subjects.get(r.subject) ?? []
    list.push(r.pct)
    subjects.set(r.subject, list)
    bySubject.set(r.studentId, subjects)
  }
  const out = new Map<string, { average: number | null; subjects: { subject: string; average: number }[] }>()
  for (const [studentId, subjects] of bySubject) {
    const subjectAverages = Array.from(subjects.entries()).map(([subject, list]) => ({
      subject, average: mean(list) ?? 0,
    }))
    out.set(studentId, { average: mean(subjectAverages.map((s) => s.average)), subjects: subjectAverages })
  }
  return out
}

export async function getTeachingReport(uid: string, academicYear: string, term: number): Promise<ApiTeachingReport> {
  const scope = await resolveScope(uid, academicYear)
  const passMarks = await loadPassMarks()

  const classRows = scope.classIds.length
    ? await prisma.class.findMany({
        where: { id: { in: scope.classIds }, academicYear, status: 'ACTIVE' },
        select: {
          id: true, name: true, form: true,
          _count: { select: { students: { where: { status: 'ACTIVE' } } } },
        },
        orderBy: [{ form: 'asc' }, { name: 'asc' }],
      })
    : []

  const termsToLoad = Array.from({ length: term }, (_, i) => i + 1)
  const loaded = await Promise.all(termsToLoad.map((t) => loadScores(scope, academicYear, t, passMarks)))
  const current = loaded[term - 1] ?? { rows: [], absentMarks: 0 }

  const classes: ApiTeachingClass[] = classRows.map((c) => {
    const assigned = Array.from(scope.pairs).filter((p) => p.startsWith(`${c.id}|`)).map((p) => p.slice(c.id.length + 1)).sort()
    const isForm = scope.formClassIds.has(c.id)
    return {
      classId: c.id, className: c.name, form: c.form, students: c._count.students,
      role: isForm ? (assigned.length > 0 ? 'both' : 'form_teacher') : 'subject_teacher',
      subjects: assigned,
    }
  })

  const groups = new Map<string, ScoreRow[]>()
  current.rows.forEach((r) => {
    const k = `${r.classId}|${r.subject}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  })
  const subjects: ApiTeachingSubjectRow[] = Array.from(groups.values()).map((rows) => {
    const first = rows[0] as ScoreRow
    const passMark = passMarks.forForm(first.form)
    // One score per student per subject for the headline figures: use every score so
    // multiple assessments weigh by how many were sat, as the existing reports do.
    const s = summarise(rows.map((r) => r.pct), passMark)
    return {
      classId: first.classId, className: first.className, form: first.form, subject: first.subject,
      assessed: new Set(rows.map((r) => r.studentId)).size,
      average: s.average, median: s.median, min: s.min, max: s.max, stdDev: s.stdDev, passRate: s.passRate,
      passMark, exams: new Set(rows.map((r) => r.examId)).size,
      spread: spreadKind(s.average, s.stdDev, passMark),
    }
  }).sort((a, b) => a.form - b.form || a.className.localeCompare(b.className) || a.subject.localeCompare(b.subject))

  const trend = termsToLoad.map((t, i) => {
    const rows = loaded[i]?.rows ?? []
    return {
      term: t, label: `Term ${t}`,
      average: mean(rows.map((r) => r.pct)),
      passRate: ratioPct(rows.filter((r) => r.pass).length, rows.length),
      assessed: rows.length,
    }
  })

  return {
    academicYear, term, classes, subjects,
    distribution: distribution(current.rows.map((r) => r.pct)),
    trend,
    totals: {
      assessed: current.rows.length,
      absentMarks: current.absentMarks,
      average: mean(current.rows.map((r) => r.pct)),
      passRate: ratioPct(current.rows.filter((r) => r.pass).length, current.rows.length),
      subjectsBelowPass: subjects.filter((s) => s.average !== null && s.average < s.passMark).length,
    },
  }
}

export async function getAssignmentReport(uid: string, academicYear: string, term: number): Promise<ApiAssignmentReport> {
  const scope = await resolveScope(uid, academicYear)
  const now = new Date()
  const empty: ApiAssignmentReport = {
    academicYear, term,
    totals: { assignments: 0, overdue: 0, expected: 0, submitted: 0, late: 0, completionRate: null, lateRate: null },
    byClass: [], rows: [],
  }
  if (scope.classIds.length === 0) return empty
  const { start, end } = getTermDateRange(academicYear, term)

  const [assignments, roster] = await Promise.all([
    prisma.assignment.findMany({
      where: { classId: { in: scope.classIds }, dueDate: { gte: start, lte: end } },
      select: { id: true, title: true, subject: true, classId: true, dueDate: true, createdByUid: true, class: { select: { name: true } } },
      orderBy: { dueDate: 'desc' },
    }),
    prisma.student.groupBy({
      by: ['classId'], where: { status: 'ACTIVE', classId: { in: scope.classIds } }, _count: { _all: true },
    }),
  ])
  const mine = assignments.filter((a) => a.createdByUid === uid || inScope(scope, a.classId, a.subject))
  if (mine.length === 0) return empty

  const subs = await prisma.assignmentSubmission.groupBy({
    by: ['assignmentId', 'status'],
    where: { assignmentId: { in: mine.map((a) => a.id) } },
    _count: { _all: true },
  })
  const rosterOf = new Map<string, number>(roster.map((r) => [r.classId ?? '', r._count._all]))
  const count = (id: string, status: string) => subs.find((s) => s.assignmentId === id && s.status === status)?._count._all ?? 0

  const rows: ApiAssignmentRow[] = mine.map((a) => {
    const expected = rosterOf.get(a.classId) ?? 0
    const late = count(a.id, 'LATE')
    const submitted = count(a.id, 'SUBMITTED') + late
    const stats = assignmentStats({ expected, submitted, late, dueDate: a.dueDate }, now)
    return {
      assignmentId: a.id, title: a.title, subject: a.subject, classId: a.classId, className: a.class.name,
      dueDate: a.dueDate.toISOString(), expected, submitted, late,
      completionRate: stats.completionRate, overdue: stats.overdue,
    }
  })

  // Completion only counts assignments already due; one still open cannot be "missing" yet.
  const due = rows.filter((r) => new Date(r.dueDate).getTime() < now.getTime())
  const expected = due.reduce((s, r) => s + r.expected, 0)
  const submitted = due.reduce((s, r) => s + r.submitted, 0)
  const late = due.reduce((s, r) => s + r.late, 0)

  const byClassMap = new Map<string, { className: string; assignments: number; expected: number; submitted: number }>()
  due.forEach((r) => {
    const c = byClassMap.get(r.classId) ?? { className: r.className, assignments: 0, expected: 0, submitted: 0 }
    c.assignments += 1; c.expected += r.expected; c.submitted += r.submitted
    byClassMap.set(r.classId, c)
  })

  return {
    academicYear, term,
    totals: {
      assignments: rows.length,
      overdue: rows.filter((r) => r.overdue).length,
      expected, submitted, late,
      completionRate: ratioPct(submitted, expected),
      lateRate: ratioPct(late, submitted),
    },
    byClass: Array.from(byClassMap.entries())
      .map(([classId, c]) => ({ classId, ...c, completionRate: ratioPct(c.submitted, c.expected) }))
      .sort((a, b) => (a.completionRate ?? 101) - (b.completionRate ?? 101)),
    rows: rows.slice(0, ASSIGNMENT_LIST_CAP),
  }
}

export async function getStudentAttention(uid: string, academicYear: string, term: number): Promise<ApiStudentAttentionReport> {
  const scope = await resolveScope(uid, academicYear)
  const empty: ApiStudentAttentionReport = {
    academicYear, term, students: [], totalFlagged: 0,
    counts: { LOW_AVERAGE: 0, SUBJECT_FAILS: 0, ABSENCE: 0, DECLINING: 0 }, multiRisk: 0,
    absenceThresholdPct: ABSENCE_FLAG_PCT, decliningPoints: DECLINE_POINTS,
  }
  if (scope.classIds.length === 0) return empty

  const passMarks = await loadPassMarks()
  const { start, end } = getTermDateRange(academicYear, term)
  const prevTerm = term > 1 ? term - 1 : null

  const [students, current, previous, attendance] = await Promise.all([
    prisma.student.findMany({
      where: { status: 'ACTIVE', classId: { in: scope.classIds } },
      select: { id: true, firstName: true, lastName: true, class: { select: { name: true, form: true } } },
    }),
    loadScores(scope, academicYear, term, passMarks),
    prevTerm ? loadScores(scope, academicYear, prevTerm, passMarks) : Promise.resolve<LoadedScores>({ rows: [], absentMarks: 0 }),
    prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: { classId: { in: scope.classIds }, date: { gte: start, lte: end } },
      _count: { _all: true },
    }),
  ])

  const nowAvg = studentSubjectAverages(current.rows)
  const prevAvg = studentSubjectAverages(previous.rows)
  const days = new Map<string, { absent: number; total: number }>()
  attendance.forEach((a) => {
    const d = days.get(a.studentId) ?? { absent: 0, total: 0 }
    d.total += a._count._all
    if (a.status === 'ABSENT') d.absent += a._count._all
    days.set(a.studentId, d)
  })

  const counts: Record<StudentFlag, number> = { LOW_AVERAGE: 0, SUBJECT_FAILS: 0, ABSENCE: 0, DECLINING: 0 }
  const flagged: ApiStudentAttentionRow[] = []
  for (const s of students) {
    const a = nowAvg.get(s.id)
    const d = days.get(s.id) ?? { absent: 0, total: 0 }
    const result = flagStudent({
      average: a?.average ?? null,
      subjectAverages: a?.subjects ?? [],
      passMark: passMarks.forForm(s.class?.form ?? 1),
      absentDays: d.absent, recordedDays: d.total,
      previousAverage: prevAvg.get(s.id)?.average ?? null,
    })
    if (result.flags.length === 0) continue
    result.flags.forEach((f) => { counts[f] += 1 })
    flagged.push({
      studentId: s.id, name: `${s.firstName} ${s.lastName}`, className: s.class?.name ?? '—',
      average: a?.average ?? null, failingSubjects: result.failingSubjects,
      absenceRate: result.absenceRate, change: result.change, flags: result.flags,
    })
  }
  flagged.sort((a, b) => b.flags.length - a.flags.length || (a.average ?? 101) - (b.average ?? 101))

  return {
    academicYear, term,
    students: flagged.slice(0, STUDENT_LIST_CAP),
    totalFlagged: flagged.length,
    counts,
    multiRisk: flagged.filter((f) => f.flags.length >= 2).length,
    absenceThresholdPct: ABSENCE_FLAG_PCT,
    decliningPoints: DECLINE_POINTS,
  }
}

export async function getExamReadiness(uid: string, academicYear: string, term: number): Promise<ApiExamReadiness> {
  const scope = await resolveScope(uid, academicYear)
  if (scope.classIds.length === 0) return { lookaheadDays: READINESS_LOOKAHEAD_DAYS, rows: [] }
  const passMarks = await loadPassMarks()
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  const [upcoming, current, roster] = await Promise.all([
    prisma.exam.findMany({
      where: {
        academicYear, classId: { in: scope.classIds }, status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
        type: { notIn: [...MANEB_TYPES] }, date: { gte: today, lte: addDays(today, READINESS_LOOKAHEAD_DAYS) },
      },
      select: { id: true, title: true, subject: true, classId: true, date: true, class: { select: { name: true, form: true } } },
      orderBy: { date: 'asc' },
    }),
    loadScores(scope, academicYear, term, passMarks),
    prisma.student.groupBy({
      by: ['classId'], where: { status: 'ACTIVE', classId: { in: scope.classIds } }, _count: { _all: true },
    }),
  ])
  const rosterOf = new Map<string, number>(roster.map((r) => [r.classId ?? '', r._count._all]))

  const rows = upcoming.filter((e) => inScope(scope, e.classId, e.subject)).map((e) => {
    const scores = current.rows.filter((r) => r.classId === e.classId && r.subject === e.subject)
    const passMark = passMarks.forForm(e.class.form)
    const perStudent = new Map<string, number[]>()
    scores.forEach((r) => perStudent.set(r.studentId, [...(perStudent.get(r.studentId) ?? []), r.pct]))
    const belowPass = Array.from(perStudent.values()).filter((l) => (mean(l) ?? 100) < passMark).length
    const s = summarise(scores.map((r) => r.pct), passMark)
    return {
      examId: e.id, title: e.title, subject: e.subject, classId: e.classId, className: e.class.name,
      date: e.date.toISOString(), daysAway: Math.max(0, daysBetween(today, e.date)),
      students: rosterOf.get(e.classId) ?? 0,
      previousAverage: s.average, previousPassRate: s.passRate, belowPass,
    }
  })
  return { lookaheadDays: READINESS_LOOKAHEAD_DAYS, rows }
}

export async function getAcademicOverview(uid: string, academicYear: string, term: number): Promise<ReportSectionData> {
  const [teaching, assignments, attention, marks, attendance] = await Promise.all([
    getTeachingReport(uid, academicYear, term),
    getAssignmentReport(uid, academicYear, term),
    getStudentAttention(uid, academicYear, term),
    getMarkCompletion(academicYear, term, { kind: 'teacher', teacherUid: uid }),
    getAttendanceReport(academicYear, term, { kind: 'teacher', teacherUid: uid }),
  ])
  const students = teaching.classes.reduce((s, c) => s + c.students, 0)
  const weakest = teaching.subjects
    .filter((s) => s.passRate !== null)
    .sort((a, b) => (a.passRate ?? 101) - (b.passRate ?? 101))[0]
  const hasClasses = teaching.classes.length > 0

  const kpis = [
    kpi({ key: 'classes', label: 'My classes', value: hasClasses ? teaching.classes.length : null, unit: 'count', description: 'Classes you are form teacher of or teach a subject in.', subLabel: `${students} students`, href: '/reports?tab=teaching' }),
    thresholdKpi('average', { key: 'average', label: 'Average score', value: teaching.totals.average, unit: 'percent', description: 'Mean of finalised assessment scores across your classes and subjects (absent students excluded).', href: '/reports?tab=teaching' }),
    thresholdKpi('passRate', { key: 'passRate', label: 'Pass rate', value: teaching.totals.passRate, unit: 'percent', description: 'Share of finalised scores at or above the school pass mark.', href: '/reports?tab=teaching' }),
    thresholdKpi('attendanceRate', { key: 'attendance', label: 'Attendance', value: attendance.attendanceRate, unit: 'percent', description: 'Attendance across your classes this term (late counts as attended).', href: '/reports?tab=attendance' }),
    thresholdKpi('assignmentCompletion', { key: 'assignments', label: 'Assignment completion', value: assignments.totals.completionRate, unit: 'percent', description: 'Submissions ÷ expected, for assignments already due this term.', subLabel: assignments.totals.overdue > 0 ? `${assignments.totals.overdue} with work outstanding` : undefined, href: '/reports?tab=assignments' }),
    thresholdKpi('markCompletion', { key: 'marks', label: 'Marks entered', value: marks.totals.completionRate, unit: 'percent', description: 'Marks entered or recorded absent for the subjects you teach.', subLabel: marks.totals.missing > 0 ? `${marks.totals.missing} missing` : undefined, href: '/reports?tab=marks' }),
    kpi({ key: 'attention', label: 'Students needing attention', value: hasClasses ? attention.totalFlagged : null, unit: 'count', description: 'Students with a low average, two or more failing subjects, high absence or a sharp decline.', subLabel: attention.multiRisk > 0 ? `${attention.multiRisk} with several concerns` : undefined, status: attention.totalFlagged > 0 ? 'watch' : 'healthy', href: '/reports?tab=students' }),
  ]

  const insights: ReportInsight[] = compact([
    passRateInsight(teaching.totals.passRate, weakest ? `${weakest.subject} (${weakest.className})` : null, '/reports?tab=teaching'),
    markCompletionInsight(marks.totals.completionRate, marks.totals.missing, '/reports?tab=marks'),
    ...teaching.subjects.filter((s) => s.spread === 'class-wide').slice(0, 2).map((s): ReportInsight => ({
      key: `class-wide-${s.classId}-${s.subject}`, severity: 'watch',
      title: `${s.subject} in ${s.className}: whole class below pass`,
      detail: `Average ${s.average}% with a tight spread (SD ${s.stdDev}) — the topic, not a few students, needs revisiting.`,
      href: '/reports?tab=teaching',
    })),
    assignments.totals.overdue > 0
      ? { key: 'assignments-outstanding', severity: 'info', title: `${assignments.totals.overdue} assignment${assignments.totals.overdue === 1 ? ' has' : 's have'} outstanding work`, detail: 'The due date has passed and not every student has submitted.', href: '/reports?tab=assignments' }
      : null,
  ])

  return {
    key: 'academic-overview',
    title: 'Teaching overview',
    scope: { academicYear, term, description: 'Your classes (form teacher) and the subjects you teach.' },
    kpis,
    insights: sortInsights(insights),
    generatedAt: new Date().toISOString(),
  }
}

export async function getAcademicAttention(uid: string, academicYear: string, term: number): Promise<AttentionItem[]> {
  const [attention, marks, assignments, readiness] = await Promise.all([
    getStudentAttention(uid, academicYear, term),
    getMarkCompletion(academicYear, term, { kind: 'teacher', teacherUid: uid }),
    getAssignmentReport(uid, academicYear, term),
    getExamReadiness(uid, academicYear, term),
  ])
  const week = readiness.rows.filter((r) => r.daysAway <= 7).length
  const items: AttentionItem[] = [
    { key: 'marks-missing', severity: marks.totals.completionRate !== null && marks.totals.completionRate < 75 ? 'critical' : 'watch', label: 'Marks still to enter', count: marks.totals.missing, href: '/exams' },
    { key: 'students-multi', severity: 'critical', label: 'Students with several concerns', count: attention.multiRisk, href: '/reports?tab=students' },
    { key: 'students-failing', severity: 'watch', label: 'Students below the pass mark', count: attention.counts.LOW_AVERAGE, href: '/reports?tab=students' },
    { key: 'students-absence', severity: 'watch', label: 'Students with repeated absence', count: attention.counts.ABSENCE, href: '/reports?tab=students' },
    { key: 'students-declining', severity: 'watch', label: 'Students whose results are declining', count: attention.counts.DECLINING, href: '/reports?tab=students' },
    { key: 'assignments-outstanding', severity: 'info', label: 'Assignments with work outstanding', count: assignments.totals.overdue, href: '/reports?tab=assignments' },
    { key: 'exams-this-week', severity: 'info', label: 'Exams in the next 7 days', count: week, href: '/reports?tab=readiness' },
  ]
  const order = { critical: 0, watch: 1, info: 2, positive: 3 } as const
  return items.filter((i) => (i.count ?? 0) > 0).sort((a, b) => order[a.severity] - order[b.severity])
}

