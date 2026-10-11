/**
 * Pure KPI construction helpers. No database access — services compute raw
 * numbers and pass them through these builders so every KPI in the system has
 * the same shape, the same rounding and the same "N/A, not 0" behaviour.
 */
import type {
  ReportKpi,
  ReportKpiComparison,
  ReportKpiUnit,
  ReportStatus,
} from '@shared/types/reporting'
import { THRESHOLDS, type ThresholdKey } from './thresholds'

/** Round to `dp` decimal places (default 1). */
export function round(value: number, dp = 1): number {
  const f = 10 ** dp
  return Math.round(value * f) / f
}

/**
 * Percentage of `part` in `whole`, rounded to one decimal.
 * Returns null — never 0 — when the denominator is 0, because "no data" and
 * "0%" are different statements.
 */
export function ratioPct(part: number, whole: number, dp = 1): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  return round((part / whole) * 100, dp)
}

/** Arithmetic mean, or null for an empty list. */
export function mean(values: readonly number[], dp = 1): number | null {
  const v = values.filter((n) => Number.isFinite(n))
  if (v.length === 0) return null
  return round(v.reduce((s, n) => s + n, 0) / v.length, dp)
}

/** Median, or null for an empty list. */
export function median(values: readonly number[], dp = 1): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (v.length === 0) return null
  const mid = Math.floor(v.length / 2)
  const m = v.length % 2 === 0 ? ((v[mid - 1] ?? 0) + (v[mid] ?? 0)) / 2 : (v[mid] ?? 0)
  return round(m, dp)
}

/** Population standard deviation, or null when fewer than 2 values. */
export function stdDev(values: readonly number[], dp = 1): number | null {
  const v = values.filter((n) => Number.isFinite(n))
  if (v.length < 2) return null
  const m = v.reduce((s, n) => s + n, 0) / v.length
  const variance = v.reduce((s, n) => s + (n - m) ** 2, 0) / v.length
  return round(Math.sqrt(variance), dp)
}

/** Status of `value` against a named threshold rule; neutral when null. */
export function statusFor(key: ThresholdKey, value: number | null): ReportStatus {
  if (value === null) return 'neutral'
  const rule = THRESHOLDS[key]
  if (rule.higherIsBetter) {
    if (value < rule.critical) return 'critical'
    if (value < rule.watch) return 'watch'
    return 'healthy'
  }
  if (value >= rule.critical) return 'critical'
  if (value >= rule.watch) return 'watch'
  return 'healthy'
}

/**
 * Comparison of `current` against `previous`. Returns undefined when either
 * side is unavailable — a comparison against nothing is not shown.
 * `delta` is the absolute change (percentage points for percent KPIs).
 */
export function compare(
  current: number | null,
  previous: number | null,
  label: string,
  polarity: ReportKpiComparison['polarity'] = 'up-good',
  dp = 1,
): ReportKpiComparison | undefined {
  if (current === null || previous === null) return undefined
  const delta = round(current - previous, dp)
  return {
    delta,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    label,
    polarity,
  }
}

export interface KpiInput {
  key: string
  label: string
  value: number | string | null
  unit: ReportKpiUnit
  description: string
  status?: ReportStatus
  subLabel?: string
  comparison?: ReportKpiComparison
  href?: string
}

/** Build a ReportKpi; status defaults to `neutral`. */
export function kpi(input: KpiInput): ReportKpi {
  return {
    key: input.key,
    label: input.label,
    value: input.value,
    unit: input.unit,
    status: input.status ?? 'neutral',
    description: input.description,
    ...(input.subLabel !== undefined ? { subLabel: input.subLabel } : {}),
    ...(input.comparison ? { comparison: input.comparison } : {}),
    ...(input.href ? { href: input.href } : {}),
  }
}

/** KPI whose status is derived from a named threshold. */
export function thresholdKpi(
  threshold: ThresholdKey,
  input: Omit<KpiInput, 'status'> & { value: number | null },
): ReportKpi {
  return kpi({ ...input, status: statusFor(threshold, input.value) })
}

/**
 * Whole days from `from` to `to` (UTC calendar days, `to - from`).
 * Positive when `to` is later.
 */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  return Math.round((b - a) / 86_400_000)
}

/** Start of the term-month window helper: previous term within the same year, or last term of previous year. */
export function previousPeriod(
  academicYear: string,
  term: number,
): { academicYear: string; term: number } {
  if (term > 1) return { academicYear, term: term - 1 }
  const start = Number.parseInt(academicYear.split('/')[0] ?? '', 10)
  if (Number.isNaN(start)) return { academicYear, term: 1 }
  return { academicYear: `${start - 1}/${start}`, term: 3 }
}
