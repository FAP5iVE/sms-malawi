/**
 * apps/web/src/server/services/analyticsService.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE (five functions) + NEW (three functions)
 * [R-PHASE]: R14 — Analytics & Reports Domain
 * [PURPOSE]: This file's other 25 functions are confirmed correct against
 *   the real schema and are unchanged. R14 rewrites the five that silently
 *   returned wrong numbers to real users, and adds the three functions
 *   backing permissions that the matrix grants but which had no
 *   implementation at any layer:
 *
 *   1. getHighRankFinancialSummary() — returned a hardcoded `payroll: 0`
 *      and excluded payroll from `net`, so high_rank (the MORE senior role)
 *      saw a silently wrong figure for the exact business question that
 *      getFinanceCashFlow() already answers correctly for `finance`. Both
 *      now derive payroll from the same real PayrollRun.totalNet query via
 *      a single shared helper (payrollForTerm), so the two can no longer
 *      drift apart.
 *   2. getLibraryInventoryHealth() — computed
 *      `borrowedCopies = totalCopies − availableCopies − overdueCount`.
 *      An overdue borrowing is a SUBSET of currently-borrowed copies, not a
 *      separate additive category, so subtracting it under-counted genuinely
 *      borrowed books. `lostCopies` was queried but never subtracted at all.
 *      Corrected to `totalCopies − availableCopies − lostCopies`, with
 *      overdueCount reported alongside as the informational subset it is.
 *   3. getFinanceBudgetVsActual() — grouped Budget by `department` and then
 *      looked that department string up in a map keyed by Expense.category,
 *      so the join matched essentially never and the function fell back to
 *      the stale cached Budget.spent column on virtually every real budget.
 *      Budget.category is now the same ExpenseCategory enum Expense uses
 *      (schema.prisma, same phase), so this groups by that real join key.
 *   4. getStudentPerformanceTrend() — computed attendancePct from
 *      TermResult.attendanceDays/absentDays, columns with no write path
 *      anywhere in the codebase and therefore guaranteed always 0.
 *      Repointed onto the real Attendance model R6 introduced, via
 *      attendanceService.getAttendanceSummaryForTerm() rather than a second
 *      independent query against the same table.
 *   5. getTeacherEffectivenessMatrix() — returned a hardcoded
 *      `subjectCount: 0`. Now counts the teacher's real distinct subjects
 *      from the TimetableSlot rows they are assigned to.
 *
 *   NEW: getFinanceScholarshipSummary() (report.viewScholarshipSummary),
 *   getSchoolAttendanceSummary() (report.viewAttendanceSummary) and
 *   getOwnAttendanceSummary() (report.viewOwnAttendance) — three
 *   permissions granted in the matrix with zero implementation anywhere in
 *   this module before R14.
 * [DEPENDS ON]: W/server/services/attendanceService.ts (R6 Attendance model),
 *   apps/web/prisma/schema.prisma (Budget.category enum, R14)
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { ExpenseCategory, ApplicationStatus } from '@prisma/client'
import { subDays, subMonths, startOfDay, endOfDay, format, startOfWeek, endOfWeek, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, startOfMonth, endOfMonth } from 'date-fns'
import { getAttendanceSummaryForTerm, getTermDateRange } from '@/server/services/attendanceService'
import { findUniversity } from '@shared/constants/universities'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface TimeSeriesPoint {
  label: string
  value: number
}

export interface DualSeriesPoint {
  label: string
  value: number
  value2: number
}

export interface CategoryBreakdown {
  category: string
  value: number
  pct: number
}

export interface ClassPerformanceStat {
  className: string
  form: number
  studentCount: number
  passRate: number
  average: number
  term: number
}

export interface SubjectAverageStat {
  subject: string
  average: number
  passRate: number
  studentCount: number
}

export interface TeacherEffectivenessRow {
  teacherUid: string
  teacherName: string
  department: string
  subjectCount: number
  avgStudentScore: number
  avgPassRate: number
  classesCount: number
}

export interface EnrollmentTrendPoint {
  month: string
  enrolled: number
  departed: number
  net: number
}

export interface ApplicationFunnelStage {
  stage: string
  count: number
  pct: number
}

export interface LibraryInventoryHealth {
  totalTitles: number
  totalCopies: number
  availableCopies: number
  borrowedCopies: number
  lostCopies: number
  overdueCount: number
  availabilityRate: number
}

export interface TopBorrowedBook {
  bookId: string
  title: string
  author: string
  category: string
  borrowCount: number
}

export interface StudentPerformancePoint {
  academicYear: string
  term: number
  average: number
  grade: string
  position: number | null
  classTotal: number
  passStatus: boolean
  attendancePct: number
}

export interface StudentSubjectScore {
  subject: string
  score: number
  grade: string
  maxMark: number
}

export interface StudentFeeStatement {
  invoiceId: string
  academicYear: string
  term: number
  totalAmount: number
  paidAmount: number
  balance: number
  status: string
  dueDate: string
  payments: { amount: number; method: string; paidAt: string }[]
}

export interface ManebSubjectResult {
  subject: string
  grade: string
}

export interface ManebResultSummary {
  candidateNo: string
  studentId: string
  examType: string
  overallGrade: string | null
  subjectGrades: ManebSubjectResult[]
  status: string
}

export interface ManebSchoolStat {
  examType: string
  total: number
  passCount: number
  passRate: number
  gradeDistribution: CategoryBreakdown[]
  subjectAverages: { subject: string; passCount: number; total: number; passRate: number }[]
}

export interface LoginTrendPoint {
  date: string
  successful: number
  failed: number
}

export interface ActivityHeatmapCell {
  hour: number
  dayOfWeek: number
  count: number
}

export interface CashFlowRow {
  academicYear: string
  term: number
  revenue: number
  expenses: number
  payroll: number
  net: number
}

export interface BudgetVsActualRow {
  /** ExpenseCategory enum member — the real Budget-to-Expense join key. */
  category: ExpenseCategory
  allocated: number
  spent: number
  utilisation: number
}

export interface ScholarshipSummaryRow {
  name: string
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'
  recipientCount: number
  totalDiscount: number
}

export interface ScholarshipSummary {
  academicYear: string
  activeScholarships: number
  recipientCount: number
  totalDiscountMwk: number
  byScholarship: ScholarshipSummaryRow[]
}

export interface AttendanceSummaryRow {
  classId: string
  className: string
  form: number
  studentCount: number
  daysPresent: number
  daysAbsent: number
  daysLate: number
  attendanceRate: number
}

export interface AttendanceSummary {
  academicYear: string
  term: number
  daysPresent: number
  daysAbsent: number
  daysLate: number
  attendanceRate: number
  byClass: AttendanceSummaryRow[]
}

export interface OwnAttendanceSummary {
  academicYear: string
  term: number
  daysPresent: number
  daysAbsent: number
  daysLate: number
  totalDays: number
  attendanceRate: number
}

export interface AssignmentCompletionRow {
  assignmentId: string
  title: string
  subject: string
  dueDate: string
  submitted: number
  total: number
  completionRate: number
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return Math.round((numerator / denominator) * 100 * 10) / 10
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10
}

function dateLabel(d: Date): string {
  return format(d, 'dd MMM')
}

function monthLabel(d: Date): string {
  return format(d, 'MMM yy')
}

/**
 * [R14] The calendar months each Malawian school term spans. A Malawi
 * academic year runs September–July, so Term 1 falls in the FIRST calendar
 * year named in an academicYear string ("2025/2026" → 2025) while Terms 2
 * and 3 fall in the second (→ 2026).
 */
const TERM_MONTHS: Readonly<Record<number, readonly number[]>> = {
  1: [9, 10, 11, 12],
  2: [1, 2, 3, 4],
  3: [5, 6, 7],
}

interface PayrollRunPeriod {
  month: number
  year: number
  totalNet: unknown
}

/**
 * [R14] Total completed payroll (PayrollRun.totalNet) falling inside a given
 * academic-year term.
 *
 * Extracted as a single shared helper because getFinanceCashFlow() and
 * getHighRankFinancialSummary() answer the SAME business question ("what did
 * we spend on payroll this term?") for two different roles — and before R14
 * only the first of them computed it at all, while the second returned a
 * hardcoded 0. Two independent copies of this arithmetic is exactly how the
 * two roles' answers drifted apart in the first place, so there is now one.
 */
function payrollForTerm(
  runs: readonly PayrollRunPeriod[],
  academicYear: string,
  term: number,
): number {
  const firstYear = Number.parseInt(academicYear.split('/')[0] ?? '', 10)
  if (Number.isNaN(firstYear)) return 0

  const months = TERM_MONTHS[term] ?? []
  const calendarYear = term === 1 ? firstYear : firstYear + 1

  return runs
    .filter((r) => r.year === calendarYear && months.includes(r.month))
    .reduce((sum, r) => sum + Number(r.totalNet), 0)
}

/** [R14] Every COMPLETED payroll run — the one source both cash-flow and
 *  financial-summary payroll figures are derived from. */
async function completedPayrollRuns(): Promise<PayrollRunPeriod[]> {
  return prisma.payrollRun.findMany({
    where: { status: 'COMPLETED' },
    select: { month: true, year: true, totalNet: true },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN ANALYTICS  (E1 — GAP-048)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Login success vs failure trend over the last N days.
 * Sourced from AuditLog where action is LOGIN_SUCCESS or LOGIN_FAILED.
 */
export async function getAdminLoginTrend(days = 30): Promise<LoginTrendPoint[]> {
  const since = startOfDay(subDays(new Date(), days - 1))
  const logs = await prisma.auditLog.findMany({
    where: {
      createdAt: { gte: since },
      action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] },
    },
    select: { action: true, createdAt: true },
  })

  const interval = eachDayOfInterval({ start: since, end: new Date() })
  return interval.map((day) => {
    const label = dateLabel(day)
    const dayStart = startOfDay(day).getTime()
    const dayEnd = endOfDay(day).getTime()
    const dayLogs = logs.filter((l) => {
      const t = new Date(l.createdAt).getTime()
      return t >= dayStart && t <= dayEnd
    })
    return {
      date: label,
      successful: dayLogs.filter((l) => l.action === 'LOGIN_SUCCESS').length,
      failed: dayLogs.filter((l) => l.action === 'LOGIN_FAILED').length,
    }
  })
}

/**
 * User activity heatmap: count of audit log entries per hour-of-day × day-of-week.
 * Returns 7 × 24 = 168 cells.
 */
export async function getAdminActivityHeatmap(days = 90): Promise<ActivityHeatmapCell[]> {
  const since = subDays(new Date(), days)
  const logs = await prisma.auditLog.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
  })

  const matrix: Record<string, number> = {}
  for (const log of logs) {
    const d = new Date(log.createdAt)
    const key = `${d.getDay()}_${d.getHours()}`
    matrix[key] = (matrix[key] ?? 0) + 1
  }

  const cells: ActivityHeatmapCell[] = []
  for (let dow = 0; dow < 7; dow++) {
    for (let h = 0; h < 24; h++) {
      cells.push({ hour: h, dayOfWeek: dow, count: matrix[`${dow}_${h}`] ?? 0 })
    }
  }
  return cells
}

/**
 * Audit log entity mutation counts by entity type over the last N days.
 * Used to visualise which parts of the system are most active.
 */
export async function getAdminEntityActivityBreakdown(days = 30): Promise<CategoryBreakdown[]> {
  const since = subDays(new Date(), days)
  const groups = await prisma.auditLog.groupBy({
    by: ['entityType'],
    _count: true,
    where: { createdAt: { gte: since } },
    orderBy: { _count: { entityType: 'desc' } },
    take: 12,
  })
  const total = groups.reduce((s, g) => s + g._count, 0)
  return groups.map((g) => ({
    category: g.entityType,
    value: g._count,
    pct: pct(g._count, total),
  }))
}

/**
 * Role distribution of all audit log actions for the admin security centre.
 */
export async function getAdminActionBreakdown(days = 30): Promise<CategoryBreakdown[]> {
  const since = subDays(new Date(), days)
  const groups = await prisma.auditLog.groupBy({
    by: ['action'],
    _count: true,
    where: { createdAt: { gte: since } },
    orderBy: { _count: { action: 'desc' } },
    take: 15,
  })
  const total = groups.reduce((s, g) => s + g._count, 0)
  return groups.map((g) => ({
    category: g.action,
    value: g._count,
    pct: pct(g._count, total),
  }))
}

/**
 * Daily audit log volume trend — system-wide write activity over N days.
 */
export async function getAdminAuditVolumeTrend(days = 30): Promise<TimeSeriesPoint[]> {
  const since = startOfDay(subDays(new Date(), days - 1))
  const logs = await prisma.auditLog.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
  })
  const interval = eachDayOfInterval({ start: since, end: new Date() })
  return interval.map((day) => {
    const dayStart = startOfDay(day).getTime()
    const dayEnd = endOfDay(day).getTime()
    return {
      label: dateLabel(day),
      value: logs.filter((l) => {
        const t = new Date(l.createdAt).getTime()
        return t >= dayStart && t <= dayEnd
      }).length,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGH RANK ANALYTICS  (E1 — GAP-049)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * School-wide pass rate and average score per term across multiple academic years.
 * Used for the performance trend line chart.
 */
export async function getHighRankSchoolPerformanceTrend(
  academicYears: string[],
): Promise<{ academicYear: string; term: number; passRate: number; average: number; total: number }[]> {
  const results = await prisma.termResult.findMany({
    where: { academicYear: { in: academicYears } },
    select: { academicYear: true, term: true, average: true, passStatus: true },
  })

  const buckets: Record<string, { total: number; passed: number; sumAvg: number }> = {}
  for (const r of results) {
    const key = `${r.academicYear}|${r.term}`
    if (!buckets[key]) buckets[key] = { total: 0, passed: 0, sumAvg: 0 }
    buckets[key].total += 1
    if (r.passStatus) buckets[key].passed += 1
    buckets[key].sumAvg += Number(r.average)
  }

  return Object.entries(buckets)
    .map(([key, b]) => {
      const [academicYear, termStr] = key.split('|')
      return {
        academicYear: academicYear!,
        term: Number(termStr),
        passRate: pct(b.passed, b.total),
        average: b.total > 0 ? Math.round((b.sumAvg / b.total) * 10) / 10 : 0,
        total: b.total,
      }
    })
    .sort((a, b) =>
      a.academicYear.localeCompare(b.academicYear) || a.term - b.term,
    )
}

/**
 * Class-by-class performance comparison for a given term.
 * Returns each class sorted by average descending — ranked table.
 */
export async function getHighRankClassComparison(
  academicYear: string,
  term: number,
): Promise<ClassPerformanceStat[]> {
  const [classes, termResults] = await Promise.all([
    prisma.class.findMany({
      where: { academicYear },
      select: { id: true, name: true, form: true, _count: { select: { students: true } } },
      orderBy: { form: 'asc' },
    }),
    prisma.termResult.findMany({
      where: { academicYear, term },
      select: { classId: true, average: true, passStatus: true },
    }),
  ])

  return classes
    .map((cls) => {
      const clsResults = termResults.filter((r) => r.classId === cls.id)
      return {
        className: cls.name,
        form: cls.form,
        studentCount: cls._count.students,
        passRate: pct(clsResults.filter((r) => r.passStatus).length, clsResults.length),
        average: avg(clsResults.map((r) => Number(r.average))),
        term,
      }
    })
    .sort((a, b) => b.average - a.average)
}

/**
 * Subject-level average comparison across all classes for a given term.
 * Aggregates ExamMark data grouped by subject name.
 */
export async function getHighRankSubjectComparison(
  academicYear: string,
  term: number,
): Promise<SubjectAverageStat[]> {
  const exams = await prisma.exam.findMany({
    where: { academicYear, term, status: { in: ['MARKS_FINAL', 'RESULTS_APPROVED', 'RESULTS_RELEASED'] } },
    select: {
      id: true,
      subject: true,
      maxMark: true,
      marks: { select: { mark: true, absent: true } },
    },
  })

  const subjectBuckets: Record<string, { scores: number[]; passCount: number }> = {}
  for (const exam of exams) {
    const maxMark = Number(exam.maxMark)
    const bucket = subjectBuckets[exam.subject] ?? (subjectBuckets[exam.subject] = { scores: [], passCount: 0 })
    for (const m of exam.marks) {
      if (!m.absent && m.mark !== null) {
        const score = (Number(m.mark) / maxMark) * 100
        bucket.scores.push(score)
        if (score >= 50) bucket.passCount += 1
      }
    }
  }

  return Object.entries(subjectBuckets)
    .map(([subject, b]) => ({
      subject,
      average: avg(b.scores),
      passRate: pct(b.passCount, b.scores.length),
      studentCount: b.scores.length,
    }))
    .sort((a, b) => b.average - a.average)
}

/**
 * E2 — Teacher effectiveness matrix.
 * For each teacher (identified by class.teacherId), compute:
 *   – Average student score (normalised to 100%) across all their subjects/classes
 *   – Pass rate
 *   – Number of classes taught
 * Joined to StaffProfile for name/department.
 */
export async function getTeacherEffectivenessMatrix(
  academicYear: string,
  term: number,
): Promise<TeacherEffectivenessRow[]> {
  const [classes, staffProfiles, slots] = await Promise.all([
    prisma.class.findMany({
      where: { academicYear, teacherId: { not: null } },
      select: { id: true, name: true, teacherId: true },
    }),
    prisma.staffProfile.findMany({
      select: { uid: true, firstName: true, lastName: true, department: true },
    }),
    // [R14] subjectCount was a hardcoded 0. A teacher's real subjects are the
    // distinct TimetableSlot.subject values they are the assigned teacherUid
    // for — the only place in the schema that records who teaches WHAT, as
    // opposed to Class.teacherId, which records who is a class's form
    // teacher. Fetched once for the whole year and grouped in memory rather
    // than issuing one query per teacher.
    prisma.timetableSlot.findMany({
      where: { academicYear, term },
      select: { teacherUid: true, subject: true },
    }),
  ])

  const staffMap = new Map<string, string>(
    staffProfiles.map((s) => [s.uid, `${s.firstName} ${s.lastName}`] as const),
  )
  const deptMap = new Map<string, string>(
    staffProfiles.map((s) => [s.uid, s.department] as const),
  )

  const subjectsByTeacher = new Map<string, Set<string>>()
  for (const slot of slots) {
    const existing = subjectsByTeacher.get(slot.teacherUid)
    if (existing) existing.add(slot.subject)
    else subjectsByTeacher.set(slot.teacherUid, new Set([slot.subject]))
  }

  // Group classes by teacher UID
  const teacherClasses = new Map<string, string[]>()
  for (const cls of classes) {
    if (!cls.teacherId) continue
    const existing = teacherClasses.get(cls.teacherId)
    if (existing) existing.push(cls.id)
    else teacherClasses.set(cls.teacherId, [cls.id])
  }

  const rows: TeacherEffectivenessRow[] = []

  for (const [teacherUid, classIds] of teacherClasses) {
    const termResults = await prisma.termResult.findMany({
      where: { classId: { in: classIds }, academicYear, term },
      select: { average: true, passStatus: true },
    })

    rows.push({
      teacherUid,
      teacherName: staffMap.get(teacherUid) ?? teacherUid,
      department: deptMap.get(teacherUid) ?? '—',
      subjectCount: subjectsByTeacher.get(teacherUid)?.size ?? 0,
      avgStudentScore: avg(termResults.map((r) => Number(r.average))),
      avgPassRate: pct(termResults.filter((r) => r.passStatus).length, termResults.length),
      classesCount: classIds.length,
    })
  }

  return rows.sort((a, b) => b.avgStudentScore - a.avgStudentScore)
}

/**
 * Monthly student enrollment trend over the last N months.
 * New students = students whose first TermResult appeared in that month.
 * Departed = students whose status changed from ACTIVE in that month (via AuditLog).
 */
export async function getHighRankEnrollmentTrend(months = 12): Promise<EnrollmentTrendPoint[]> {
  const since = startOfMonth(subMonths(new Date(), months - 1))
  const interval = eachMonthOfInterval({ start: since, end: new Date() })

  const [newStudents, departures] = await Promise.all([
    prisma.student.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: {
        createdAt: { gte: since },
        action: 'STUDENT_ARCHIVED',
      },
      select: { createdAt: true },
    }),
  ])

  return interval.map((monthStart) => {
    const monthEnd = endOfMonth(monthStart)
    const enrolled = newStudents.filter((s) => {
      const t = new Date(s.createdAt).getTime()
      return t >= monthStart.getTime() && t <= monthEnd.getTime()
    }).length
    const departed = departures.filter((l) => {
      const t = new Date(l.createdAt).getTime()
      return t >= monthStart.getTime() && t <= monthEnd.getTime()
    }).length
    return {
      month: monthLabel(monthStart),
      enrolled,
      departed,
      net: enrolled - departed,
    }
  })
}

/**
 * High-level revenue vs expenses summary per academic year + term.
 * Revenue = sum of Invoice.paidAmount; Expenses = sum of approved Expense.amount;
 * Payroll = sum of COMPLETED PayrollRun.totalNet for months in that term.
 * Returns one row per term.
 *
 * [R14] MAJOR REWRITE. This previously returned a hardcoded `payroll: 0` and
 * omitted payroll from `net` entirely — meaning high_rank, the more senior
 * role, saw a materially wrong net figure for the very same period and
 * business question that `finance` saw correctly through
 * getFinanceCashFlow(). Both functions now derive payroll from the same
 * completedPayrollRuns() query and the same payrollForTerm() arithmetic, so
 * the two roles cannot see different answers to the same question again.
 */
export async function getHighRankFinancialSummary(
  academicYear: string,
): Promise<CashFlowRow[]> {
  const payrollRuns = await completedPayrollRuns()

  return Promise.all(
    [1, 2, 3].map(async (term) => {
      const [invoices, expenses] = await Promise.all([
        prisma.invoice.aggregate({
          _sum: { paidAmount: true },
          where: { academicYear, term },
        }),
        prisma.expense.aggregate({
          _sum: { amount: true },
          where: { academicYear, term, status: 'APPROVED' },
        }),
      ])
      const revenue = Number(invoices._sum.paidAmount ?? 0)
      const expenseTotal = Number(expenses._sum.amount ?? 0)
      const payroll = payrollForTerm(payrollRuns, academicYear, term)

      return {
        academicYear,
        term,
        revenue: Math.round(revenue),
        expenses: Math.round(expenseTotal),
        payroll: Math.round(payroll),
        net: Math.round(revenue - expenseTotal - payroll),
      }
    }),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE ANALYTICS  (E1 — GAP-050)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fee collection amounts per day over the last N days.
 * Used for the daily collection bar chart.
 */
export async function getFinanceCollectionByDay(days = 30): Promise<TimeSeriesPoint[]> {
  const since = startOfDay(subDays(new Date(), days - 1))
  const payments = await prisma.payment.findMany({
    where: { paidAt: { gte: since } },
    select: { amount: true, paidAt: true },
  })
  const interval = eachDayOfInterval({ start: since, end: new Date() })
  return interval.map((day) => {
    const dayStart = startOfDay(day).getTime()
    const dayEnd = endOfDay(day).getTime()
    const dayPayments = payments.filter((p) => {
      const t = new Date(p.paidAt).getTime()
      return t >= dayStart && t <= dayEnd
    })
    return {
      label: dateLabel(day),
      value: Math.round(dayPayments.reduce((s, p) => s + Number(p.amount), 0)),
    }
  })
}

/**
 * Fee collection per month over the last N months.
 * Returns actual collected + cumulative running total for line/area chart.
 */
export async function getFinanceCollectionByMonth(
  months = 12,
): Promise<{ month: string; collected: number; cumulative: number }[]> {
  const since = startOfMonth(subMonths(new Date(), months - 1))
  const payments = await prisma.payment.findMany({
    where: { paidAt: { gte: since } },
    select: { amount: true, paidAt: true },
  })
  const interval = eachMonthOfInterval({ start: since, end: new Date() })
  let cumulative = 0
  return interval.map((monthStart) => {
    const monthEnd = endOfMonth(monthStart)
    const monthTotal = payments
      .filter((p) => {
        const t = new Date(p.paidAt).getTime()
        return t >= monthStart.getTime() && t <= monthEnd.getTime()
      })
      .reduce((s, p) => s + Number(p.amount), 0)
    cumulative += monthTotal
    return {
      month: monthLabel(monthStart),
      collected: Math.round(monthTotal),
      cumulative: Math.round(cumulative),
    }
  })
}

/**
 * Outstanding balance drilldown.
 * Returns total per class so the finance team can drill from school → class → student.
 */
export async function getFinanceOutstandingByClass(
  academicYear: string,
  term?: number,
): Promise<{ classId: string; className: string; outstanding: number; studentCount: number }[]> {
  const [classes, invoices] = await Promise.all([
    prisma.class.findMany({
      where: { academicYear },
      select: { id: true, name: true },
    }),
    prisma.invoice.findMany({
      where: {
        academicYear,
        ...(term !== undefined ? { term } : {}),
        status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
        balance: { gt: 0 },
      },
      select: {
        studentId: true,
        balance:   true,
        student:   { select: { classId: true } },
      },
    }),
  ])

  const classMap = new Map(classes.map((c) => [c.id, c.name]))
  const breakdown: Record<string, { outstanding: number; students: Set<string> }> = {}

  for (const inv of invoices) {
    const classId = inv.student.classId
    if (!classId) continue
    const bucket = breakdown[classId] ?? (breakdown[classId] = { outstanding: 0, students: new Set() })
    bucket.outstanding += Number(inv.balance)
    bucket.students.add(inv.studentId)
  }

  return Object.entries(breakdown)
    .map(([classId, b]) => ({
      classId,
      className: classMap.get(classId) ?? classId,
      outstanding: Math.round(b.outstanding),
      studentCount: b.students.size,
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
}

/**
 * Expense breakdown by category.
 * Used for the pie chart on the finance reports page.
 */
export async function getFinanceExpenseBreakdown(
  academicYear: string,
  term?: number,
): Promise<CategoryBreakdown[]> {
  const groups = await prisma.expense.groupBy({
    by: ['category'],
    _sum: { amount: true },
    where: {
      academicYear,
      ...(term !== undefined ? { term } : {}),
      status: 'APPROVED',
    },
    orderBy: { _sum: { amount: 'desc' } },
  })
  const total = groups.reduce((s, g) => s + Number(g._sum.amount ?? 0), 0)
  return groups.map((g) => ({
    category: g.category,
    value: Math.round(Number(g._sum.amount ?? 0)),
    pct: pct(Number(g._sum.amount ?? 0), total),
  }))
}

/**
 * Budget vs actual spending per expense category.
 * Used for the horizontal bar chart.
 *
 * [R14] MAJOR REWRITE. This grouped Budget by `department` and then looked
 * that department string up in a map keyed by Expense.category. Those are
 * two different fields with two different value spaces — Budget.department
 * was free text ("Sciences", "Administration"), Expense.category has always
 * been the ExpenseCategory enum (SALARIES, UTILITIES, …) — so the lookup
 * missed for essentially every real budget and the function fell through to
 * `Number(b._sum.spent)`, the stale cached column, presenting it to the user
 * as though it were live expense data.
 *
 * Budget.category is now that same ExpenseCategory enum (schema.prisma, same
 * phase), which makes it a real join key. Rows are grouped and joined on it,
 * and `spent` is now always the live APPROVED-expense total — no silent
 * fallback to a cached value, because there is no longer a case where the
 * join can fail to resolve. A category with allocation but no expenses
 * correctly reports 0 spent rather than a stale figure.
 */
export async function getFinanceBudgetVsActual(
  academicYear: string,
  term?: number,
): Promise<BudgetVsActualRow[]> {
  const [budgets, expenses] = await Promise.all([
    prisma.budget.groupBy({
      by: ['category'],
      _sum: { allocated: true },
      where: { academicYear, ...(term !== undefined ? { term } : {}) },
      orderBy: { category: 'asc' },
    }),
    prisma.expense.groupBy({
      by: ['category'],
      _sum: { amount: true },
      where: {
        academicYear,
        ...(term !== undefined ? { term } : {}),
        status: 'APPROVED',
      },
    }),
  ])

  const spentByCategory = new Map<ExpenseCategory, number>(
    expenses.map((e) => [e.category, Number(e._sum.amount ?? 0)]),
  )

  return budgets.map((b) => {
    const allocated = Number(b._sum.allocated ?? 0)
    const spent = spentByCategory.get(b.category) ?? 0
    return {
      category: b.category,
      allocated: Math.round(allocated),
      spent: Math.round(spent),
      utilisation: pct(spent, allocated),
    }
  })
}

/**
 * Cash flow per term for a given academic year.
 * Net = Revenue − Expenses − Payroll.
 *
 * [R14] Behaviour is unchanged; the inline payroll-month arithmetic and the
 * `take: 36` PayrollRun query it used to carry locally are now the shared
 * completedPayrollRuns()/payrollForTerm() helpers, which
 * getHighRankFinancialSummary() also uses. The old `take: 36` was a silent
 * correctness hazard on its own — with no orderBy, "36 arbitrary rows" is
 * not guaranteed to include the term actually being asked about.
 */
export async function getFinanceCashFlow(academicYear: string): Promise<CashFlowRow[]> {
  const payrollRuns = await completedPayrollRuns()

  return Promise.all(
    [1, 2, 3].map(async (term) => {
      const [invoices, expenses] = await Promise.all([
        prisma.invoice.aggregate({
          _sum: { paidAmount: true },
          where: { academicYear, term },
        }),
        prisma.expense.aggregate({
          _sum: { amount: true },
          where: { academicYear, term, status: 'APPROVED' },
        }),
      ])
      const revenue = Number(invoices._sum.paidAmount ?? 0)
      const expenseTotal = Number(expenses._sum.amount ?? 0)
      const payroll = payrollForTerm(payrollRuns, academicYear, term)

      return {
        academicYear,
        term,
        revenue: Math.round(revenue),
        expenses: Math.round(expenseTotal),
        payroll: Math.round(payroll),
        net: Math.round(revenue - expenseTotal - payroll),
      }
    }),
  )
}

/**
 * Payroll trend — monthly totalNet for the last N months.
 */
export async function getFinancePayrollTrend(months = 12): Promise<TimeSeriesPoint[]> {
  const since = subMonths(new Date(), months)
  const runs = await prisma.payrollRun.findMany({
    where: { status: 'COMPLETED', createdAt: { gte: since } },
    select: { month: true, year: true, totalNet: true },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  })
  return runs.map((r) => ({
    label: format(new Date(r.year, r.month - 1, 1), 'MMM yy'),
    value: Math.round(Number(r.totalNet)),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// LIBRARY ANALYTICS  (E1 — GAP-051)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Borrowing issues per week over the last N weeks.
 * Used for the borrowing trend chart.
 */
export async function getLibraryBorrowingTrend(weeks = 12): Promise<TimeSeriesPoint[]> {
  const since = startOfWeek(subDays(new Date(), weeks * 7))
  const borrowings = await prisma.borrowing.findMany({
    where: { issuedAt: { gte: since } },
    select: { issuedAt: true },
  })
  const interval = eachWeekOfInterval({ start: since, end: new Date() })
  return interval.map((weekStart) => {
    const weekEnd = endOfWeek(weekStart)
    return {
      label: dateLabel(weekStart),
      value: borrowings.filter((b) => {
        const t = new Date(b.issuedAt).getTime()
        return t >= weekStart.getTime() && t <= weekEnd.getTime()
      }).length,
    }
  })
}

/**
 * Full inventory health dashboard for library staff.
 *
 * [R14] MAJOR REWRITE of the copy arithmetic.
 *
 * The old formula was:
 *     borrowedCopies = totalCopies − availableCopies − overdueCount
 *
 * An OVERDUE borrowing is a book that is still out on loan — it is a SUBSET
 * of the currently-borrowed copies, not a separate additive category
 * alongside them. Subtracting it therefore under-counted genuinely-borrowed
 * books by exactly the number of overdue ones, and would drive
 * borrowedCopies negative (clamped to 0 by the Math.max) for a library whose
 * loans are mostly overdue.
 *
 * `lostCopies` was queried but never subtracted at all, even though a LOST
 * copy is neither available nor borrowed.
 *
 * The correct decomposition of a book's copies is:
 *     totalCopies = availableCopies + borrowedCopies + lostCopies
 * so borrowedCopies is what remains after the other two, and overdueCount is
 * reported alongside as the informational subset of borrowedCopies it is —
 * never subtracted from it. (R12's fix, which decrements Book.totalCopies
 * when a copy is written off as LOST, is what makes this identity hold.)
 */
export async function getLibraryInventoryHealth(): Promise<LibraryInventoryHealth> {
  const [agg, overdueCount, lostCopies] = await Promise.all([
    prisma.book.aggregate({
      _sum: { totalCopies: true, availableCopies: true },
      _count: true,
    }),
    prisma.borrowing.count({ where: { status: 'OVERDUE' } }),
    prisma.borrowing.count({ where: { status: 'LOST' } }),
  ])

  const totalCopies = Number(agg._sum.totalCopies ?? 0)
  const availableCopies = Number(agg._sum.availableCopies ?? 0)
  const borrowedCopies = Math.max(0, totalCopies - availableCopies - lostCopies)

  return {
    totalTitles: agg._count,
    totalCopies,
    availableCopies,
    borrowedCopies,
    lostCopies,
    overdueCount,
    availabilityRate: pct(availableCopies, totalCopies),
  }
}

/**
 * Top N most borrowed books with title and author.
 */
export async function getLibraryTopBorrowed(limit = 10): Promise<TopBorrowedBook[]> {
  const groups = await prisma.borrowing.groupBy({
    by: ['bookId'],
    _count: true,
    orderBy: { _count: { bookId: 'desc' } },
    take: limit,
  })

  const bookIds = groups.map((g) => g.bookId)
  const books = await prisma.book.findMany({
    where: { id: { in: bookIds } },
    select: { id: true, title: true, author: true, category: true },
  })
  const bookMap = new Map(books.map((b) => [b.id, b]))

  return groups
    .map((g) => {
      const book = bookMap.get(g.bookId)
      return {
        bookId: g.bookId,
        title: book?.title ?? 'Unknown',
        author: book?.author ?? 'Unknown',
        category: book?.category ?? 'OTHER',
        borrowCount: g._count,
      }
    })
    .sort((a, b) => b.borrowCount - a.borrowCount)
}

/**
 * Digital resource access statistics per type/subject.
 */
export async function getLibraryDigitalStats(): Promise<{
  byType: CategoryBreakdown[]
  bySubject: CategoryBreakdown[]
  total: number
  approvedCount: number
}> {
  const [byType, bySubject, total, approvedCount] = await Promise.all([
    prisma.digitalResource.groupBy({
      by: ['type'],
      _count: true,
      where: { approved: true },
      orderBy: { _count: { type: 'desc' } },
    }),
    prisma.digitalResource.groupBy({
      by: ['subject'],
      _count: true,
      where: { approved: true, subject: { not: null } },
      orderBy: { _count: { subject: 'desc' } },
      take: 10,
    }),
    prisma.digitalResource.count(),
    prisma.digitalResource.count({ where: { approved: true } }),
  ])

  const typeTotal = byType.reduce((s, g) => s + g._count, 0)
  const subjectTotal = bySubject.reduce((s, g) => s + g._count, 0)

  return {
    byType: byType.map((g) => ({
      category: g.type,
      value: g._count,
      pct: pct(g._count, typeTotal),
    })),
    bySubject: bySubject.map((g) => ({
      category: g.subject ?? 'Unknown',
      value: g._count,
      pct: pct(g._count, subjectTotal),
    })),
    total,
    approvedCount,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOWER RANK ANALYTICS  (E1 — GAP-052)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Applications funnel: PENDING → APPROVED → AWAITING_ADMISSION → ADMITTED.
 * Shows the conversion rate at each stage.
 */
export async function getLowerRankApplicationsFunnel(): Promise<ApplicationFunnelStage[]> {
  const counts = await prisma.application.groupBy({
    by: ['status'],
    _count: true,
  })

  const statusMap = new Map(counts.map((c) => [c.status, c._count]))
  const total = counts.reduce((s, c) => s + c._count, 0)

  const stages: { stage: string; status: ApplicationStatus | '' }[] = [
    { stage: 'Total Applications', status: '' },
    { stage: 'Approved', status: 'APPROVED' },
    { stage: 'Awaiting Admission', status: 'AWAITING_ADMISSION' },
    { stage: 'Admitted', status: 'ADMITTED' },
    { stage: 'Denied', status: 'DENIED' },
  ]

  return stages.map(({ stage, status }) => {
    const count = status === '' ? total : (statusMap.get(status) ?? 0)
    return { stage, count, pct: pct(count, total) }
  })
}

/**
 * Monthly application submission trend.
 */
export async function getLowerRankApplicationTrend(months = 12): Promise<TimeSeriesPoint[]> {
  const since = startOfMonth(subMonths(new Date(), months - 1))
  const applications = await prisma.application.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
  })
  const interval = eachMonthOfInterval({ start: since, end: new Date() })
  return interval.map((monthStart) => {
    const monthEnd = endOfMonth(monthStart)
    return {
      label: monthLabel(monthStart),
      value: applications.filter((a) => {
        const t = new Date(a.createdAt).getTime()
        return t >= monthStart.getTime() && t <= monthEnd.getTime()
      }).length,
    }
  })
}

/**
 * Current enrollment breakdown by form and class.
 */
export async function getLowerRankEnrollmentByForm(
  academicYear: string,
): Promise<{ form: number; className: string; studentCount: number }[]> {
  const classes = await prisma.class.findMany({
    where: { academicYear },
    select: { name: true, form: true, _count: { select: { students: true } } },
    orderBy: [{ form: 'asc' }, { name: 'asc' }],
  })
  return classes.map((c) => ({
    form: c.form,
    className: c.name,
    studentCount: c._count.students,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// ACADEMIC STAFF ANALYTICS  (E1 — GAP-053)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Class performance per subject for the teacher's assigned classes.
 * Each row = one subject in one class.
 */
export async function getAcademicClassSubjectPerformance(
  teacherUid: string,
  academicYear: string,
  term: number,
): Promise<(SubjectAverageStat & { className: string })[]> {
  const myClasses = await prisma.class.findMany({
    where: { academicYear, teacherId: teacherUid },
    select: { id: true, name: true },
  })

  if (myClasses.length === 0) return []

  const classIds = myClasses.map((c) => c.id)
  const classMap = new Map(myClasses.map((c) => [c.id, c.name]))

  const exams = await prisma.exam.findMany({
    where: {
      classId: { in: classIds },
      academicYear,
      term,
      status: { in: ['MARKS_FINAL', 'RESULTS_APPROVED', 'RESULTS_RELEASED'] },
    },
    select: {
      classId: true,
      subject: true,
      maxMark: true,
      marks: { select: { mark: true, absent: true } },
    },
  })

  const buckets: Record<string, { scores: number[]; passCount: number; className: string }> = {}
  for (const exam of exams) {
    const maxMark = Number(exam.maxMark)
    const key = `${exam.classId}|${exam.subject}`
    if (!buckets[key]) {
      buckets[key] = { scores: [], passCount: 0, className: classMap.get(exam.classId) ?? exam.classId }
    }
    for (const m of exam.marks) {
      if (!m.absent && m.mark !== null) {
        const score = (Number(m.mark) / maxMark) * 100
        buckets[key].scores.push(score)
        if (score >= 50) buckets[key].passCount += 1
      }
    }
  }

  return Object.entries(buckets)
    .map(([key, b]) => {
      const [, subject] = key.split('|')
      return {
        subject: subject ?? '',
        className: b.className,
        average: avg(b.scores),
        passRate: pct(b.passCount, b.scores.length),
        studentCount: b.scores.length,
      }
    })
    .sort((a, b) => b.average - a.average)
}

/**
 * Assignment completion matrix for a teacher's classes.
 */
export async function getAcademicAssignmentCompletion(
  teacherUid: string,
  academicYear: string,
): Promise<AssignmentCompletionRow[]> {
  const myClasses = await prisma.class.findMany({
    where: { academicYear, teacherId: teacherUid },
    select: { id: true, _count: { select: { students: true } } },
  })

  if (myClasses.length === 0) return []

  const classIds = myClasses.map((c) => c.id)
  const totalStudents = myClasses.reduce((s, c) => s + c._count.students, 0)

  const assignments = await prisma.assignment.findMany({
    where: { classId: { in: classIds } },
    select: {
      id: true,
      title: true,
      subject: true,
      dueDate: true,
      _count: { select: { submissions: true } },
    },
    orderBy: { dueDate: 'desc' },
    take: 30,
  })

  return assignments.map((a) => ({
    assignmentId: a.id,
    title: a.title,
    subject: a.subject,
    dueDate: format(a.dueDate, 'dd MMM yyyy'),
    submitted: a._count.submissions,
    total: totalStudents,
    completionRate: pct(a._count.submissions, totalStudents),
  }))
}

/**
 * Marks distribution histogram for a specific exam (buckets of 10%).
 */
export async function getAcademicMarksDistribution(
  examId: string,
): Promise<{ bucket: string; count: number }[]> {
  const marks = await prisma.examMark.findMany({
    where: { examId, absent: false, mark: { not: null } },
    select: { mark: true },
  })

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { maxMark: true },
  })

  const maxMark = Number(exam?.maxMark ?? 100)
  const buckets = ['0–9', '10–19', '20–29', '30–39', '40–49', '50–59', '60–69', '70–79', '80–89', '90–100']
  const counts = new Array(10).fill(0) as number[]

  for (const m of marks) {
    const pctScore = (Number(m.mark) / maxMark) * 100
    const idx = Math.min(9, Math.floor(pctScore / 10))
    counts[idx] = (counts[idx] ?? 0) + 1
  }

  return buckets.map((bucket, i) => ({ bucket, count: counts[i] ?? 0 }))
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT ANALYTICS  (E1 — GAP-054)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Student's own performance trend across all available terms.
 *
 * [R14] MAJOR REWRITE of the attendancePct computation. It was derived from
 * TermResult.attendanceDays / TermResult.absentDays — two columns with no
 * write path anywhere in the codebase, so both are guaranteed to be 0 for
 * every row that exists. Every student's attendance therefore rendered as a
 * flat 0% on their own performance report, indistinguishable from a genuine
 * perfect-absence record.
 *
 * Repointed onto the real Attendance model R6 introduced, via
 * attendanceService.getAttendanceSummaryForTerm() — reusing the one function
 * that already resolves an academicYear+term to a real calendar date range
 * and aggregates that student's Attendance rows inside it, rather than
 * writing a second, independently-drifting query against the same table.
 * LATE counts toward attendance (the student was present), matching
 * getAttendanceSummaryForTerm()'s own PRESENT/ABSENT/LATE decomposition.
 */
export async function getStudentPerformanceTrend(
  studentId: string,
): Promise<StudentPerformancePoint[]> {
  const results = await prisma.termResult.findMany({
    where: { studentId },
    select: {
      academicYear: true,
      term: true,
      average: true,
      grade: true,
      classPosition: true,
      classTotal: true,
      passStatus: true,
    },
    orderBy: [{ academicYear: 'asc' }, { term: 'asc' }],
  })

  return Promise.all(
    results.map(async (r) => {
      const attendance = await getAttendanceSummaryForTerm(
        studentId,
        r.academicYear,
        r.term,
      )
      // Present-or-late over all recorded school days in the term.
      const attended = attendance.daysPresent + attendance.daysLate

      return {
        academicYear: r.academicYear,
        term: r.term,
        average: Number(r.average),
        grade: r.grade,
        position: r.classPosition,
        classTotal: r.classTotal,
        passStatus: r.passStatus,
        attendancePct: pct(attended, attendance.totalDays),
      }
    }),
  )
}

/**
 * Subject-by-subject score breakdown for a specific term.
 * Reads from TermResult.subjectResults JSON.
 */
export async function getStudentSubjectBreakdown(
  studentId: string,
  academicYear: string,
  term: number,
): Promise<StudentSubjectScore[]> {
  const result = await prisma.termResult.findUnique({
    where: { studentId_academicYear_term: { studentId, academicYear, term } },
    select: { subjectResults: true },
  })

  if (!result?.subjectResults) return []

  const raw = result.subjectResults as Record<string, { score: number; grade: string; maxMark: number }>[]
  if (!Array.isArray(raw)) return []

  return raw.map((entry) => {
    const subject = Object.keys(entry)[0] ?? 'Unknown'
    const data = entry[subject]
    return {
      subject,
      score: data?.score ?? 0,
      grade: data?.grade ?? '—',
      maxMark: data?.maxMark ?? 100,
    }
  })
}

/**
 * Student's complete fee statement — all invoices with payment history.
 */
export async function getStudentFeeStatement(
  studentId: string,
): Promise<StudentFeeStatement[]> {
  const invoices = await prisma.invoice.findMany({
    where: { studentId },
    select: {
      id: true,
      academicYear: true,
      term: true,
      totalAmount: true,
      paidAmount: true,
      balance: true,
      status: true,
      dueDate: true,
      payments: {
        select: { amount: true, method: true, paidAt: true },
        orderBy: { paidAt: 'desc' },
      },
    },
    orderBy: [{ academicYear: 'desc' }, { term: 'desc' }],
  })

  return invoices.map((inv) => ({
    invoiceId: inv.id,
    academicYear: inv.academicYear,
    term: inv.term,
    totalAmount: Number(inv.totalAmount),
    paidAmount: Number(inv.paidAmount),
    balance: Number(inv.balance),
    status: inv.status,
    dueDate: format(inv.dueDate, 'dd MMM yyyy'),
    payments: inv.payments.map((p) => ({
      amount: Number(p.amount),
      method: p.method,
      paidAt: format(p.paidAt, 'dd MMM yyyy'),
    })),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// E3 — MANEB ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MANEB school statistics — grade distribution and subject-level pass rates.
 * Returns one row per exam type (JCE / MSCE) for a given academic year.
 */
export async function getManebSchoolStats(
  academicYear: string,
): Promise<ManebSchoolStat[]> {
  const records = await prisma.manebRecord.findMany({
    where: { academicYear },
    select: {
      examType: true,
      overallGrade: true,
      subjectGrades: true,
      status: true,
    },
  })

  const byType: Record<string, typeof records> = {}
  for (const r of records) {
    const bucket = byType[r.examType] ?? (byType[r.examType] = [])
    bucket.push(r)
  }

  return Object.entries(byType).map(([examType, typeRecords]) => {
    const gradeMap: Record<string, number> = {}
    let passCount = 0

    for (const r of typeRecords) {
      const g = r.overallGrade ?? 'U'
      gradeMap[g] = (gradeMap[g] ?? 0) + 1
      if (['A', 'B', 'C', 'D', 'E'].includes(g)) passCount += 1
    }

    const total = typeRecords.length
    const gradeTotal = Object.values(gradeMap).reduce((s, v) => s + v, 0)

    const gradeDistribution: CategoryBreakdown[] = Object.entries(gradeMap)
      .map(([category, value]) => ({ category, value, pct: pct(value, gradeTotal) }))
      .sort((a, b) => a.category.localeCompare(b.category))

    // Subject-level analysis from JSON
    const subjectBuckets: Record<string, { pass: number; total: number }> = {}
    for (const r of typeRecords) {
      const sgs = r.subjectGrades as Record<string, string> | null
      if (!sgs) continue
      for (const [subject, grade] of Object.entries(sgs)) {
        if (!subjectBuckets[subject]) subjectBuckets[subject] = { pass: 0, total: 0 }
        subjectBuckets[subject].total += 1
        if (['A', 'B', 'C', 'D', 'E'].includes(grade)) subjectBuckets[subject].pass += 1
      }
    }

    const subjectAverages = Object.entries(subjectBuckets)
      .map(([subject, b]) => ({
        subject,
        passCount: b.pass,
        total: b.total,
        passRate: pct(b.pass, b.total),
      }))
      .sort((a, b) => b.passRate - a.passRate)

    return {
      examType,
      total,
      passCount,
      passRate: pct(passCount, total),
      gradeDistribution,
      subjectAverages,
    }
  })
}

/**
 * MANEB records list for a given academic year — full candidate list.
 */
export async function getManebCandidateList(
  academicYear: string,
  examType?: 'JCE' | 'MSCE',
): Promise<ManebResultSummary[]> {
  const records = await prisma.manebRecord.findMany({
    where: {
      academicYear,
      ...(examType ? { examType } : {}),
    },
    select: {
      studentId: true,
      candidateNo: true,
      examType: true,
      overallGrade: true,
      subjectGrades: true,
      status: true,
    },
    orderBy: { candidateNo: 'asc' },
  })

  return records.map((r) => {
    const sgs = r.subjectGrades as Record<string, string> | null
    const subjectGrades: ManebSubjectResult[] = sgs
      ? Object.entries(sgs).map(([subject, grade]) => ({ subject, grade }))
      : []
    return {
      candidateNo: r.candidateNo,
      studentId: r.studentId,
      examType: r.examType,
      overallGrade: r.overallGrade,
      subjectGrades,
      status: r.status,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// HR ANALYTICS (extended)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Staff headcount by department as a bar chart series.
 */
export async function getHRStaffByDepartment(): Promise<CategoryBreakdown[]> {
  const groups = await prisma.staffProfile.groupBy({
    by: ['department'],
    _count: true,
    where: { status: 'ACTIVE' },
    orderBy: { _count: { department: 'desc' } },
  })
  const total = groups.reduce((s, g) => s + g._count, 0)
  return groups.map((g) => ({
    category: g.department,
    value: g._count,
    pct: pct(g._count, total),
  }))
}

/**
 * Leave usage by type for the current calendar year.
 */
export async function getHRLeaveByType(year: number): Promise<CategoryBreakdown[]> {
  const groups = await prisma.leaveRequest.groupBy({
    by: ['leaveType'],
    _sum: { days: true },
    where: {
      status: 'APPROVED',
      startDate: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) },
    },
    orderBy: { _sum: { days: 'desc' } },
  })
  const total = groups.reduce((s, g) => s + Number(g._sum.days ?? 0), 0)
  return groups.map((g) => ({
    category: g.leaveType,
    value: Number(g._sum.days ?? 0),
    pct: pct(Number(g._sum.days ?? 0), total),
  }))
}

/**
 * Monthly leave requests trend.
 */
export async function getHRLeaveTrend(months = 12): Promise<DualSeriesPoint[]> {
  const since = startOfMonth(subMonths(new Date(), months - 1))
  const requests = await prisma.leaveRequest.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true, status: true },
  })
  const interval = eachMonthOfInterval({ start: since, end: new Date() })
  return interval.map((monthStart) => {
    const monthEnd = endOfMonth(monthStart)
    const monthReqs = requests.filter((r) => {
      const t = new Date(r.createdAt).getTime()
      return t >= monthStart.getTime() && t <= monthEnd.getTime()
    })
    return {
      label: monthLabel(monthStart),
      value: monthReqs.filter((r) => r.status === 'APPROVED').length,
      value2: monthReqs.filter((r) => r.status === 'REJECTED').length,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHOLARSHIP ANALYTICS  (R14 — report.viewScholarshipSummary)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * [R14 — NEW] Scholarship disbursement summary for an academic year.
 *
 * `report.viewScholarshipSummary` is granted to high_rank and finance in the
 * permission matrix, but had no implementation at any layer — no service
 * function, no route, no hook. This is that implementation.
 *
 * A scholarship's real cash value depends on its DiscountType: a
 * FIXED_AMOUNT scholarship is worth its `value` in MWK directly, while a
 * PERCENTAGE scholarship is worth that percentage of the recipient's own
 * invoiced total for the year — so the two cannot simply be summed, and a
 * percentage award's worth is only knowable per-recipient. Invoices are
 * aggregated per student for exactly that reason.
 */
export async function getFinanceScholarshipSummary(
  academicYear: string,
): Promise<ScholarshipSummary> {
  const scholarships = await prisma.scholarship.findMany({
    where: { academicYear, isActive: true },
    select: {
      name: true,
      studentId: true,
      discountType: true,
      value: true,
    },
    orderBy: { name: 'asc' },
  })

  if (scholarships.length === 0) {
    return {
      academicYear,
      activeScholarships: 0,
      recipientCount: 0,
      totalDiscountMwk: 0,
      byScholarship: [],
    }
  }

  // Invoiced total per recipient — the base a PERCENTAGE award is taken off.
  const invoiceTotals = await prisma.invoice.groupBy({
    by: ['studentId'],
    _sum: { totalAmount: true },
    where: {
      academicYear,
      studentId: { in: scholarships.map((sc) => sc.studentId) },
    },
  })
  const invoicedByStudent = new Map<string, number>(
    invoiceTotals.map((i) => [i.studentId, Number(i._sum.totalAmount ?? 0)] as const),
  )

  function discountValue(
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT',
    value: number,
    studentId: string,
  ): number {
    if (discountType === 'FIXED_AMOUNT') return value
    const invoiced = invoicedByStudent.get(studentId) ?? 0
    return (invoiced * value) / 100
  }

  // Group by scholarship name — the same named award is typically held by
  // several students, and the summary is reported per award, not per row.
  const grouped = new Map<string, ScholarshipSummaryRow>()
  const recipients = new Set<string>()

  for (const sc of scholarships) {
    recipients.add(sc.studentId)
    const amount = discountValue(sc.discountType, Number(sc.value), sc.studentId)

    const existing = grouped.get(sc.name)
    if (existing) {
      existing.recipientCount += 1
      existing.totalDiscount += amount
    } else {
      grouped.set(sc.name, {
        name: sc.name,
        discountType: sc.discountType,
        recipientCount: 1,
        totalDiscount: amount,
      })
    }
  }

  const byScholarship = [...grouped.values()]
    .map((row) => ({ ...row, totalDiscount: Math.round(row.totalDiscount) }))
    .sort((a, b) => b.totalDiscount - a.totalDiscount)

  return {
    academicYear,
    activeScholarships: scholarships.length,
    recipientCount: recipients.size,
    totalDiscountMwk: byScholarship.reduce((sum, r) => sum + r.totalDiscount, 0),
    byScholarship,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE ANALYTICS  (R14 — report.viewAttendanceSummary / viewOwnAttendance)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * [R14 — NEW] School-wide attendance summary for a term, broken down by class.
 *
 * `report.viewAttendanceSummary` is granted to five roles (high_rank,
 * lower_rank, academic, hr, exam_officer) in the permission matrix and had no
 * implementation at any layer before R14.
 *
 * Reads the real Attendance model R6 introduced, over the calendar date range
 * attendanceService.getTermDateRange() resolves the academicYear+term to —
 * the same resolver getAttendanceSummaryForTerm() uses, so a per-student and a
 * school-wide figure for the same term always cover the same days.
 *
 * LATE counts toward attendance (the student was present, just not on time),
 * matching getAttendanceSummaryForTerm()'s decomposition exactly.
 */
export async function getSchoolAttendanceSummary(
  academicYear: string,
  term: number,
): Promise<AttendanceSummary> {
  const { start, end } = getTermDateRange(academicYear, term)

  const [grouped, classes] = await Promise.all([
    prisma.attendance.groupBy({
      by: ['classId', 'status'],
      where: { date: { gte: start, lte: end } },
      _count: { _all: true },
    }),
    prisma.class.findMany({
      where: { academicYear },
      select: {
        id: true,
        name: true,
        form: true,
        _count: { select: { students: true } },
      },
      orderBy: [{ form: 'asc' }, { name: 'asc' }],
    }),
  ])

  const byClass: AttendanceSummaryRow[] = classes.map((cls) => {
    const rows = grouped.filter((g) => g.classId === cls.id)
    const count = (status: string): number =>
      rows.find((r) => r.status === status)?._count._all ?? 0

    const daysPresent = count('PRESENT')
    const daysAbsent = count('ABSENT')
    const daysLate = count('LATE')
    const totalDays = daysPresent + daysAbsent + daysLate

    return {
      classId: cls.id,
      className: cls.name,
      form: cls.form,
      studentCount: cls._count.students,
      daysPresent,
      daysAbsent,
      daysLate,
      attendanceRate: pct(daysPresent + daysLate, totalDays),
    }
  })

  const daysPresent = byClass.reduce((sum, c) => sum + c.daysPresent, 0)
  const daysAbsent = byClass.reduce((sum, c) => sum + c.daysAbsent, 0)
  const daysLate = byClass.reduce((sum, c) => sum + c.daysLate, 0)
  const totalDays = daysPresent + daysAbsent + daysLate

  return {
    academicYear,
    term,
    daysPresent,
    daysAbsent,
    daysLate,
    attendanceRate: pct(daysPresent + daysLate, totalDays),
    byClass,
  }
}

/**
 * [R14 — NEW] A single student's own attendance record for a term.
 *
 * Backs `report.viewOwnAttendance` — granted to the student role in the
 * permission matrix with no implementation at any layer before R14. Delegates
 * to attendanceService.getAttendanceSummaryForTerm() rather than re-querying
 * Attendance itself, so a student's own report and the class-level summary a
 * teacher sees can never disagree about the same term's days.
 */
export async function getOwnAttendanceSummary(
  studentId: string,
  academicYear: string,
  term: number,
): Promise<OwnAttendanceSummary> {
  const summary = await getAttendanceSummaryForTerm(studentId, academicYear, term)

  return {
    academicYear,
    term,
    daysPresent: summary.daysPresent,
    daysAbsent: summary.daysAbsent,
    daysLate: summary.daysLate,
    totalDays: summary.totalDays,
    attendanceRate: pct(summary.daysPresent + summary.daysLate, summary.totalDays),
  }
}

// ─── PLACEMENT ANALYTICS (R18) ───────────────────────────────────────────────
// Cohort placement outcomes for an academic year. The eligible cohort is the
// certified-MSCE candidate pool (getManebCandidateList — the same source the
// MANEB analytics use, so the two can never disagree about who sat MSCE), and
// the outcome distribution is read from the UniversityPlacement table. Purely
// advisory reporting — it never grades and never gates anything.

export interface PlacementAnalytics {
  academicYear: string
  cohortSize: number           // certified/received MSCE candidates this year
  placementsStarted: number    // students with any UniversityPlacement row
  byStatus: Record<string, number>
  verifiedCount: number
  placedCount: number          // PLACED + CONFIRMED
  confirmedCount: number
  declinedCount: number
  notPlacedCount: number
  topUniversities: Array<{ universityId: string; universityName: string; count: number }>
}

export async function getPlacementAnalytics(academicYear: string): Promise<PlacementAnalytics> {
  // Cohort: certified-MSCE candidates for the year (shared MANEB source).
  const candidates = await getManebCandidateList(academicYear, 'MSCE')
  const cohortStudentIds = new Set(candidates.map((c) => c.studentId))

  // Placements for exactly this cohort's certified MSCE records.
  const placements = await prisma.universityPlacement.findMany({
    where: { manebRecord: { academicYear, examType: 'MSCE' } },
    select: {
      status: true,
      isVerified: true,
      placedUniversityId: true,
      placedUniversityName: true,
      studentId: true,
    },
  })

  const byStatus: Record<string, number> = {}
  let verifiedCount = 0
  let confirmedCount = 0
  let declinedCount = 0
  let notPlacedCount = 0
  let placedCount = 0
  const uniCounts = new Map<string, number>()

  for (const p of placements) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
    if (p.isVerified) verifiedCount += 1
    if (p.status === 'CONFIRMED') confirmedCount += 1
    if (p.status === 'DECLINED') declinedCount += 1
    if (p.status === 'NOT_PLACED') notPlacedCount += 1
    if (p.status === 'PLACED' || p.status === 'CONFIRMED') {
      placedCount += 1
      const key = p.placedUniversityId ?? (p.placedUniversityName ? `free:${p.placedUniversityName}` : 'unknown')
      uniCounts.set(key, (uniCounts.get(key) ?? 0) + 1)
    }
  }

  const topUniversities = [...uniCounts.entries()]
    .map(([key, count]) => {
      const uni = findUniversity(key)
      return {
        universityId: key,
        universityName: uni?.name ?? (key.startsWith('free:') ? key.slice(5) : key),
        count,
      }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    academicYear,
    cohortSize: cohortStudentIds.size,
    placementsStarted: placements.length,
    byStatus,
    verifiedCount,
    placedCount,
    confirmedCount,
    declinedCount,
    notPlacedCount,
    topUniversities,
  }
}