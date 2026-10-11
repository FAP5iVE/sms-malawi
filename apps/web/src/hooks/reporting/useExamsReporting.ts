'use client'

import type { ApiExamPipeline, ApiMarkCompletion } from '@shared/types/reporting-exams'
import { useReportingQuery } from '@/hooks/useReporting'
import type { AttentionItem, HookOptions, PeriodParams, ReportSectionData } from './shared'

const D = 'exams'
const q = (p: PeriodParams) => ({ academicYear: p.academicYear, term: p.term })
const on = (p: PeriodParams, o?: HookOptions) => !!p.academicYear && (o?.enabled ?? true)

export const useExamOverview = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ReportSectionData>(D, 'overview', q(p), { enabled: on(p, o) })
export const useExamAttention = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<AttentionItem[]>(D, 'attention', q(p), { enabled: on(p, o) })
export const useMarkCompletion = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiMarkCompletion>(D, 'mark-completion', q(p), { enabled: on(p, o) })
export const useExamPipeline = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiExamPipeline>(D, 'pipeline', q(p), { enabled: on(p, o) })
