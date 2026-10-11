'use client'

import type { ApiProcurementPipeline, ApiStocktakeVariance } from '@shared/types/reporting-operations'
import { useReportingQuery } from '@/hooks/useReporting'
import type { HookOptions } from './shared'

const D = 'operations'

export const useProcurementPipeline = (days: number | undefined, o?: HookOptions) =>
  useReportingQuery<ApiProcurementPipeline>(D, 'procurement-pipeline', { days }, { enabled: o?.enabled ?? true })

export const useStocktakeVariance = (academicYear: string | undefined, o?: HookOptions) =>
  useReportingQuery<ApiStocktakeVariance>(D, 'stocktake-variance', { academicYear }, { enabled: !!academicYear && (o?.enabled ?? true) })
