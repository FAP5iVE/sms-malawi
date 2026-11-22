'use client'

import type {
  ApiAssignmentReport, ApiExamReadiness, ApiStudentAttentionReport, ApiTeachingReport,
} from '@shared/types/reporting-academic'
import { useReportingQuery } from '@/hooks/useReporting'
import type { AttentionItem, HookOptions, PeriodParams, ReportSectionData } from './shared'

const D = 'academic'
const q = (p: PeriodParams) => ({ academicYear: p.academicYear, term: p.term })
const on = (p: PeriodParams, o?: HookOptions) => !!p.academicYear && (o?.enabled ?? true)

export const useAcademicOverview = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ReportSectionData>(D, 'overview', q(p), { enabled: on(p, o) })
export const useAcademicAttention = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<AttentionItem[]>(D, 'attention', q(p), { enabled: on(p, o) })
export const useTeachingReport = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiTeachingReport>(D, 'teaching', q(p), { enabled: on(p, o) })
export const useTeacherAssignments = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiAssignmentReport>(D, 'assignments', q(p), { enabled: on(p, o) })
export const useStudentsNeedingAttention = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiStudentAttentionReport>(D, 'students', q(p), { enabled: on(p, o) })
export const useExamReadiness = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiExamReadiness>(D, 'readiness', q(p), { enabled: on(p, o) })
