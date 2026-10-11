import type { ReportKpi, ReportKpiUnit, ReportStatus } from '@shared/types/reporting'

/** Build a client-side KPI for detail tabs (overview KPIs come from the API ready-made). */
export function kpiTile(
  key: string,
  label: string,
  value: number | string | null,
  unit: ReportKpiUnit,
  description: string,
  status: ReportStatus = 'neutral',
  subLabel?: string,
): ReportKpi {
  return { key, label, value, unit, status, description, ...(subLabel ? { subLabel } : {}) }
}
