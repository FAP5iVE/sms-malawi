'use client'

import type {
  ApiStudentAssignments, ApiStudentAttendance, ApiStudentFees, ApiStudentLibrary, ApiStudentProgress,
} from '@shared/types/reporting-student'
import { useReportingQuery } from '@/hooks/useReporting'
import type { AttentionItem, HookOptions, PeriodParams, ReportSectionData } from './shared'

const D = 'student'
const q = (p: PeriodParams) => ({ academicYear: p.academicYear, term: p.term })
const on = (p: PeriodParams, o?: HookOptions) => !!p.academicYear && (o?.enabled ?? true)

export const useMyOverview = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ReportSectionData>(D, 'overview', q(p), { enabled: on(p, o) })
export const useMyAttention = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<AttentionItem[]>(D, 'attention', q(p), { enabled: on(p, o) })
export const useMyProgress = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiStudentProgress>(D, 'progress', q(p), { enabled: on(p, o) })
export const useMyAssignments = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiStudentAssignments>(D, 'assignments', q(p), { enabled: on(p, o) })
export const useMyAttendance = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiStudentAttendance>(D, 'attendance', q(p), { enabled: on(p, o) })
export const useMyLibrary = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiStudentLibrary>(D, 'library', { academicYear: p.academicYear }, { enabled: on(p, o) })
export const useMyFees = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiStudentFees>(D, 'fees', { academicYear: p.academicYear }, { enabled: on(p, o) })
