'use client'

import type {
  ApiAssetRegisterReport, ApiProcurementPipeline, ApiProcurementValueReport, ApiStockReport, ApiStocktakeReport, ApiStocktakeVariance,
} from '@shared/types/reporting-operations'
import { useReportingQuery } from '@/hooks/useReporting'
import type { HookOptions } from './shared'

const D = 'operations'

export const useProcurementPipeline = (days: number | undefined, o?: HookOptions) =>
  useReportingQuery<ApiProcurementPipeline>(D, 'procurement-pipeline', { days }, { enabled: o?.enabled ?? true })

export const useStocktakeVariance = (academicYear: string | undefined, o?: HookOptions) =>
  useReportingQuery<ApiStocktakeVariance>(D, 'stocktake-variance', { academicYear }, { enabled: !!academicYear && (o?.enabled ?? true) })

type Params = Record<string, string | number | undefined>

export const useAssetRegisterReport = (params: Params, o?: HookOptions) =>
  useReportingQuery<ApiAssetRegisterReport>(D, 'assets', params, { enabled: o?.enabled ?? true })

export const useStocktakeReport = (params: Params, o?: HookOptions) =>
  useReportingQuery<ApiStocktakeReport>(D, 'stocktakes', params, { enabled: o?.enabled ?? true })

export const useProcurementValue = (params: Params, o?: HookOptions) =>
  useReportingQuery<ApiProcurementValueReport>(D, 'procurement-value', params, { enabled: o?.enabled ?? true })

export const useStockReport = (params: Params, o?: HookOptions) =>
  useReportingQuery<ApiStockReport>(D, 'inventory', params, { enabled: o?.enabled ?? true })
