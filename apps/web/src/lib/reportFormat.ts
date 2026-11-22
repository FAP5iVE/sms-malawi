/**
 * Display formatters shared by every report and dashboard so a figure reads
 * the same everywhere. "N/A" is shown for null/undefined — never 0 — because a
 * metric that cannot be computed is not a metric that is zero.
 */
import type { ReportKpiUnit } from '@shared/types/reporting'

export const NA = 'N/A'

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? NA
    : Math.round(value).toLocaleString('en-US')
}

export function formatPercent(value: number | null | undefined, dp = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  const rounded = Number(value.toFixed(dp))
  return `${rounded.toLocaleString('en-US')}%`
}

export function formatMwk(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  return `MWK ${Math.round(value).toLocaleString('en-US')}`
}

/** Compact currency for tight KPI tiles: MWK 18.4M / 1.2K. Full value belongs in a tooltip. */
export function formatMwkCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}MWK ${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${sign}MWK ${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${sign}MWK ${(abs / 1_000).toFixed(1)}K`
  return `${sign}MWK ${Math.round(abs).toLocaleString('en-US')}`
}

export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  const rounded = Number(value.toFixed(1))
  return `${rounded.toLocaleString('en-US')} ${rounded === 1 ? 'day' : 'days'}`
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return NA
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return NA
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return NA
  return String(Number(value.toFixed(1)))
}

/** Format a KPI value according to its unit. `compact` shortens MWK amounts. */
export function formatKpiValue(
  value: number | string | null | undefined,
  unit: ReportKpiUnit,
  compact = false,
): string {
  if (value === null || value === undefined) return NA
  if (typeof value === 'string') return value
  switch (unit) {
    case 'percent':
      return formatPercent(value)
    case 'mwk':
      return compact ? formatMwkCompact(value) : formatMwk(value)
    case 'days':
      return formatDays(value)
    case 'score':
      return formatScore(value)
    case 'ratio':
      return Number(value.toFixed(2)).toString()
    case 'text':
      return String(value)
    default:
      return formatCount(value)
  }
}

/** "2025/2026" + term → "Term 2, 2025/2026"; term omitted → year only. */
export function periodLabel(academicYear: string | undefined, term?: number | null): string {
  if (!academicYear) return ''
  return term ? `Term ${term}, ${academicYear}` : academicYear
}
