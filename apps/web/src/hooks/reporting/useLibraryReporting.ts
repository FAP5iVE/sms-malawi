'use client'

import type { ApiLibraryCirculation, ApiLibraryFines } from '@shared/types/reporting-library'
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
