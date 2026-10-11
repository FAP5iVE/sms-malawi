'use client'

import type { ApiExecutiveOverview } from '@shared/types/reporting-executive'
import { useReportingQuery } from '@/hooks/useReporting'
import type { AttentionItem, HookOptions, PeriodParams } from './shared'

const D = 'executive'
const q = (p: PeriodParams) => ({ academicYear: p.academicYear, term: p.term })
const on = (p: PeriodParams, o?: HookOptions) => !!p.academicYear && (o?.enabled ?? true)

export const useExecutiveOverview = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<ApiExecutiveOverview>(D, 'overview', q(p), { enabled: on(p, o) })
export const useExecutiveAttention = (p: PeriodParams, o?: HookOptions) =>
  useReportingQuery<AttentionItem[]>(D, 'attention', q(p), { enabled: on(p, o) })
