/**
 * studentAnalytics.ts — a student's own reports.
 *
 * Self-scoped by construction: callers pass the Student.id resolved from the
 * authenticated Firebase uid, and no endpoint accepts a student id. Academic
 * results (term average, position, subject scores, class average) pass through
 * the same fee gate as the results screen — a term whose invoice still has a
 * balance is reported only as "withheld", never with its figures.
 */
import 'server-only'
import { addDays } from 'date-fns'
import { prisma } from '@/lib/prisma'
import type { AttentionItem, ReportInsight, ReportSectionData } from '@shared/types/reporting'
import type {
  ApiStudentAssignments, ApiStudentAttendance, ApiStudentFees, ApiStudentLibrary, ApiStudentProgress,
  ApiStudentProgressTerm,
} from '@shared/types/reporting-student'
import { checkBalanceGate } from '@/server/services/feeService'
import { getPassMarkThreshold } from '@/server/services/gradeService'
import { getTermDateRange } from '@/server/services/attendanceService'
import { aggregateWeeks, attendanceRate } from './attendanceLogic'
import { assignmentStatus, assignmentTotals, parseSubjectResults, subjectRows } from './studentLogic'
import { daysBetween, kpi, previousPeriod, ratioPct, round, thresholdKpi } from '@/server/services/reporting/kpi'
import { compact, sortInsights } from '@/server/services/reporting/insights'

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

interface StudentContext {
  id: string
  classId: string | null
  form: number | null
}

async function loadContext(studentId: string): Promise<StudentContext> {
  const s = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { id: true, classId: true, class: { select: { form: true } } },
  })
  return { id: s.id, classId: s.classId, form: s.class?.form ?? null }
}

const passMarkFor = (form: number | null) =>
  getPassMarkThreshold(form !== null && form >= 3 ? 'INTERNAL_F3F4' : 'INTERNAL_F1F2')

function gradeLabel(r: { gradingTrack: string | null; aggregatePoints: number | null; grade: string }): string {
  return r.gradingTrack === 'MSCE' ? (r.aggregatePoints != null ? `${r.aggregatePoints} pts` : '—') : r.grade || '—'
}

export async function getStudentProgress(studentId: string, academicYear: string, term: number): Promise<ApiStudentProgress> {
  const ctx = await loadContext(studentId)
  const passMark = await passMarkFor(ctx.form)

  const results = await prisma.termResult.findMany({
    where: { studentId },
    select: {
      academicYear: true, term: true, classId: true, average: true, grade: true, aggregatePoints: true,
      gradingTrack: true, classPosition: true, classTotal: true, passStatus: true, subjectResults: true,
    },
    orderBy: [{ academicYear: 'asc' }, { term: 'asc' }],
  })

  const gates = await Promise.all(results.map((r) => checkBalanceGate(studentId, r.term, r.academicYear)))
  const open = results.filter((_, i) => gates[i])
  const withheld = results.filter((_, i) => !gates[i]).map((r) => ({ academicYear: r.academicYear, term: r.term }))

  const terms: ApiStudentProgressTerm[] = open.map((r) => ({
    academicYear: r.academicYear,
    term: r.term,
    label: `T${r.term} ${r.academicYear}`,
    average: round(num(r.average), 1),
    grade: gradeLabel(r),
    aggregatePoints: r.aggregatePoints,
    gradingTrack: r.gradingTrack,
    position: r.classPosition > 0 ? r.classPosition : null,
    classTotal: r.classTotal > 0 ? r.classTotal : null,
    passStatus: r.passStatus,
  }))

  const currentRow = open.find((r) => r.academicYear === academicYear && r.term === term) ?? null
  const currentWithheld = withheld.some((w) => w.academicYear === academicYear && w.term === term)

  const prev = previousPeriod(academicYear, term)
  const prevRow = open.find((r) => r.academicYear === prev.academicYear && r.term === prev.term) ?? null

  let classAverage: number | null = null
  if (currentRow) {
    const siblings = await prisma.termResult.findMany({
      where: { classId: currentRow.classId, academicYear, term },
      select: { average: true },
    })
    classAverage = siblings.length > 0 ? round(siblings.reduce((s, r) => s + num(r.average), 0) / siblings.length, 1) : null
  }

  return {
    academicYear,
    term,
    passMark,
    terms,
    withheldTerms: withheld,
    current: terms.find((t) => t.academicYear === academicYear && t.term === term) ?? null,
    classAverage,
    subjects: currentRow
      ? subjectRows(parseSubjectResults(currentRow.subjectResults), prevRow ? parseSubjectResults(prevRow.subjectResults) : null, passMark)
      : [],
    currentWithheld,
  }
}

export async function getStudentAssignments(studentId: string, academicYear: string, term: number): Promise<ApiStudentAssignments> {
  const ctx = await loadContext(studentId)
  const empty: ApiStudentAssignments = {
    academicYear, term,
    totals: { total: 0, submitted: 0, late: 0, pending: 0, overdue: 0, completionRate: null },
    rows: [],
  }
  if (!ctx.classId) return empty
  const { start, end } = getTermDateRange(academicYear, term)
  const now = new Date()

  const assignments = await prisma.assignment.findMany({
    where: { classId: ctx.classId, dueDate: { gte: start, lte: end } },
    select: {
      id: true, title: true, subject: true, dueDate: true,
      submissions: { where: { studentId }, select: { status: true, submittedAt: true } },
    },
    orderBy: { dueDate: 'desc' },
  })

  const rows = assignments.map((a) => {
    const sub = a.submissions[0] ?? null
    return {
      assignmentId: a.id, title: a.title, subject: a.subject, dueDate: a.dueDate.toISOString(),
      status: assignmentStatus(sub, a.dueDate, now),
      submittedAt: sub && sub.status !== 'MISSING' ? sub.submittedAt.toISOString() : null,
    }
  })
  return { academicYear, term, totals: assignmentTotals(rows.map((r) => r.status)), rows }
}

export async function getStudentAttendance(studentId: string, academicYear: string, term: number): Promise<ApiStudentAttendance> {
  const { start, end } = getTermDateRange(academicYear, term)
  const records = await prisma.attendance.findMany({
    where: { studentId, date: { gte: start, lte: end } },
    select: { date: true, status: true },
    orderBy: { date: 'desc' },
  })
  const count = (s: string) => records.filter((r) => r.status === s).length
  const present = count('PRESENT')
  const late = count('LATE')
  const absent = count('ABSENT')
  return {
    academicYear, term, present, late, absent,
    recorded: records.length,
    attendanceRate: attendanceRate(present, late, absent),
    weekly: aggregateWeeks(records.map((r) => ({ date: r.date, status: r.status, count: 1 }))),
    recentAbsences: records.filter((r) => r.status === 'ABSENT').slice(0, 8).map((r) => r.date.toISOString()),
  }
}

export async function getStudentLibrary(studentId: string, academicYear: string): Promise<ApiStudentLibrary> {
  const now = new Date()
  const { start } = getTermDateRange(academicYear, 1)
  const [open, borrowedThisYear, fines] = await Promise.all([
    prisma.borrowing.findMany({
      where: { studentId, returnedAt: null, status: { not: 'LOST' } },
      select: { id: true, issuedAt: true, dueDate: true, book: { select: { title: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.borrowing.count({ where: { studentId, issuedAt: { gte: start } } }),
    prisma.libraryFine.aggregate({
      where: { studentId, status: 'PENDING' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ])
  const loans = open.map((o) => ({
    borrowingId: o.id,
    bookTitle: o.book.title,
    issuedAt: o.issuedAt.toISOString(),
    dueDate: o.dueDate.toISOString(),
    daysOverdue: Math.max(0, daysBetween(o.dueDate, now)),
  }))
  return {
    activeLoans: loans.length,
    overdueLoans: loans.filter((l) => l.daysOverdue > 0).length,
    loans,
    borrowedThisYear,
    finesPendingAmount: num(fines._sum.amount),
    finesPendingCount: fines._count._all,
  }
}

export async function getStudentFees(studentId: string, academicYear: string): Promise<ApiStudentFees> {
  const now = new Date()
  const invoices = await prisma.invoice.findMany({
    where: { studentId, academicYear },
    select: { id: true, term: true, totalAmount: true, paidAmount: true, balance: true, status: true, dueDate: true },
    orderBy: { term: 'asc' },
  })
  // InstallmentPlan carries only invoiceId (no Prisma relation on Invoice), so look plans up by id.
  const plans = invoices.length
    ? await prisma.installmentPlan.findMany({
        where: { invoiceId: { in: invoices.map((i) => i.id) } },
        select: { installments: { where: { status: { not: 'PAID' } }, select: { dueDate: true, amount: true }, orderBy: { dueDate: 'asc' }, take: 1 } },
      })
    : []
  const rows = invoices.map((i) => {
    const balance = num(i.balance)
    return {
      term: i.term, total: num(i.totalAmount), paid: num(i.paidAmount), balance, status: i.status,
      dueDate: i.dueDate.toISOString(), overdue: balance > 0 && i.dueDate.getTime() < now.getTime(),
    }
  })
  const next = plans
    .flatMap((p) => p.installments)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]
  const invoiced = rows.reduce((s, r) => s + r.total, 0)
  const paid = rows.reduce((s, r) => s + r.paid, 0)
  return {
    academicYear,
    invoiced, paid,
    balance: rows.reduce((s, r) => s + r.balance, 0),
    overdue: rows.filter((r) => r.overdue).reduce((s, r) => s + r.balance, 0),
    paidPct: ratioPct(paid, invoiced),
    invoices: rows,
    nextInstallment: next ? { dueDate: next.dueDate.toISOString(), amount: num(next.amount) } : null,
  }
}

async function upcomingExamCount(classId: string | null, days: number): Promise<number> {
  if (!classId) return 0
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return prisma.exam.count({
    where: {
      classId, status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
      type: { notIn: ['MANEB_JCE', 'MANEB_MSCE'] }, date: { gte: today, lte: addDays(today, days) },
    },
  })
}

export async function getStudentOverview(studentId: string, academicYear: string, term: number): Promise<ReportSectionData> {
  const ctx = await loadContext(studentId)
  const [progress, attendance, assignments, library, fees, exams14, placement] = await Promise.all([
    getStudentProgress(studentId, academicYear, term),
    getStudentAttendance(studentId, academicYear, term),
    getStudentAssignments(studentId, academicYear, term),
    getStudentLibrary(studentId, academicYear),
    getStudentFees(studentId, academicYear),
    upcomingExamCount(ctx.classId, 14),
    prisma.universityPlacement.findFirst({
      where: { studentId }, orderBy: { updatedAt: 'desc' },
      select: { status: true, placedUniversityName: true },
    }),
  ])

  const held = progress.currentWithheld
  const heldNote = 'Results are released once the term’s fee balance is cleared.'
  const cur = progress.current

  const kpis = [
    thresholdKpi('average', {
      key: 'average', label: 'Term average', value: cur ? cur.average : null, unit: 'percent',
      description: 'Your overall average for the selected term, from released results.',
      subLabel: held ? heldNote : cur ? `${cur.grade}${progress.classAverage !== null ? ` · class ${progress.classAverage}%` : ''}` : 'No released results yet',
      href: '/reports?tab=progress',
    }),
    kpi({
      key: 'position', label: 'Class position', value: cur && cur.position !== null && cur.classTotal !== null ? `${cur.position} of ${cur.classTotal}` : null,
      unit: 'text', description: 'Your rank in class for the selected term.', href: '/reports?tab=progress',
    }),
    thresholdKpi('attendanceRate', {
      key: 'attendance', label: 'Attendance', value: attendance.attendanceRate, unit: 'percent',
      description: 'Present plus late days ÷ recorded days this term.',
      subLabel: attendance.recorded > 0 ? `${attendance.absent} absent · ${attendance.late} late` : undefined, href: '/reports?tab=attendance',
    }),
    kpi({
      key: 'feeBalance', label: 'Fee balance', value: fees.balance, unit: 'mwk',
      description: 'Outstanding balance across this year’s invoices.',
      subLabel: fees.overdue > 0 ? `MWK ${Math.round(fees.overdue).toLocaleString('en-US')} overdue` : undefined,
      status: fees.overdue > 0 ? 'critical' : fees.balance > 0 ? 'watch' : 'healthy', href: '/reports?tab=fees',
    }),
    thresholdKpi('assignmentCompletion', {
      key: 'assignments', label: 'Assignments handed in', value: assignments.totals.completionRate, unit: 'percent',
      description: 'Submitted ÷ assignments already due this term.',
      subLabel: assignments.totals.overdue > 0 ? `${assignments.totals.overdue} overdue` : assignments.totals.pending > 0 ? `${assignments.totals.pending} still to come` : undefined,
      href: '/reports?tab=assignments',
    }),
    kpi({ key: 'exams', label: 'Exams (14 days)', value: exams14, unit: 'count', description: 'Exams scheduled for your class in the next two weeks.' }),
    kpi({
      key: 'books', label: 'Books on loan', value: library.activeLoans, unit: 'count', description: 'Library books you have borrowed and not yet returned.',
      subLabel: library.overdueLoans > 0 ? `${library.overdueLoans} overdue` : undefined,
      status: library.overdueLoans > 0 ? 'watch' : 'neutral', href: '/reports?tab=library',
    }),
    ...(placement
      ? [kpi({
          key: 'placement', label: 'Placement', unit: 'text', value: placement.status === 'CONFIRMED' ? (placement.placedUniversityName ?? 'Confirmed') : placement.status === 'PENDING_APPROVAL' ? 'Claim under review' : 'Claim not approved',
          description: 'Status of your university placement record.', href: '/placements',
        })]
      : []),
  ]

  const weakest = progress.subjects.filter((s) => !s.pass).slice(0, 3).map((s) => s.subject)
  const insights: ReportInsight[] = compact([
    held ? { key: 'results-withheld', severity: 'info', title: 'Results are being held', detail: heldNote, href: '/reports?tab=fees' } : null,
    weakest.length > 0
      ? { key: 'subjects-below-pass', severity: 'watch', title: `Below the pass mark in ${weakest.join(', ')}`, detail: 'Focus revision on these subjects first.', href: '/reports?tab=progress' }
      : null,
    attendance.attendanceRate !== null && attendance.attendanceRate < 85
      ? { key: 'attendance-low', severity: 'watch', title: `Attendance is ${attendance.attendanceRate}%`, detail: 'Missing lessons is one of the biggest drivers of falling marks.', href: '/reports?tab=attendance' }
      : null,
    assignments.totals.overdue > 0
      ? { key: 'assignments-overdue', severity: 'watch', title: `${assignments.totals.overdue} assignment${assignments.totals.overdue === 1 ? ' is' : 's are'} overdue`, detail: 'Hand them in or speak to your teacher.', href: '/reports?tab=assignments' }
      : null,
  ])

  return {
    key: 'student-overview',
    title: 'My overview',
    scope: { academicYear, term, description: 'Your own record only.' },
    kpis,
    insights: sortInsights(insights),
    generatedAt: new Date().toISOString(),
  }
}

export async function getStudentAttention(studentId: string, academicYear: string, term: number): Promise<AttentionItem[]> {
  const ctx = await loadContext(studentId)
  const [attendance, assignments, library, fees, exams7, progress] = await Promise.all([
    getStudentAttendance(studentId, academicYear, term),
    getStudentAssignments(studentId, academicYear, term),
    getStudentLibrary(studentId, academicYear),
    getStudentFees(studentId, academicYear),
    upcomingExamCount(ctx.classId, 7),
    getStudentProgress(studentId, academicYear, term),
  ])
  const items: AttentionItem[] = [
    { key: 'fees-overdue', severity: 'critical', label: 'Overdue fee balance', count: fees.overdue > 0 ? 1 : 0, detail: `MWK ${Math.round(fees.overdue).toLocaleString('en-US')}`, href: '/reports?tab=fees' },
    { key: 'results-withheld', severity: 'watch', label: 'Results held until fees are cleared', count: progress.currentWithheld ? 1 : 0, href: '/reports?tab=fees' },
    { key: 'assignments-overdue', severity: 'watch', label: 'Overdue assignments', count: assignments.totals.overdue, href: '/reports?tab=assignments' },
    { key: 'books-overdue', severity: 'watch', label: 'Library books overdue', count: library.overdueLoans, href: '/reports?tab=library' },
    { key: 'attendance-low', severity: 'watch', label: 'Attendance below 85%', count: attendance.attendanceRate !== null && attendance.attendanceRate < 85 ? 1 : 0, href: '/reports?tab=attendance' },
    { key: 'exams-week', severity: 'info', label: 'Exams in the next 7 days', count: exams7, href: '/exams' },
    { key: 'fines', severity: 'info', label: 'Library fines to pay', count: library.finesPendingCount, href: '/reports?tab=library' },
  ]
  const order = { critical: 0, watch: 1, info: 2, positive: 3 } as const
  return items.filter((i) => (i.count ?? 0) > 0).sort((a, b) => order[a.severity] - order[b.severity])
}
