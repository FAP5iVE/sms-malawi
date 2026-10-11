'use client'

import type {
  ApiHrContracts, ApiHrLeave, ApiHrLoans, ApiHrPromotions, ApiHrReviews, ApiHrWorkforce,
} from '@shared/types/reporting-hr'
import { useReportingQuery } from '@/hooks/useReporting'
import type { AttentionItem, HookOptions, ReportSectionData } from './shared'

const D = 'hr'
const on = (o?: HookOptions, ...needs: unknown[]) => (o?.enabled ?? true) && needs.every(Boolean)

export const useHrOverview = (academicYear: string | undefined, o?: HookOptions) =>
  useReportingQuery<ReportSectionData>(D, 'overview', { academicYear }, { enabled: on(o, academicYear) })

export const useHrAttention = (academicYear: string | undefined, o?: HookOptions) =>
  useReportingQuery<AttentionItem[]>(D, 'attention', { academicYear }, { enabled: on(o, academicYear) })

export const useHrWorkforce = (o?: HookOptions) => useReportingQuery<ApiHrWorkforce>(D, 'workforce', undefined, { enabled: on(o) })
export const useHrContracts = (o?: HookOptions) => useReportingQuery<ApiHrContracts>(D, 'contracts', undefined, { enabled: on(o) })
export const useHrLoans = (o?: HookOptions) => useReportingQuery<ApiHrLoans>(D, 'loans', undefined, { enabled: on(o) })
export const useHrPromotions = (o?: HookOptions) => useReportingQuery<ApiHrPromotions>(D, 'promotions', undefined, { enabled: on(o) })

export const useHrLeave = (year: number | undefined, o?: HookOptions) =>
  useReportingQuery<ApiHrLeave>(D, 'leave', { year }, { enabled: on(o, year) })

export const useHrReviews = (academicYear: string | undefined, o?: HookOptions) =>
  useReportingQuery<ApiHrReviews>(D, 'reviews', { academicYear }, { enabled: on(o, academicYear) })
