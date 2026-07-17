/**
 * apps/web/src/server/routes/analytics.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [R-PHASE]: R14 — Analytics & Reports Domain
 * [PURPOSE]: A full authorization-correctness sweep, plus three endpoints
 *   for permissions the matrix grants but nothing implemented.
 *
 *   1. requireRole → requirePermission, everywhere. Every route in this file
 *      gated on a hand-maintained requireRole([...]) allowlist that had
 *      drifted from PERMISSIONS_MAP.md — 27 of the 30 over-granted 'admin',
 *      whose real report permissions are system-level only
 *      (viewSystemHealth / viewAuditLogs / viewLoginAttempts /
 *      viewDatabaseMetrics / viewBackupStatus), NOT school performance,
 *      finance, library, HR or MANEB analytics. Each route now names the one
 *      permission that actually governs it, so the allowlist cannot drift
 *      from the matrix again: the matrix IS the allowlist.
 *
 *   2. Roles wrongly excluded are restored by the same mechanism.
 *      /school/performance-trend and /school/class-comparison excluded
 *      exam_officer despite it formally holding report.viewSchoolPerformance
 *      and report.viewClassPerformance; /school/class-comparison also
 *      excluded academic despite it holding report.viewClassPerformance.
 *      Gating on the permission rather than a role list admits them
 *      automatically.
 *
 *   3. /student/* routes let admin/high_rank (and finance, for the fee
 *      statement) pass an ARBITRARY studentId and read any student's record,
 *      a capability no permission in the matrix covered — the three
 *      report.viewOwn* permissions authorise a student to read their own
 *      record and nothing more. Rather than remove an oversight function the
 *      school plausibly needs, R14 adds report.viewAnyStudentPerformance
 *      (S/types/permissions.ts, same phase) and these routes now branch: a
 *      student may only ever read their own record (their query studentId is
 *      ignored entirely — it is not a request, it is an attack surface),
 *      while any other caller must hold the new permission AND supply an
 *      explicit studentId.
 *
 *   4. NEW: GET /finance/scholarship-summary (report.viewScholarshipSummary),
 *      GET /school/attendance-summary (report.viewAttendanceSummary) and
 *      GET /student/attendance (report.viewOwnAttendance, with the
 *      viewAnyStudentPerformance branch for staff) — all three permissions
 *      are granted in the matrix and had no implementation at any layer.
 *
 *   Hardcoded '2025/2026' / term '1' query defaults are replaced throughout
 *   by a settingsService lookup of SETTING_KEYS.CURRENT_ACADEMIC_YEAR /
 *   CURRENT_TERM — the mechanism that exists precisely so the current period
 *   is never a literal.
 * [DEPENDS ON]: S/types/permissions.ts (report.viewAnyStudentPerformance),
 *   W/server/services/analyticsService.ts, W/server/services/settingsService.ts
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import {
  requirePermission,
  requireAnyPermission,
} from '@/server/middleware/verifyPermission'
import { hasPermission } from '@shared/types/permissions'
import { SETTING_KEYS } from '@shared/types/settings'
import * as analytics from '@/server/services/analyticsService'
import * as settingsService from '@/server/services/settingsService'

export const analyticsRouter = Router()

// ─── SHARED QUERY-PARAM RESOLUTION ───────────────────────────────────────────

/**
 * Resolves the academicYear/term a request is asking about.
 *
 * When the caller supplies neither, the answer is whatever the school's
 * SystemSettings say the CURRENT period is — never a hardcoded '2025/2026'
 * literal, which is what every route in this file previously defaulted to and
 * which would silently keep reporting a stale year forever once the school
 * rolled over.
 */
async function resolvePeriod(req: Request): Promise<{ academicYear: string; term: number }> {
  const settings = await settingsService.getMany([
    SETTING_KEYS.CURRENT_ACADEMIC_YEAR,
    SETTING_KEYS.CURRENT_TERM,
  ])

  const queryYear = typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined
  const queryTerm = typeof req.query.term === 'string' ? Number(req.query.term) : undefined

  return {
    academicYear: queryYear ?? settings[SETTING_KEYS.CURRENT_ACADEMIC_YEAR],
    term:
      queryTerm !== undefined && Number.isInteger(queryTerm) && queryTerm >= 1 && queryTerm <= 3
        ? queryTerm
        : settings[SETTING_KEYS.CURRENT_TERM],
  }
}

/** Optional term filter — distinct from resolvePeriod(): omitting `term`
 *  here means "all terms", not "the current term". */
function optionalTerm(req: Request): number | undefined {
  const raw = req.query.term
  if (typeof raw !== 'string') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : undefined
}

/** A positive-integer window parameter (days / months / weeks / limit). */
function positiveInt(raw: unknown, fallback: number): number {
  if (typeof raw !== 'string') return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/**
 * Resolves which student a /student/* route is about.
 *
 * A `student` caller may ONLY ever read their own record: their `studentId`
 * query parameter is ignored outright rather than defaulted from, because
 * honouring it would let any student read any other student's results by
 * guessing an id. Every other caller must hold
 * report.viewAnyStudentPerformance (enforced by the route's middleware) and
 * must name the student explicitly.
 *
 * Returns null and sends the response itself when the request cannot be
 * resolved, so the handler can simply `return`.
 */
function resolveStudentId(req: Request, res: Response): string | null {
  if (req.user!.role === 'student') return req.user!.uid

  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined
  if (!studentId) {
    res.status(400).json({ error: 'studentId required.' })
    return null
  }
  return studentId
}

/** The permission spec for a /student/* route: a student reading their own
 *  record, or a staff member exercising the oversight lookup. */
const OWN_PERFORMANCE = ['report.viewOwnPerformance', 'report.viewAnyStudentPerformance'] as const
const OWN_FEE_STATEMENT = ['report.viewOwnFeeStatement', 'report.viewAnyStudentPerformance'] as const
const OWN_ATTENDANCE = ['report.viewOwnAttendance', 'report.viewAnyStudentPerformance'] as const

// ─── ADMIN ───────────────────────────────────────────────────────────────────
// admin's report permissions are system-level: login attempts, audit logs,
// database metrics. These five routes are the only ones in this file that
// legitimately belong to admin.

analyticsRouter.get('/admin/login-trend',
  verifyAuth, requirePermission('report.viewLoginAttempts'),
  async (req, res) => {
    res.json(await analytics.getAdminLoginTrend(positiveInt(req.query.days, 30)))
  })

analyticsRouter.get('/admin/activity-heatmap',
  verifyAuth, requirePermission('report.viewAuditLogs'),
  async (_req, res) => {
    res.json(await analytics.getAdminActivityHeatmap())
  })

analyticsRouter.get('/admin/entity-activity',
  verifyAuth, requirePermission('report.viewAuditLogs'),
  async (req, res) => {
    res.json(await analytics.getAdminEntityActivityBreakdown(positiveInt(req.query.days, 30)))
  })

analyticsRouter.get('/admin/action-breakdown',
  verifyAuth, requirePermission('report.viewAuditLogs'),
  async (req, res) => {
    res.json(await analytics.getAdminActionBreakdown(positiveInt(req.query.days, 30)))
  })

analyticsRouter.get('/admin/audit-volume',
  verifyAuth, requirePermission('report.viewAuditLogs'),
  async (req, res) => {
    res.json(await analytics.getAdminAuditVolumeTrend(positiveInt(req.query.days, 30)))
  })

// ─── SCHOOL-WIDE PERFORMANCE ─────────────────────────────────────────────────
// report.viewSchoolPerformance → high_rank, exam_officer
// report.viewClassPerformance  → high_rank, academic, exam_officer
// report.viewTeacherEffectiveness → high_rank, exam_officer
// (admin holds none of these; exam_officer/academic were wrongly excluded.)

analyticsRouter.get('/school/performance-trend',
  verifyAuth, requirePermission('report.viewSchoolPerformance'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    const years = typeof req.query.years === 'string'
      ? req.query.years.split(',').filter(Boolean)
      : [academicYear]
    res.json(await analytics.getHighRankSchoolPerformanceTrend(years))
  })

analyticsRouter.get('/school/class-comparison',
  verifyAuth, requirePermission('report.viewClassPerformance'),
  async (req, res) => {
    const { academicYear, term } = await resolvePeriod(req)
    res.json(await analytics.getHighRankClassComparison(academicYear, term))
  })

analyticsRouter.get('/school/subject-comparison',
  verifyAuth, requirePermission('report.viewClassPerformance'),
  async (req, res) => {
    const { academicYear, term } = await resolvePeriod(req)
    res.json(await analytics.getHighRankSubjectComparison(academicYear, term))
  })

analyticsRouter.get('/school/teacher-effectiveness',
  verifyAuth, requirePermission('report.viewTeacherEffectiveness'),
  async (req, res) => {
    const { academicYear, term } = await resolvePeriod(req)
    res.json(await analytics.getTeacherEffectivenessMatrix(academicYear, term))
  })

analyticsRouter.get('/school/enrollment-trend',
  verifyAuth, requirePermission('report.viewStudentRegistration'),
  async (req, res) => {
    res.json(await analytics.getHighRankEnrollmentTrend(positiveInt(req.query.months, 12)))
  })

analyticsRouter.get('/school/financial-summary',
  verifyAuth, requirePermission('report.viewFinanceSummary'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await analytics.getHighRankFinancialSummary(academicYear))
  })

// [R14 — NEW] report.viewAttendanceSummary is granted to high_rank,
// lower_rank, academic, hr and exam_officer, and had no implementation.
analyticsRouter.get('/school/attendance-summary',
  verifyAuth, requirePermission('report.viewAttendanceSummary'),
  async (req, res) => {
    const { academicYear, term } = await resolvePeriod(req)
    res.json(await analytics.getSchoolAttendanceSummary(academicYear, term))
  })

// ─── FINANCE ─────────────────────────────────────────────────────────────────
// report.viewFeeCollection / viewOutstandingBalances / viewExpenseBreakdown /
// viewPayrollSummary / viewScholarshipSummary → high_rank + finance.

analyticsRouter.get('/finance/collection-by-day',
  verifyAuth, requirePermission('report.viewFeeCollection'),
  async (req, res) => {
    res.json(await analytics.getFinanceCollectionByDay(positiveInt(req.query.days, 30)))
  })

analyticsRouter.get('/finance/collection-by-month',
  verifyAuth, requirePermission('report.viewFeeCollection'),
  async (req, res) => {
    res.json(await analytics.getFinanceCollectionByMonth(positiveInt(req.query.months, 12)))
  })

analyticsRouter.get('/finance/outstanding-by-class',
  verifyAuth, requirePermission('report.viewOutstandingBalances'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await analytics.getFinanceOutstandingByClass(academicYear, optionalTerm(req)))
  })

analyticsRouter.get('/finance/expense-breakdown',
  verifyAuth, requirePermission('report.viewExpenseBreakdown'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await analytics.getFinanceExpenseBreakdown(academicYear, optionalTerm(req)))
  })

analyticsRouter.get('/finance/budget-vs-actual',
  verifyAuth, requirePermission('report.viewExpenseBreakdown'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await analytics.getFinanceBudgetVsActual(academicYear, optionalTerm(req)))
  })

analyticsRouter.get('/finance/cash-flow',
  verifyAuth, requirePermission('report.viewFinanceSummary'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await analytics.getFinanceCashFlow(academicYear))
  })

analyticsRouter.get('/finance/payroll-trend',
  verifyAuth, requirePermission('report.viewPayrollSummary'),
  async (req, res) => {
    res.json(await analytics.getFinancePayrollTrend(positiveInt(req.query.months, 12)))
  })

// [R14 — NEW] report.viewScholarshipSummary is granted to high_rank and
// finance, and had no implementation at any layer.
analyticsRouter.get('/finance/scholarship-summary',
  verifyAuth, requirePermission('report.viewScholarshipSummary'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await analytics.getFinanceScholarshipSummary(academicYear))
  })

// ─── LIBRARY ─────────────────────────────────────────────────────────────────
// report.viewLibraryUsage / viewInventoryStatus → high_rank + library.

analyticsRouter.get('/library/borrowing-trend',
  verifyAuth, requirePermission('report.viewLibraryUsage'),
  async (req, res) => {
    res.json(await analytics.getLibraryBorrowingTrend(positiveInt(req.query.weeks, 12)))
  })

analyticsRouter.get('/library/inventory-health',
  verifyAuth, requirePermission('report.viewInventoryStatus'),
  async (_req, res) => {
    res.json(await analytics.getLibraryInventoryHealth())
  })

analyticsRouter.get('/library/top-borrowed',
  verifyAuth, requirePermission('report.viewLibraryUsage'),
  async (req, res) => {
    res.json(await analytics.getLibraryTopBorrowed(positiveInt(req.query.limit, 10)))
  })

analyticsRouter.get('/library/digital-stats',
  verifyAuth, requirePermission('report.viewLibraryUsage'),
  async (_req, res) => {
    res.json(await analytics.getLibraryDigitalStats())
  })

// ─── ADMISSIONS / REGISTRATION ───────────────────────────────────────────────
// report.viewAdmissionTrends / viewStudentRegistration → high_rank + lower_rank.

analyticsRouter.get('/lower-rank/applications-funnel',
  verifyAuth, requirePermission('report.viewAdmissionTrends'),
  async (_req, res) => {
    res.json(await analytics.getLowerRankApplicationsFunnel())
  })

analyticsRouter.get('/lower-rank/application-trend',
  verifyAuth, requirePermission('report.viewAdmissionTrends'),
  async (req, res) => {
    res.json(await analytics.getLowerRankApplicationTrend(positiveInt(req.query.months, 12)))
  })

analyticsRouter.get('/lower-rank/enrollment-by-form',
  verifyAuth, requirePermission('report.viewStudentRegistration'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await analytics.getLowerRankEnrollmentByForm(academicYear))
  })

// ─── ACADEMIC STAFF ──────────────────────────────────────────────────────────
// These two are scoped to the CALLER's own classes by req.user.uid — they are
// not an arbitrary-teacher lookup, so report.viewClassPerformance (which
// academic, high_rank and exam_officer all hold) is the correct gate.

analyticsRouter.get('/academic/subject-performance',
  verifyAuth, requirePermission('report.viewClassPerformance'),
  async (req, res) => {
    const { academicYear, term } = await resolvePeriod(req)
    res.json(await analytics.getAcademicClassSubjectPerformance(req.user!.uid, academicYear, term))
  })

analyticsRouter.get('/academic/assignment-completion',
  verifyAuth, requirePermission('report.viewAssignmentCompletion'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await analytics.getAcademicAssignmentCompletion(req.user!.uid, academicYear))
  })

analyticsRouter.get('/academic/marks-distribution',
  verifyAuth, requirePermission('report.viewClassPerformance'),
  async (req, res) => {
    const examId = typeof req.query.examId === 'string' ? req.query.examId : undefined
    if (!examId) {
      res.status(400).json({ error: 'examId required.' })
      return
    }
    res.json(await analytics.getAcademicMarksDistribution(examId))
  })

// ─── STUDENT ─────────────────────────────────────────────────────────────────
// A `student` reads only their own record (resolveStudentId ignores their
// studentId query param outright). Any other caller must hold
// report.viewAnyStudentPerformance — the permission R14 adds precisely because
// the arbitrary-studentId lookup these routes have always served was covered by
// nothing in the matrix.

analyticsRouter.get('/student/performance-trend',
  verifyAuth, requireAnyPermission(OWN_PERFORMANCE),
  async (req, res) => {
    const studentId = resolveStudentId(req, res)
    if (studentId === null) return
    res.json(await analytics.getStudentPerformanceTrend(studentId))
  })

analyticsRouter.get('/student/subject-breakdown',
  verifyAuth, requireAnyPermission(OWN_PERFORMANCE),
  async (req, res) => {
    const studentId = resolveStudentId(req, res)
    if (studentId === null) return
    const { academicYear, term } = await resolvePeriod(req)
    res.json(await analytics.getStudentSubjectBreakdown(studentId, academicYear, term))
  })

analyticsRouter.get('/student/fee-statement',
  verifyAuth, requireAnyPermission(OWN_FEE_STATEMENT),
  async (req, res) => {
    const studentId = resolveStudentId(req, res)
    if (studentId === null) return
    res.json(await analytics.getStudentFeeStatement(studentId))
  })

// [R14 — NEW] report.viewOwnAttendance is granted to the student role and had
// no implementation at any layer.
analyticsRouter.get('/student/attendance',
  verifyAuth, requireAnyPermission(OWN_ATTENDANCE),
  async (req, res) => {
    const studentId = resolveStudentId(req, res)
    if (studentId === null) return
    const { academicYear, term } = await resolvePeriod(req)
    res.json(await analytics.getOwnAttendanceSummary(studentId, academicYear, term))
  })

// ─── MANEB ───────────────────────────────────────────────────────────────────
// MANEB results are national-exam data. report.viewSchoolPerformance is held by
// high_rank and exam_officer — the two roles with a real MANEB oversight
// function. The candidate list additionally carries per-student grades, so it
// is gated on the arbitrary-student-lookup permission as well: a role may see
// the school's aggregate MANEB statistics without thereby being entitled to
// every named candidate's individual result sheet.

analyticsRouter.get('/maneb/school-stats',
  verifyAuth, requirePermission('report.viewSchoolPerformance'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await analytics.getManebSchoolStats(academicYear))
  })

analyticsRouter.get('/maneb/candidates',
  verifyAuth, requirePermission('report.viewSchoolPerformance'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    const examType = req.query.examType === 'JCE' || req.query.examType === 'MSCE'
      ? req.query.examType
      : undefined
    res.json(await analytics.getManebCandidateList(academicYear, examType))
  })

// ─── HR ──────────────────────────────────────────────────────────────────────
// report.viewHRReports → high_rank + hr.

analyticsRouter.get('/hr/staff-by-department',
  verifyAuth, requirePermission('report.viewHRReports'),
  async (_req, res) => {
    res.json(await analytics.getHRStaffByDepartment())
  })

analyticsRouter.get('/hr/leave-by-type',
  verifyAuth, requirePermission('report.viewHRReports'),
  async (req, res) => {
    res.json(await analytics.getHRLeaveByType(positiveInt(req.query.year, new Date().getFullYear())))
  })

analyticsRouter.get('/hr/leave-trend',
  verifyAuth, requirePermission('report.viewHRReports'),
  async (req, res) => {
    res.json(await analytics.getHRLeaveTrend(positiveInt(req.query.months, 12)))
  })

// ─── PLACEMENT ANALYTICS (R18) ───────────────────────────────────────────────

/**
 * [R18 — NEW] Cohort university-placement analytics for an academic year.
 * Gated by placement.viewAnalytics (held by all nine roles, incl. student —
 * placement outcomes are culturally public at Malawian schools). The academic
 * year defaults to the current one from settings when not supplied.
 */
analyticsRouter.get('/placements',
  verifyAuth, requirePermission('placement.viewAnalytics'),
  async (req: Request, res: Response) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await analytics.getPlacementAnalytics(academicYear))
  })

// ─── CAPABILITY PROBE ────────────────────────────────────────────────────────

/**
 * [R14 — NEW] Which report capabilities does the caller actually hold?
 *
 * reports/page.tsx renders a role's tab set and its export affordance from a
 * hardcoded client-side map. That map is a UX convenience, not a security
 * boundary (every route above is), but it can and did drift from the real
 * matrix. This endpoint lets the page render exactly the tabs the caller can
 * actually load data for, from the one authoritative source, so a user is
 * never shown a tab that 403s the moment they click it.
 */
analyticsRouter.get('/capabilities',
  verifyAuth,
  async (req, res) => {
    const role = req.user!.role
    res.json({
      role,
      canExport: hasPermission(role, 'report.export'),
      canViewAnyStudent: hasPermission(role, 'report.viewAnyStudentPerformance'),
      canViewAttendanceSummary: hasPermission(role, 'report.viewAttendanceSummary'),
      canViewScholarshipSummary: hasPermission(role, 'report.viewScholarshipSummary'),
    })
  })
