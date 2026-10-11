'use client'

import type {
  ApiAdoptionReport, ApiGovernanceReport, ApiSecurityReport, ApiSessionsReport,
} from '@shared/types/reporting-admin'
import { useReportingQuery } from '@/hooks/useReporting'
import type { AttentionItem, HookOptions, ReportSectionData } from './shared'

const D = 'admin'
const on = (o?: HookOptions) => o?.enabled ?? true

export const useAdminOverview = (o?: HookOptions) => useReportingQuery<ReportSectionData>(D, 'overview', undefined, { enabled: on(o) })
export const useAdminAttention = (o?: HookOptions) => useReportingQuery<AttentionItem[]>(D, 'attention', undefined, { enabled: on(o) })
export const useSecurityReport = (days: number, o?: HookOptions) =>
  useReportingQuery<ApiSecurityReport>(D, 'security', { days }, { enabled: on(o) })
export const useSessionsReport = (days: number, o?: HookOptions) =>
  useReportingQuery<ApiSessionsReport>(D, 'sessions', { days }, { enabled: on(o) })
export const useGovernanceReport = (days: number, o?: HookOptions) =>
  useReportingQuery<ApiGovernanceReport>(D, 'governance', { days }, { enabled: on(o) })
export const useAdoptionReport = (o?: HookOptions) => useReportingQuery<ApiAdoptionReport>(D, 'adoption', undefined, { enabled: on(o) })
