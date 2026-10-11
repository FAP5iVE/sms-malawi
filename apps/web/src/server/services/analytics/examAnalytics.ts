/**
 * examAnalytics.ts — examination workflow reporting.
 *
 * Mark completion is derived from the real exam ↔ class ↔ roster relationship:
 *   expected = ACTIVE students on the exam's class roster (current roster),
 *   entered / absent / finalised = ExamMark rows.
 * so "marks pending" is a count of missing MARKS, not of exams (the legacy
 * getExamOfficerReport counted exams). MANEB national exams are excluded: their
 * results are imported from MANEB, not entered by teachers.
 *
 * Scope: school-wide for callers holding exam.viewSchoolAnalytics; a teacher
 * (exam.viewClassAnalytics only) sees just the (class, subject) pairs they are
 * assigned to — the same assignment rule examService enforces for mark entry.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { AttentionItem, ReportInsight, ReportSectionData } from '@shared/types/reporting'
import type {
  ApiExamPipeline,
  ApiMarkCompletion,
  ApiMarkCompletionRow,
} from '@shared/types/reporting-exams'
import { getTeacherSubjectAssignments } from '@/server/services/classService'
import {
  EXAM_STAGES,
  buildCompletionRow,
  classifyBlocker,
  groupCompletion,
} from './examLogic'
import { kpi, thresholdKpi, ratioPct, mean } from '@/server/services/reporting/kpi'
import { compact, markCompletionInsight, sortInsights } from '@/server/services/reporting/insights'

export type ExamScope = { kind: 'school' } | { kind: 'teacher'; teacherUid: string }

const MANEB_TYPES = ['MANEB_JCE', 'MANEB_MSCE'] as const

interface LoadedRows {
  rows: ApiMarkCompletionRow[]
  updatedAt: Map<string, Date>
}

async function loadRows(academicYear: string, term: number, scope: ExamScope): Promise<LoadedRows> {
  const exams = await prisma.exam.findMany({
    where: { academicYear, term, type: { notIn: [...MANEB_TYPES] } },
    select: {
      id: true, title: true, subject: true, type: true, classId: true, status: true, date: true, updatedAt: true,
      class: { select: { name: true, form: true } },
    },
    orderBy: { date: 'desc' },
  })

  let scoped = exams
  if (scope.kind === 'teacher') {
    const pairs = await getTeacherSubjectAssignments(scope.teacherUid, academicYear)
    scoped = exams.filter((e) => pairs.has(`${e.classId}|${e.subject}`))
  }
  if (scoped.length === 0) return { rows: [], updatedAt: new Map() }

  const examIds = scoped.map((e) => e.id)
  const classIds = [...new Set(scoped.map((e) => e.classId))]

  const [roster, markGroups, timing, assignments] = await Promise.all([
    prisma.student.groupBy({
      by: ['classId'],
      where: { status: 'ACTIVE', classId: { in: classIds } },
      _count: { _all: true },
    }),
    prisma.examMark.groupBy({
      by: ['examId', 'absent', 'isDraft'],
      where: { examId: { in: examIds }, OR: [{ absent: true }, { mark: { not: null } }] },
      _count: { _all: true },
    }),
    prisma.examMark.groupBy({
      by: ['examId'],
      where: { examId: { in: examIds } },
      _max: { finalizedAt: true },
    }),
    prisma.classSubjectAssignment.findMany({
      where: { academicYear, classId: { in: classIds } },
      select: { classId: true, subject: true, teacherUid: true },
    }),
  ])

  const teacherUids = [...new Set(assignments.map((a) => a.teacherUid))]
  const staff = await prisma.staffProfile.findMany({
    where: { uid: { in: teacherUids } },
    select: { uid: true, firstName: true, lastName: true },
  })
  const staffName = new Map<string, string>(staff.map((s) => [s.uid, `${s.firstName} ${s.lastName}`]))
  const teacherOf = new Map<string, string>(assignments.map((a) => [`${a.classId}|${a.subject}`, a.teacherUid]))
  const rosterOf = new Map<string, number>(roster.map((r) => [r.classId ?? '', r._count._all]))
  const lastFinal = new Map<string, Date | null>(timing.map((t) => [t.examId, t._max.finalizedAt]))

  const entered = new Map<string, number>()
  const absent = new Map<string, number>()
  const finalised = new Map<string, number>()
  for (const g of markGroups) {
    const n = g._count._all
    const target = g.absent ? absent : entered
    target.set(g.examId, (target.get(g.examId) ?? 0) + n)
    if (!g.isDraft) finalised.set(g.examId, (finalised.get(g.examId) ?? 0) + n)
  }

  const rows = scoped.map((e) => {
    const teacherUid = teacherOf.get(`${e.classId}|${e.subject}`) ?? null
    return buildCompletionRow({
      exam: {
        id: e.id, title: e.title, subject: e.subject, type: e.type, classId: e.classId,
        className: e.class.name, form: e.class.form, status: e.status, date: e.date,
      },
      teacherUid,
      teacher: teacherUid ? (staffName.get(teacherUid) ?? null) : null,
      expected: rosterOf.get(e.classId) ?? 0,
      entered: entered.get(e.id) ?? 0,
      absent: absent.get(e.id) ?? 0,
      finalised: finalised.get(e.id) ?? 0,
      lastFinalisedAt: lastFinal.get(e.id) ?? null,
    })
  })
  rows.sort((a, b) => (a.completionRate ?? 101) - (b.completionRate ?? 101) || b.missing - a.missing)

  return { rows, updatedAt: new Map<string, Date>(scoped.map((e) => [e.id, e.updatedAt])) }
}

function totalsOf(rows: readonly ApiMarkCompletionRow[]) {
  const expected = rows.reduce((s, r) => s + r.expected, 0)
  const entered = rows.reduce((s, r) => s + r.entered, 0)
  const absent = rows.reduce((s, r) => s + r.absent, 0)
  const missing = rows.reduce((s, r) => s + r.missing, 0)
  return { exams: rows.length, expected, entered, absent, missing, completionRate: ratioPct(expected - missing, expected) }
}

export async function getMarkCompletion(
  academicYear: string,
  term: number,
  scope: ExamScope,
): Promise<ApiMarkCompletion> {
  const { rows } = await loadRows(academicYear, term, scope)
  return {
    academicYear,
    term,
    totals: totalsOf(rows),
    byClass: groupCompletion(rows, (r) => ({ key: r.classId, label: r.className })),
    bySubject: groupCompletion(rows, (r) => ({ key: r.subject, label: r.subject })),
    byTeacher: groupCompletion(rows, (r) => ({ key: r.teacherUid ?? 'unassigned', label: r.teacher ?? 'No teacher assigned' })),
    rows,
    excludesManeb: true,
  }
}

export async function getExamPipeline(
  academicYear: string,
  term: number,
  scope: ExamScope,
): Promise<ApiExamPipeline> {
  const { rows, updatedAt } = await loadRows(academicYear, term, scope)
  const now = new Date()
  const counts = new Map<string, number>()
  rows.forEach((r) => counts.set(r.status, (counts.get(r.status) ?? 0) + 1))

  const blockers = rows
    .map((r) => classifyBlocker(r, now, updatedAt.get(r.examId) ?? null))
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => (b.daysWaiting ?? 0) - (a.daysWaiting ?? 0))

  return {
    academicYear,
    term,
    stages: EXAM_STAGES.map((s) => ({ key: s.key, label: s.label, count: counts.get(s.key) ?? 0 })),
    total: rows.length,
    blockers,
  }
}

export async function getExamOverview(
  academicYear: string,
  term: number,
  scope: ExamScope,
): Promise<ReportSectionData> {
  const [completion, pipeline] = await Promise.all([
    getMarkCompletion(academicYear, term, scope),
    getExamPipeline(academicYear, term, scope),
  ])
  const stage = (k: string) => pipeline.stages.find((s) => s.key === k)?.count ?? 0
  const t = completion.totals
  const turnaround = mean(completion.rows.map((r) => r.turnaroundDays).filter((d): d is number => d !== null))
  const released = stage('RESULTS_RELEASED')

  const kpis = [
    kpi({ key: 'exams', label: 'Exams this term', value: pipeline.total, unit: 'count', description: 'Internal exams, tests and assessments scheduled for the term (MANEB national exams excluded).', href: '/exams' }),
    thresholdKpi('markCompletion', {
      key: 'markCompletion', label: 'Marks entered', value: t.completionRate, unit: 'percent',
      description: 'Marks entered or recorded absent, divided by the marks expected (active students on each exam’s class roster).',
      subLabel: t.expected > 0 ? `${(t.expected - t.missing).toLocaleString('en-US')} of ${t.expected.toLocaleString('en-US')}` : undefined,
      href: '/reports?tab=completion',
    }),
    kpi({ key: 'missingMarks', label: 'Marks missing', value: t.expected > 0 ? t.missing : null, unit: 'count', description: 'Expected marks that are neither entered nor marked absent.', status: t.missing > 0 ? 'watch' : 'healthy', href: '/reports?tab=completion' }),
    kpi({ key: 'awaitingApproval', label: 'Awaiting approval', value: stage('MARKS_FINAL'), unit: 'count', description: 'Exams with finalised marks waiting for exam-officer results approval.', status: stage('MARKS_FINAL') > 0 ? 'watch' : 'healthy', href: '/exams' }),
    kpi({ key: 'awaitingRelease', label: 'Awaiting release', value: stage('RESULTS_APPROVED'), unit: 'count', description: 'Approved results waiting for high-rank release authorisation.', status: stage('RESULTS_APPROVED') > 0 ? 'watch' : 'healthy', href: '/exams' }),
    kpi({ key: 'released', label: 'Results released', value: ratioPct(released, pipeline.total), unit: 'percent', description: 'Exams whose results have been released, as a share of the term’s exams.', subLabel: `${released} of ${pipeline.total}` }),
    kpi({ key: 'blocked', label: 'Exams blocked', value: pipeline.blockers.length, unit: 'count', description: 'Exams that are not moving to the next stage of the workflow.', status: pipeline.blockers.length > 0 ? 'watch' : 'healthy', href: '/reports?tab=completion' }),
    kpi({ key: 'turnaround', label: 'Marking turnaround', value: turnaround, unit: 'days', description: 'Mean days from exam date to final marks, over fully finalised exams.' }),
  ]

  const worst = completion.byClass.find((c) => c.missing > 0)
  const insights: ReportInsight[] = compact([
    markCompletionInsight(t.completionRate, t.missing, '/reports?tab=completion'),
    worst
      ? { key: 'worst-class', severity: 'info' as const, title: `${worst.label} has the most marks outstanding`, detail: `${worst.missing} marks missing (${worst.completionRate ?? 0}% complete).`, href: '/reports?tab=completion' }
      : null,
  ])

  return {
    key: 'exam-overview',
    title: 'Examination status',
    scope: {
      academicYear, term,
      description: scope.kind === 'school' ? 'All internal exams for the term.' : 'Exams for the classes and subjects you teach.',
    },
    kpis,
    insights: sortInsights(insights),
    generatedAt: new Date().toISOString(),
  }
}

export async function getExamAttention(
  academicYear: string,
  term: number,
  scope: ExamScope,
): Promise<AttentionItem[]> {
  const [completion, pipeline] = await Promise.all([
    getMarkCompletion(academicYear, term, scope),
    getExamPipeline(academicYear, term, scope),
  ])
  const byOwner = (o: string) => pipeline.blockers.filter((b) => b.owner === o).length
  const items: AttentionItem[] = [
    { key: 'marks-missing', severity: completion.totals.missing > 0 && (completion.totals.completionRate ?? 100) < 75 ? 'critical' : 'watch', label: 'Marks still to be entered', count: completion.totals.missing, detail: `${byOwner('teacher')} exams waiting on teachers`, href: '/reports?tab=completion' },
    { key: 'approval', severity: 'watch', label: 'Exams awaiting results approval', count: pipeline.stages.find((s) => s.key === 'MARKS_FINAL')?.count ?? 0, href: '/exams' },
    { key: 'release', severity: 'info', label: 'Exams awaiting release authorisation', count: pipeline.stages.find((s) => s.key === 'RESULTS_APPROVED')?.count ?? 0, href: '/exams' },
    { key: 'stalled', severity: 'watch', label: 'Past exams not moved to marks entry', count: pipeline.blockers.filter((b) => b.reason.startsWith('Exam date has passed')).length, href: '/exams' },
  ]
  const order = { critical: 0, watch: 1, info: 2, positive: 3 } as const
  return items.filter((i) => (i.count ?? 0) > 0).sort((a, b) => order[a.severity] - order[b.severity])
}
