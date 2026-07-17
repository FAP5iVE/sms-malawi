/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useReports.ts
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation
 * [PURPOSE]: Per-role report hooks — repointed at the canonical apiFetch/queryKeys singleton (also fixes useSystemHealth's ['health'] literal, which never matched queryKeys.admin.systemHealth()'s cache entry used elsewhere).
 *
 *   [R14 — Analytics & Reports Domain] Every hook here called the generic
 *   apiFetch with no type argument, so `T` resolved to `unknown` and every
 *   consumer had to cast at the call site. Seven of these hooks
 *   (useSchoolReport, useFinanceReport, useLibraryReport, useHRReport,
 *   useAcademicReport, useExamOfficerReport, useStudentReport) had no
 *   consumer at all — R14 wires them into reports/page.tsx, so each now
 *   names the response type it actually returns and the page reads them
 *   without a cast. useStudentReport's `studentId` is also now omitted when
 *   empty rather than interpolated as an empty string: a `student` caller's
 *   own id is resolved server-side from their verified token, and
 *   `?studentId=` would be sent as a present-but-blank param.
 * [DEPENDS ON]: W/lib/api-client.ts, S/types/api.ts
 */
'use client'
import { useQuery } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import type {
  ApiAdminReport,
  ApiSchoolReport,
  ApiFinanceReport,
  ApiLibraryReport,
  ApiHRReport,
  ApiAcademicReport,
  ApiExamReport,
  ApiStudentReport,
  ApiAuditLogResponse,
} from '@shared/types/api'

export function useAdminReport()  { return useQuery({ queryKey: queryKeys.reports.admin(),   queryFn: () => apiFetch<ApiAdminReport>('/reports/admin') }) }
export function useSchoolReport(y: string, t: number)  { return useQuery({ queryKey: queryKeys.reports.school({ academicYear: y, term: t }), queryFn: () => apiFetch<ApiSchoolReport>(`/reports/school?academicYear=${y}&term=${t}`) }) }
export function useFinanceReport(y: string, t?: number){ return useQuery({ queryKey: queryKeys.reports.finance({ academicYear: y, term: t }), queryFn: () => apiFetch<ApiFinanceReport>(`/reports/finance?academicYear=${y}${t ? `&term=${t}` : ''}`) }) }
export function useLibraryReport() { return useQuery({ queryKey: queryKeys.reports.library(),  queryFn: () => apiFetch<ApiLibraryReport>('/reports/library') }) }
export function useHRReport()       { return useQuery({ queryKey: queryKeys.reports.hr(),       queryFn: () => apiFetch<ApiHRReport>('/reports/hr') }) }
export function useAcademicReport(y: string) { return useQuery({ queryKey: queryKeys.reports.academic({ academicYear: y }), queryFn: () => apiFetch<ApiAcademicReport>(`/reports/academic?academicYear=${y}`) }) }
export function useExamOfficerReport(y: string, t: number) { return useQuery({ queryKey: queryKeys.reports.examOfficer({ academicYear: y, term: t }), queryFn: () => apiFetch<ApiExamReport>(`/reports/exam-officer?academicYear=${y}&term=${t}`) }) }
export function useStudentReport(id: string) {
  const query = id ? `?studentId=${encodeURIComponent(id)}` : ''
  return useQuery({ queryKey: queryKeys.reports.student(id), queryFn: () => apiFetch<ApiStudentReport>(`/reports/student${query}`) })
}

export function useAuditLog(filters: {
  entityType?: string; actorUid?: string; action?: string; from?: string; to?: string; page?: number
} = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)) })
  return useQuery({ queryKey: queryKeys.reports.auditLogs(filters), queryFn: () => apiFetch<ApiAuditLogResponse>(`/reports/audit?${params}`) })
}

export function useSystemHealth() { return useQuery({ queryKey: queryKeys.admin.systemHealth(), queryFn: () => apiFetch('/health'), refetchInterval: 60_000 }) }
