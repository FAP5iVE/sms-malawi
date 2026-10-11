'use client'

import type { ApiAdmissionsPipeline, ApiEnrollment } from '@shared/types/reporting-admissions'
import { useReportingQuery } from '@/hooks/useReporting'
import type { AttentionItem, HookOptions, PeriodParams, ReportSectionData } from './shared'

const D = 'admissions'
const on = (p: PeriodParams, o?: HookOptions) => !!p.academicYear && (o?.enabled ?? true)

export const useAdmissionsOverview = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ReportSectionData>(D, 'overview', { academicYear: p.academicYear, term: p.term }, { enabled: on(p, o) })
export const useAdmissionsAttention = (o?: HookOptions) =>
  useReportingQuery<AttentionItem[]>(D, 'attention', undefined, { enabled: o?.enabled ?? true })
export const useAdmissionsPipeline = (months = 12, o?: HookOptions) =>
  useReportingQuery<ApiAdmissionsPipeline>(D, 'pipeline', { months }, { enabled: o?.enabled ?? true })
export const useEnrollment = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiEnrollment>(D, 'enrollment', { academicYear: p.academicYear }, { enabled: on(p, o) })
