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
  ApiExamAuditEvent,
  ApiExamPipeline,
  ApiExamWorkflow,
  ApiExamWorkflowRow,
  ApiManebStatus,
  ApiMarkCompletion,
  ApiMarkCompletionRow,
  ExamStageKey,
} from '@shared/types/reporting-exams'
import { getTeacherSubjectAssignments } from '@/server/services/classService'
import {
  EXAM_STAGES,
  buildCompletionRow,
  classifyBlocker,
  groupCompletion,
} from './examLogic'
import {
  ACTION_LABEL, DELAY_AFTER_DAYS, SENSITIVE_ACTIONS, WORKFLOW_ACTIONS,
  assessDelay, buildTimeline, summariseManeb, summariseStages, termReleaseReadiness, workByOwner,
  type AuditEvent, type MarkTiming,
} from './examWorkflowLogic'
import { kpi, thresholdKpi, ratioPct, mean } from '@/server/services/reporting/kpi'
import { compact, markCompletionInsight, sortInsights } from '@/server/services/reporting/insights'
import { enrichAttention, rankAttention } from './executiveLogic'

export type ExamScope = { kind: 'school' } | { kind: 'teacher'; teacherUid: string }

const MANEB_TYPES = ['MANEB_JCE', 'MANEB_MSCE'] as const

interface ExamMeta {
  type: string
  date: Date
  updatedAt: Date
}

interface LoadedRows {
  rows: ApiMarkCompletionRow[]
  updatedAt: Map<string, Date>
  meta: Map<string, ExamMeta>
  markTiming: Map<string, MarkTiming>
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
  if (scoped.length === 0) return { rows: [], updatedAt: new Map(), meta: new Map(), markTiming: new Map() }

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
      _min: { createdAt: true },
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

  return {
    rows,
    updatedAt: new Map<string, Date>(scoped.map((e) => [e.id, e.updatedAt])),
    meta: new Map<string, ExamMeta>(scoped.map((e) => [e.id, { type: String(e.type), date: e.date, updatedAt: e.updatedAt }])),
    markTiming: new Map<string, MarkTiming>(timing.map((t) => [t.examId, { firstMarkAt: t._min.createdAt ?? null, lastFinalisedAt: t._max.finalizedAt ?? null }])),
  }
}

const AUDIT_ROW_CAP = 20_000
const AUDIT_TRAIL_CAP = 100
const ROW_CAP = 500
const termKey = (academicYear: string, term: number) => `${academicYear}:T${term}`

/** Workflow audit entries for the loaded exams (and the whole-term release entry). Oldest first. */
async function loadAuditEvents(examIds: readonly string[], academicYear: string, term: number): Promise<AuditEvent[]> {
  if (examIds.length === 0) return []
  const rows = await prisma.auditLog.findMany({
    where: {
      entityType: 'Exam',
      action: { in: [...WORKFLOW_ACTIONS] },
      OR: [{ entityId: { in: [...examIds] } }, { entityId: termKey(academicYear, term) }],
    },
    select: { action: true, entityId: true, actorUid: true, actorRole: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: AUDIT_ROW_CAP,
  })
  return rows.map((r) => ({ action: r.action, entityId: r.entityId, at: r.createdAt, actorUid: r.actorUid, actorRole: r.actorRole }))
}

function timelinesFor(loaded: LoadedRows, events: readonly AuditEvent[], academicYear: string, term: number) {
  const termRelease = events.filter((e) => e.action === 'exam.term_results_released' && e.entityId === termKey(academicYear, term))
  const termReleaseAt = termRelease.length ? new Date(Math.max(...termRelease.map((e) => e.at.getTime()))) : null
  const byExam = new Map<string, AuditEvent[]>()
  for (const e of events) byExam.set(e.entityId, [...(byExam.get(e.entityId) ?? []), e])
  return new Map(
    loaded.rows.map((r) => {
      const m = loaded.meta.get(r.examId)
      return [
        r.examId,
        buildTimeline({
          exam: { type: m?.type ?? '', status: r.status, date: new Date(r.date), updatedAt: m?.updatedAt ?? new Date(r.date) },
          events: byExam.get(r.examId) ?? [],
          termReleaseAt,
          marks: loaded.markTiming.get(r.examId) ?? { firstMarkAt: null, lastFinalisedAt: null },
        }),
      ] as const
    }),
  )
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
  const loaded = await loadRows(academicYear, term, scope)
  const { rows } = loaded
  const now = new Date()
  const counts = new Map<string, number>()
  rows.forEach((r) => counts.set(r.status, (counts.get(r.status) ?? 0) + 1))

  // Days waiting come from the transition's audit entry where there is one, not from Exam.updatedAt.
  const timelines = timelinesFor(loaded, await loadAuditEvents(rows.map((r) => r.examId), academicYear, term), academicYear, term)

  const blockers = rows
    .map((r) => classifyBlocker(r, now, timelines.get(r.examId)?.stageEnteredAt ?? loaded.updatedAt.get(r.examId) ?? null))
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
    kpi({ key: 'awaitingApproval', label: 'Awaiting approval', value: stage('MARKS_FINAL'), unit: 'count', description: 'Exams with finalised marks waiting for exam-officer results approval.', status: stage('MARKS_FINAL') > 0 ? 'watch' : 'healthy', href: '/reports?tab=pipeline&status=MARKS_FINAL' }),
    kpi({ key: 'awaitingRelease', label: 'Awaiting release', value: stage('RESULTS_APPROVED'), unit: 'count', description: 'Approved results waiting for high-rank release authorisation.', status: stage('RESULTS_APPROVED') > 0 ? 'watch' : 'healthy', href: '/reports?tab=pipeline&status=RESULTS_APPROVED' }),
    kpi({ key: 'released', label: 'Results released', value: ratioPct(released, pipeline.total), unit: 'percent', description: 'Exams whose results have been released, as a share of the term’s exams.', subLabel: `${released} of ${pipeline.total}` }),
    kpi({ key: 'blocked', label: 'Exams blocked', value: pipeline.blockers.length, unit: 'count', description: 'Exams that are not moving to the next stage of the workflow.', status: pipeline.blockers.length > 0 ? 'watch' : 'healthy', href: '/reports?tab=pipeline' }),
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
  const stalledBlockers = pipeline.blockers.filter((b) => b.reason.startsWith('Exam date has passed'))
  const items: AttentionItem[] = [
    { key: 'marks-missing', severity: completion.totals.missing > 0 && (completion.totals.completionRate ?? 100) < 75 ? 'critical' : 'watch', label: 'Marks still to be entered', count: completion.totals.missing, detail: `${byOwner('teacher')} exams waiting on teachers`, href: '/reports?tab=completion' },
    { key: 'approval', severity: 'watch', label: 'Exams awaiting results approval', count: pipeline.stages.find((s) => s.key === 'MARKS_FINAL')?.count ?? 0, href: '/reports?tab=pipeline&status=MARKS_FINAL' },
    { key: 'release', severity: 'info', label: 'Exams awaiting release authorisation', count: pipeline.stages.find((s) => s.key === 'RESULTS_APPROVED')?.count ?? 0, href: '/reports?tab=pipeline&status=RESULTS_APPROVED' },
    { key: 'stalled', severity: 'watch', label: 'Past exams not moved to marks entry', count: stalledBlockers.length, ageDays: stalledBlockers.length > 0 ? Math.max(...stalledBlockers.map((b) => b.daysWaiting ?? 0)) : null, href: '/reports?tab=pipeline&status=SCHEDULED' },
  ]
  return enrichAttention(rankAttention(items))
}


// ─── Workflow report ─────────────────────────────────────────────────────────

export interface WorkflowFilters {
  classId?: string
  subject?: string
  teacherUid?: string
  status?: string
}

export interface WorkflowAccess {
  /** exam.viewExamAuditLog: may see who changed what. */
  audit: boolean
}

export async function getExamWorkflow(
  academicYear: string,
  term: number,
  scope: ExamScope,
  filters: WorkflowFilters = {},
  access: WorkflowAccess = { audit: false },
  now: Date = new Date(),
): Promise<ApiExamWorkflow> {
  const loaded = await loadRows(academicYear, term, scope)
  const events = await loadAuditEvents(loaded.rows.map((r) => r.examId), academicYear, term)
  const timelines = timelinesFor(loaded, events, academicYear, term)

  const all: ApiExamWorkflowRow[] = loaded.rows.map((r) => {
    const t = timelines.get(r.examId)
    const blocker = classifyBlocker(r, now, t?.stageEnteredAt ?? null)
    const delay = assessDelay(r.status, t?.stageEnteredAt ?? null, now)
    const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
    return {
      ...r,
      owner: blocker?.owner ?? null,
      nextAction: blocker?.reason ?? null,
      stageEnteredAt: iso(t?.stageEnteredAt),
      stageSource: t?.stageSource ?? 'updated_at',
      daysInStage: delay.daysInStage,
      delayed: delay.delayed,
      thresholdDays: delay.thresholdDays,
      marksStartedAt: iso(t?.marksStartedAt),
      finalisedAt: iso(t?.finalisedAt),
      approvedAt: iso(t?.approvedAt),
      releasedAt: iso(t?.releasedAt),
      unlockCount: t?.unlockCount ?? 0,
      correctionCount: t?.correctionCount ?? 0,
    }
  })

  const rows = all.filter(
    (r) =>
      (!filters.classId || r.classId === filters.classId) &&
      (!filters.subject || r.subject === filters.subject) &&
      (!filters.teacherUid || (filters.teacherUid === 'unassigned' ? r.teacherUid === null : r.teacherUid === filters.teacherUid)) &&
      (!filters.status || r.status === filters.status),
  )

  const expected = rows.reduce((s, r) => s + r.expected, 0)
  const entered = rows.reduce((s, r) => s + r.entered, 0)
  const absent = rows.reduce((s, r) => s + r.absent, 0)
  const missing = rows.reduce((s, r) => s + r.missing, 0)

  // Release readiness is a school-wide fact about the term's end-of-term exams, so it ignores the filters.
  const endTerm = scope.kind === 'school'
    ? all.filter((r) => loaded.meta.get(r.examId)?.type === 'END_TERM').map((r) => ({ className: r.className, status: r.status }))
    : null

  let audit: ApiExamAuditEvent[] | null = null
  let auditTruncated = false
  if (access.audit) {
    const shown = new Set(rows.map((r) => r.examId))
    const byId = new Map(all.map((r) => [r.examId, r]))
    const relevant = events
      .filter((e) => shown.has(e.entityId) || (e.action === 'exam.term_results_released' && !filters.classId && !filters.subject && !filters.teacherUid && !filters.status))
      .reverse()
    auditTruncated = relevant.length > AUDIT_TRAIL_CAP
    const actors = [...new Set(relevant.slice(0, AUDIT_TRAIL_CAP).map((e) => e.actorUid))]
    const staff = actors.length
      ? await prisma.staffProfile.findMany({ where: { uid: { in: actors } }, select: { uid: true, firstName: true, lastName: true } })
      : []
    const name = new Map<string, string>(staff.map((p) => [p.uid, `${p.firstName} ${p.lastName}`]))
    audit = relevant.slice(0, AUDIT_TRAIL_CAP).map((e) => {
      const r = byId.get(e.entityId)
      return {
        at: e.at.toISOString(),
        action: e.action,
        label: ACTION_LABEL[e.action] ?? e.action,
        sensitive: SENSITIVE_ACTIONS.has(e.action),
        exam: r ? r.title : e.action === 'exam.term_results_released' ? `All end-of-term exams, Term ${term}` : 'Exam',
        className: r?.className ?? null,
        subject: r?.subject ?? null,
        actorRole: e.actorRole,
        actor: name.get(e.actorUid) ?? null,
      }
    })
  }

  const stageSummary = summariseStages(EXAM_STAGES.map((s) => s.key), rows)
  const teacherOptions = new Map<string, string>()
  for (const r of all) teacherOptions.set(r.teacherUid ?? 'unassigned', r.teacher ?? 'No teacher assigned')

  return {
    generatedAt: now.toISOString(),
    academicYear,
    term,
    filters: { classId: filters.classId ?? null, subject: filters.subject ?? null, teacherUid: filters.teacherUid ?? null, status: filters.status ?? null },
    options: {
      classes: [...new Map(all.map((r) => [r.classId, r.className])).entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
      subjects: [...new Set(all.map((r) => r.subject))].sort(),
      teachers: [...teacherOptions.entries()].map(([uid, label]) => ({ uid, label })).sort((a, b) => a.label.localeCompare(b.label)),
      statuses: EXAM_STAGES.map((s) => ({ key: s.key, label: s.label })),
    },
    thresholds: { ...DELAY_AFTER_DAYS },
    totals: {
      exams: rows.length,
      expected,
      entered,
      absent,
      missing,
      completionRate: ratioPct(expected - missing, expected),
      delayed: rows.filter((r) => r.delayed).length,
      released: rows.filter((r) => r.status === 'RESULTS_RELEASED').length,
    },
    stages: EXAM_STAGES.map((s) => {
      const x = stageSummary.find((t) => t.key === s.key)
      return { key: s.key, label: s.label, count: x?.count ?? 0, delayed: x?.delayed ?? 0, avgDaysInStage: x?.avgDaysInStage ?? null, oldestDaysInStage: x?.oldestDaysInStage ?? null }
    }),
    byOwner: workByOwner(rows),
    byClass: groupCompletion(rows, (r) => ({ key: r.classId, label: r.className })),
    bySubject: groupCompletion(rows, (r) => ({ key: r.subject, label: r.subject })),
    byTeacher: groupCompletion(rows, (r) => ({ key: r.teacherUid ?? 'unassigned', label: r.teacher ?? 'No teacher assigned' })),
    rows: rows
      .sort((a, b) => Number(b.delayed) - Number(a.delayed) || (b.daysInStage ?? -1) - (a.daysInStage ?? -1) || a.title.localeCompare(b.title))
      .slice(0, ROW_CAP),
    rowsTruncated: rows.length > ROW_CAP,
    approximateStageTimes: rows.filter((r) => r.stageSource === 'updated_at').length,
    termRelease: endTerm ? termReleaseReadiness(endTerm) : null,
    audit,
    auditTruncated,
    excludesManeb: true,
  }
}

/** Form that sits each MANEB exam (JCE: Form 2, MSCE: Form 4), as the MANEB screens already label them. */
const MANEB_FORM: Record<string, number> = { JCE: 2, MSCE: 4 }

/**
 * MANEB records by exam type and status, with the candidates the school could
 * enter. External national-exam data, reported apart from school-entered marks.
 * Eligibility is today's roster, so it is only given for the current year.
 */
export async function getManebStatus(academicYear: string, opts: { isCurrentYear?: boolean } = {}): Promise<ApiManebStatus> {
  const records = await prisma.manebRecord.findMany({
    where: { academicYear },
    select: { examType: true, status: true, overallGrade: true },
  })
  const summary = summariseManeb(records.map((r) => ({ examType: String(r.examType), status: String(r.status), overallGrade: r.overallGrade })))
  const types = await Promise.all(
    summary.map(async (t) => {
      const form = MANEB_FORM[t.examType] ?? null
      const eligible = opts.isCurrentYear && form !== null
        ? await prisma.student.count({ where: { status: 'ACTIVE', class: { form } } })
        : null
      return { ...t, form, eligible, notRegistered: eligible === null ? null : Math.max(0, eligible - t.candidates) }
    }),
  )
  return { generatedAt: new Date().toISOString(), academicYear, source: 'external', types }
}
