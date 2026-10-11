'use client'

import type { ApiAttendanceReport } from '@shared/types/reporting-attendance'
import { useReportingQuery } from '@/hooks/useReporting'
import type { AttentionItem, HookOptions, PeriodParams, ReportSectionData } from './shared'

const D = 'attendance'
const q = (p: PeriodParams) => ({ academicYear: p.academicYear, term: p.term })
const on = (p: PeriodParams, o?: HookOptions) => !!p.academicYear && (o?.enabled ?? true)

export const useAttendanceOverview = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ReportSectionData>(D, 'overview', q(p), { enabled: on(p, o) })
export const useAttendanceAttention = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<AttentionItem[]>(D, 'attention', q(p), { enabled: on(p, o) })
export const useAttendanceReport = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiAttendanceReport>(D, 'report', q(p), { enabled: on(p, o) })
