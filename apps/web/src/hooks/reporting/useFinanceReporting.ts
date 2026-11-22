'use client'

import type { ApiFinanceAging, ApiPaymentMix } from '@shared/types/reporting-finance'
import { useReportingQuery } from '@/hooks/useReporting'
import type { AttentionItem, HookOptions, PeriodParams, ReportSectionData } from './shared'

const D = 'finance'

export const useFinanceOverview = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ReportSectionData>(D, 'overview', { academicYear: p.academicYear, term: p.term }, { enabled: !!p.academicYear && (o?.enabled ?? true) })

export const useFinanceAttention = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<AttentionItem[]>(D, 'attention', { academicYear: p.academicYear, term: p.term }, { enabled: !!p.academicYear && (o?.enabled ?? true) })

export const useFinanceAging = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiFinanceAging>(D, 'aging', { academicYear: p.academicYear, term: p.term }, { enabled: !!p.academicYear && (o?.enabled ?? true) })

export const usePaymentMix = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiPaymentMix>(D, 'payment-mix', { academicYear: p.academicYear, term: p.term }, { enabled: !!p.academicYear && (o?.enabled ?? true) })
