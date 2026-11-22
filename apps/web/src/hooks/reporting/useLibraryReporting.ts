'use client'

import type { ApiLibraryCirculation, ApiLibraryDigital, ApiLibraryFines, ApiLibraryStock } from '@shared/types/reporting-library'
import { useReportingQuery } from '@/hooks/useReporting'
import type { AttentionItem, HookOptions, ReportSectionData } from './shared'

const D = 'library'
const on = (o?: HookOptions) => o?.enabled ?? true

export const useLibraryOverview = (o?: HookOptions) => useReportingQuery<ReportSectionData>(D, 'overview', undefined, { enabled: on(o) })
export const useLibraryAttention = (o?: HookOptions) => useReportingQuery<AttentionItem[]>(D, 'attention', undefined, { enabled: on(o) })
export const useLibraryCirculation = (days: number, o?: HookOptions) =>
  useReportingQuery<ApiLibraryCirculation>(D, 'circulation', { days }, { enabled: on(o) })
export const useLibraryFines = (months: number, o?: HookOptions) =>
  useReportingQuery<ApiLibraryFines>(D, 'fines', { months }, { enabled: on(o) })

type Params = Record<string, string | number | undefined>

export const useLibraryDigital = (params: Params, o?: HookOptions) =>
  useReportingQuery<ApiLibraryDigital>(D, 'digital', params, { enabled: on(o) })
export const useLibraryStock = (params: Params, o?: HookOptions) =>
  useReportingQuery<ApiLibraryStock>(D, 'stock', params, { enabled: on(o) })
