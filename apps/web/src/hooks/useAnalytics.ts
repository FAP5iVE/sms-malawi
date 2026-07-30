/**
 * apps/web/src/hooks/useAnalytics.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [R-PHASE]: R14 — Analytics & Reports Domain
 * [PURPOSE]: This file's entire previous content was the 34-character string
 *   `apps/web/src/hooks/useAnalytics.ts` — its own file path, not valid
 *   TypeScript, exporting nothing. reports/page.tsx imports 34 named hooks
 *   from it across nine import statements, so the whole 1,548-line Reports &
 *   Analytics page — the reporting surface for all nine roles — failed to
 *   resolve its imports and could not load at all. "Rewrite" here means
 *   writing the file from scratch against its confirmed-correct backend:
 *   analyticsService.ts and analytics.ts are both real, complete and
 *   schema-correct, so the page becomes functional the moment this file does.
 *
 *   Every hook is a thin TanStack Query wrapper over exactly one analytics.ts
 *   route, following the convention R1 established: apiFetch and queryKeys are
 *   imported from the canonical @/lib/api-client singleton — never a local
 *   reimplementation, which would silently lose the 401-force-refresh-retry
 *   path every other hook in the codebase gets for free.
 *
 *   Response types come from @shared/types/api — the real, declared shape of
 *   what each route returns — so no consumer needs an `as` cast to read them.
 *   (reports/page.tsx historically cast every one of these; R14 removes that
 *   need at the source rather than at each of ~30 call sites.)
 *
 *   staleTime is set per hook from QueryProvider's STALE categories, chosen by
 *   the data's real volatility: STATIC for a fixed historical MANEB cohort,
 *   SLOW for library inventory and HR staffing, MEDIUM for term-scoped
 *   academic and finance reporting, FAST for the admin security dashboard,
 *   whose whole purpose is noticing a login-failure spike promptly.
 *
 *   Five hooks beyond the 34 the page already imported are added, each backing
 *   a real, role-gated endpoint that had no frontend consumer at all:
 *   useAcademicMarksDistribution, useManebCandidates (both fully built and
 *   zero-consumer before R14), useScholarshipSummary, useAttendanceSummary and
 *   useOwnAttendance (the three endpoints R14 implements for permissions the
 *   matrix granted but nothing served), plus useReportCapabilities.
 * [DEPENDS ON]: W/lib/api-client.ts (R1 singleton),
 *   W/server/routes/analytics.ts, S/types/api.ts,
 *   W/components/providers/QueryProvider.tsx (STALE)
 */
'use client'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { STALE } from '@/components/providers/QueryProvider'
import type {
  ApiLoginTrendPoint,
  ApiActivityHeatmapCell,
  ApiCategoryBreakdown,
  ApiTimeSeriesPoint,
  ApiDualSeriesPoint,
  ApiSchoolPerformanceTrendPoint,
  ApiClassPerformanceStat,
  ApiSubjectAverageStat,
  ApiTeacherEffectivenessRow,
  ApiEnrollmentTrendPoint,
  ApiCashFlowRow,
  ApiBudgetVsActualRow,
  ApiOutstandingByClassRow,
  ApiAcademicSubjectPerformanceRow,
  ApiScholarshipSummary,
  ApiAttendanceSummary,
  ApiOwnAttendanceSummary,
  ApiLibraryInventoryHealth,
  ApiTopBorrowedBook,
  ApiLibraryDigitalStats,
  ApiApplicationFunnelStage,
  ApiAssignmentCompletionRow,
  ApiMarksDistributionBucket,
  ApiStudentPerformancePoint,
  ApiStudentSubjectScore,
  ApiStudentFeeStatement,
  ApiManebSchoolStat,
  ApiManebResultSummary,
} from '@shared/types/api'

// ─── QUERY-STRING HELPER ─────────────────────────────────────────────────────

/**
 * Builds a query string from only the params that actually have a value.
 *
 * Every route in analytics.ts now treats an absent param as "use the school's
 * current academic year / term from SystemSettings" — so sending
 * `?term=undefined` (which naive template-literal interpolation produces) is
 * meaningfully different from sending nothing, and would be parsed as a
 * garbage term rather than falling back to the configured one.
 */
function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const rendered = search.toString()
  return rendered ? `?${rendered}` : ''
}

// ─── ADMIN ───────────────────────────────────────────────────────────────────
// The admin security dashboard exists to notice a failed-login spike while it
// is still happening — hence STALE.FAST rather than the MEDIUM default.

export function useAdminLoginTrend(days = 30) {
  return useQuery({
    queryKey: queryKeys.analytics.adminLoginTrend(days),
    queryFn: () => apiFetch<ApiLoginTrendPoint[]>(`/analytics/admin/login-trend${qs({ days })}`),
    staleTime: STALE.FAST,
  })
}

export function useAdminActivityHeatmap() {
  return useQuery({
    queryKey: queryKeys.analytics.adminActivityHeatmap(),
    queryFn: () => apiFetch<ApiActivityHeatmapCell[]>('/analytics/admin/activity-heatmap'),
    staleTime: STALE.SLOW,
  })
}

export function useAdminEntityActivity(days = 30) {
  return useQuery({
    queryKey: queryKeys.analytics.adminEntityActivity(days),
    queryFn: () => apiFetch<ApiCategoryBreakdown[]>(`/analytics/admin/entity-activity${qs({ days })}`),
    staleTime: STALE.MEDIUM,
  })
}

export function useAdminActionBreakdown(days = 30) {
  return useQuery({
    queryKey: queryKeys.analytics.adminActionBreakdown(days),
    queryFn: () => apiFetch<ApiCategoryBreakdown[]>(`/analytics/admin/action-breakdown${qs({ days })}`),
    staleTime: STALE.MEDIUM,
  })
}

export function useAdminAuditVolumeTrend(days = 30) {
  return useQuery({
    queryKey: queryKeys.analytics.adminAuditVolume(days),
    queryFn: () => apiFetch<ApiTimeSeriesPoint[]>(`/analytics/admin/audit-volume${qs({ days })}`),
    staleTime: STALE.FAST,
  })
}

// ─── SCHOOL-WIDE PERFORMANCE ─────────────────────────────────────────────────

export function useSchoolPerformanceTrend(years: readonly string[]) {
  return useQuery({
    queryKey: queryKeys.analytics.schoolPerformanceTrend(years),
    queryFn: () =>
      apiFetch<ApiSchoolPerformanceTrendPoint[]>(
        `/analytics/school/performance-trend${qs({ years: years.join(',') })}`,
      ),
    enabled: years.length > 0,
    staleTime: STALE.MEDIUM,
  })
}

export function useClassComparison(academicYear: string, term: number) {
  return useQuery({
    queryKey: queryKeys.analytics.schoolClassComparison(academicYear, term),
    queryFn: () =>
      apiFetch<ApiClassPerformanceStat[]>(
        `/analytics/school/class-comparison${qs({ academicYear, term })}`,
      ),
    staleTime: STALE.MEDIUM,
  })
}

export function useSubjectComparison(academicYear: string, term: number) {
  return useQuery({
    queryKey: queryKeys.analytics.schoolSubjectComparison(academicYear, term),
    queryFn: () =>
      apiFetch<ApiSubjectAverageStat[]>(
        `/analytics/school/subject-comparison${qs({ academicYear, term })}`,
      ),
    staleTime: STALE.MEDIUM,
  })
}

export function useTeacherEffectiveness(academicYear: string, term: number) {
  return useQuery({
    queryKey: queryKeys.analytics.schoolTeacherEffectiveness(academicYear, term),
    queryFn: () =>
      apiFetch<ApiTeacherEffectivenessRow[]>(
        `/analytics/school/teacher-effectiveness${qs({ academicYear, term })}`,
      ),
    staleTime: STALE.MEDIUM,
  })
}

export function useEnrollmentTrend(months = 12) {
  return useQuery({
    queryKey: queryKeys.analytics.schoolEnrollmentTrend(months),
    queryFn: () =>
      apiFetch<ApiEnrollmentTrendPoint[]>(`/analytics/school/enrollment-trend${qs({ months })}`),
    staleTime: STALE.SLOW,
  })
}

export function useHighRankFinancialSummary(academicYear: string) {
  return useQuery({
    queryKey: queryKeys.analytics.schoolFinancialSummary(academicYear),
    queryFn: () =>
      apiFetch<ApiCashFlowRow[]>(`/analytics/school/financial-summary${qs({ academicYear })}`),
    staleTime: STALE.MEDIUM,
  })
}

/** [R14 — NEW endpoint] report.viewAttendanceSummary. */
export function useAttendanceSummary(academicYear: string, term: number) {
  return useQuery({
    queryKey: queryKeys.analytics.schoolAttendanceSummary(academicYear, term),
    queryFn: () =>
      apiFetch<ApiAttendanceSummary>(
        `/analytics/school/attendance-summary${qs({ academicYear, term })}`,
      ),
    staleTime: STALE.FAST,
  })
}

// ─── FINANCE ─────────────────────────────────────────────────────────────────

export function useFinanceCollectionByDay(days = 30) {
  return useQuery({
    queryKey: queryKeys.analytics.financeCollectionByDay(days),
    queryFn: () =>
      apiFetch<ApiTimeSeriesPoint[]>(`/analytics/finance/collection-by-day${qs({ days })}`),
    staleTime: STALE.FAST,
  })
}

export function useFinanceCollectionByMonth(months = 12) {
  return useQuery({
    queryKey: queryKeys.analytics.financeCollectionByMonth(months),
    queryFn: () =>
      apiFetch<ApiTimeSeriesPoint[]>(`/analytics/finance/collection-by-month${qs({ months })}`),
    staleTime: STALE.MEDIUM,
  })
}

export function useFinanceOutstandingByClass(academicYear: string, term?: number) {
  return useQuery({
    queryKey: queryKeys.analytics.financeOutstandingByClass(academicYear, term),
    queryFn: () =>
      apiFetch<ApiOutstandingByClassRow[]>(
        `/analytics/finance/outstanding-by-class${qs({ academicYear, term })}`,
      ),
    staleTime: STALE.MEDIUM,
  })
}

export function useFinanceExpenseBreakdown(academicYear: string, term?: number) {
  return useQuery({
    queryKey: queryKeys.analytics.financeExpenseBreakdown(academicYear, term),
    queryFn: () =>
      apiFetch<ApiCategoryBreakdown[]>(
        `/analytics/finance/expense-breakdown${qs({ academicYear, term })}`,
      ),
    staleTime: STALE.MEDIUM,
  })
}

export function useFinanceBudgetVsActual(academicYear: string, term?: number) {
  return useQuery({
    queryKey: queryKeys.analytics.financeBudgetVsActual(academicYear, term),
    queryFn: () =>
      apiFetch<ApiBudgetVsActualRow[]>(
        `/analytics/finance/budget-vs-actual${qs({ academicYear, term })}`,
      ),
    staleTime: STALE.MEDIUM,
  })
}

export function useFinanceCashFlow(academicYear: string) {
  return useQuery({
    queryKey: queryKeys.analytics.financeCashFlow(academicYear),
    queryFn: () => apiFetch<ApiCashFlowRow[]>(`/analytics/finance/cash-flow${qs({ academicYear })}`),
    staleTime: STALE.MEDIUM,
  })
}

export function useFinancePayrollTrend(months = 12) {
  return useQuery({
    queryKey: queryKeys.analytics.financePayrollTrend(months),
    queryFn: () =>
      apiFetch<ApiTimeSeriesPoint[]>(`/analytics/finance/payroll-trend${qs({ months })}`),
    staleTime: STALE.SLOW,
  })
}

/** [R14 — NEW endpoint] report.viewScholarshipSummary. */
export function useScholarshipSummary(academicYear: string) {
  return useQuery({
    queryKey: queryKeys.analytics.financeScholarshipSummary(academicYear),
    queryFn: () =>
      apiFetch<ApiScholarshipSummary>(
        `/analytics/finance/scholarship-summary${qs({ academicYear })}`,
      ),
    staleTime: STALE.SLOW,
  })
}

// ─── LIBRARY ─────────────────────────────────────────────────────────────────

export function useLibraryBorrowingTrend(weeks = 12) {
  return useQuery({
    queryKey: queryKeys.analytics.libraryBorrowingTrend(weeks),
    queryFn: () =>
      apiFetch<ApiTimeSeriesPoint[]>(`/analytics/library/borrowing-trend${qs({ weeks })}`),
    staleTime: STALE.SLOW,
  })
}

export function useLibraryInventoryHealth() {
  return useQuery({
    queryKey: queryKeys.analytics.libraryInventoryHealth(),
    queryFn: () => apiFetch<ApiLibraryInventoryHealth>('/analytics/library/inventory-health'),
    staleTime: STALE.SLOW,
  })
}

export function useLibraryTopBorrowed(limit = 10) {
  return useQuery({
    queryKey: queryKeys.analytics.libraryTopBorrowed(limit),
    queryFn: () => apiFetch<ApiTopBorrowedBook[]>(`/analytics/library/top-borrowed${qs({ limit })}`),
    staleTime: STALE.SLOW,
  })
}

export function useLibraryDigitalStats() {
  return useQuery({
    queryKey: queryKeys.analytics.libraryDigitalStats(),
    queryFn: () => apiFetch<ApiLibraryDigitalStats>('/analytics/library/digital-stats'),
    staleTime: STALE.SLOW,
  })
}

// ─── ADMISSIONS / REGISTRATION ───────────────────────────────────────────────

export function useApplicationsFunnel() {
  return useQuery({
    queryKey: queryKeys.analytics.applicationsFunnel(),
    queryFn: () =>
      apiFetch<ApiApplicationFunnelStage[]>('/analytics/lower-rank/applications-funnel'),
    staleTime: STALE.FAST,
  })
}

export function useApplicationTrend(months = 12) {
  return useQuery({
    queryKey: queryKeys.analytics.applicationTrend(months),
    queryFn: () =>
      apiFetch<ApiTimeSeriesPoint[]>(`/analytics/lower-rank/application-trend${qs({ months })}`),
    staleTime: STALE.MEDIUM,
  })
}

export function useEnrollmentByForm(academicYear: string) {
  return useQuery({
    queryKey: queryKeys.analytics.enrollmentByForm(academicYear),
    queryFn: () =>
      apiFetch<ApiCategoryBreakdown[]>(
        `/analytics/lower-rank/enrollment-by-form${qs({ academicYear })}`,
      ),
    staleTime: STALE.SLOW,
  })
}

// ─── ACADEMIC STAFF ──────────────────────────────────────────────────────────

export function useAcademicSubjectPerformance(academicYear: string, term: number) {
  return useQuery({
    queryKey: queryKeys.analytics.academicSubjectPerformance(academicYear, term),
    queryFn: () =>
      apiFetch<ApiAcademicSubjectPerformanceRow[]>(
        `/analytics/academic/subject-performance${qs({ academicYear, term })}`,
      ),
    staleTime: STALE.MEDIUM,
  })
}

export function useAcademicAssignmentCompletion(academicYear: string) {
  return useQuery({
    queryKey: queryKeys.analytics.academicAssignmentCompletion(academicYear),
    queryFn: () =>
      apiFetch<ApiAssignmentCompletionRow[]>(
        `/analytics/academic/assignment-completion${qs({ academicYear })}`,
      ),
    staleTime: STALE.MEDIUM,
  })
}

/**
 * [R14] Fully built, role-gated, and until now a zero-consumer endpoint — the
 * marks-distribution histogram existed server-side with no hook to reach it.
 * Disabled until an exam is actually selected; the route 400s without one.
 */
export function useAcademicMarksDistribution(examId: string) {
  return useQuery({
    queryKey: queryKeys.analytics.academicMarksDistribution(examId),
    queryFn: () =>
      apiFetch<ApiMarksDistributionBucket[]>(
        `/analytics/academic/marks-distribution${qs({ examId })}`,
      ),
    enabled: examId.length > 0,
    staleTime: STALE.MEDIUM,
  })
}

// ─── STUDENT ─────────────────────────────────────────────────────────────────
// A `student` caller's own studentId is resolved server-side from their verified
// token, not from the query string — so these hooks pass studentId only for the
// staff oversight path (report.viewAnyStudentPerformance), and a student's own
// report works with an empty studentId.

export function useStudentPerformanceTrend(studentId: string) {
  return useQuery({
    queryKey: queryKeys.analytics.studentPerformanceTrend(studentId),
    queryFn: () =>
      apiFetch<ApiStudentPerformancePoint[]>(
        `/analytics/student/performance-trend${qs({ studentId: studentId || undefined })}`,
      ),
    staleTime: STALE.MEDIUM,
  })
}

export function useStudentSubjectBreakdown(
  studentId: string,
  academicYear: string,
  term: number,
) {
  return useQuery({
    queryKey: queryKeys.analytics.studentSubjectBreakdown(studentId, academicYear, term),
    queryFn: () =>
      apiFetch<ApiStudentSubjectScore[]>(
        `/analytics/student/subject-breakdown${qs({
          studentId: studentId || undefined,
          academicYear,
          term,
        })}`,
      ),
    staleTime: STALE.MEDIUM,
  })
}

export function useStudentFeeStatement(studentId: string) {
  return useQuery({
    queryKey: queryKeys.analytics.studentFeeStatement(studentId),
    queryFn: () =>
      apiFetch<ApiStudentFeeStatement[]>(
        `/analytics/student/fee-statement${qs({ studentId: studentId || undefined })}`,
      ),
    staleTime: STALE.FAST,
  })
}

/** [R14 — NEW endpoint] report.viewOwnAttendance. */
export function useOwnAttendance(studentId: string, academicYear?: string, term?: number) {
  return useQuery({
    queryKey: queryKeys.analytics.studentAttendance(studentId, academicYear, term),
    queryFn: () =>
      apiFetch<ApiOwnAttendanceSummary>(
        `/analytics/student/attendance${qs({
          studentId: studentId || undefined,
          academicYear: academicYear || undefined,
          term: term || undefined,
        })}`,
      ),
    staleTime: STALE.FAST,
  })
}

// ─── MANEB ───────────────────────────────────────────────────────────────────
// MANEB results are a national exam board's final, published output for a
// closed cohort — once released they do not change, which is exactly what
// STALE.STATIC describes.

export function useManebSchoolStats(academicYear: string) {
  return useQuery({
    queryKey: queryKeys.analytics.manebSchoolStats(academicYear),
    queryFn: () =>
      apiFetch<ApiManebSchoolStat[]>(`/analytics/maneb/school-stats${qs({ academicYear })}`),
    staleTime: STALE.STATIC,
  })
}

/**
 * [R14] The second fully-built, zero-consumer analytics endpoint — the MANEB
 * candidate list existed server-side with no hook to reach it.
 */
export function useManebCandidates(academicYear: string, examType?: 'JCE' | 'MSCE') {
  return useQuery({
    queryKey: queryKeys.analytics.manebCandidates(academicYear, examType),
    queryFn: () =>
      apiFetch<ApiManebResultSummary[]>(
        `/analytics/maneb/candidates${qs({ academicYear, examType })}`,
      ),
    staleTime: STALE.STATIC,
  })
}

// ─── HR ──────────────────────────────────────────────────────────────────────

export function useHRStaffByDepartment() {
  return useQuery({
    queryKey: queryKeys.analytics.hrStaffByDepartment(),
    queryFn: () => apiFetch<ApiCategoryBreakdown[]>('/analytics/hr/staff-by-department'),
    staleTime: STALE.SLOW,
  })
}

export function useHRLeaveByType(year: number = new Date().getFullYear()) {
  return useQuery({
    queryKey: queryKeys.analytics.hrLeaveByType(year),
    queryFn: () => apiFetch<ApiCategoryBreakdown[]>(`/analytics/hr/leave-by-type${qs({ year })}`),
    staleTime: STALE.SLOW,
  })
}

export function useHRLeaveTrend(months = 12) {
  return useQuery({
    queryKey: queryKeys.analytics.hrLeaveTrend(months),
    queryFn: () => apiFetch<ApiDualSeriesPoint[]>(`/analytics/hr/leave-trend${qs({ months })}`),
    staleTime: STALE.SLOW,
  })
}

// ─── CAPABILITY PROBE ────────────────────────────────────────────────────────

/** Response shape of GET /analytics/capabilities. */
export interface ReportCapabilities {
  role: string
  canExport: boolean
  canViewAnyStudent: boolean
  canViewAttendanceSummary: boolean
  canViewScholarshipSummary: boolean
}

/**
 * [R14 — NEW endpoint] What the caller may actually do in this module,
 * answered from ROLE_PERMISSIONS server-side rather than from a hardcoded
 * client-side role map that can (and did) drift from the real matrix. Backs
 * the export affordance, so a user is never offered a download their role
 * cannot perform.
 */
export function useReportCapabilities() {
  return useQuery({
    queryKey: queryKeys.analytics.capabilities(),
    queryFn: () => apiFetch<ReportCapabilities>('/analytics/capabilities'),
    staleTime: STALE.STATIC,
  })
}