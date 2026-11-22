/**
 * Pure HR analytics maths (no database access, unit-tested).
 */
import type { ContractWindowKey } from '@shared/types/reporting-hr'
import { daysBetween } from '@/server/services/reporting/kpi'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_LABELS = MONTHS

/**
 * Spread a leave request's recorded `days` across the calendar months it spans,
 * in proportion to the calendar days falling in each month. A request that
 * crosses a month (or year) boundary therefore counts in each month it uses,
 * instead of being dumped wholly into its start month. Only months of `year`
 * are returned. A request with no span (end < start) is booked to its start.
 */
export function distributeLeaveDays(start: Date, end: Date, days: number, year: number): number[] {
  const out = new Array<number>(12).fill(0)
  if (!(days > 0)) return out
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const e = Math.max(s, Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  const span = Math.round((e - s) / 86_400_000) + 1
  const perDay = days / span
  for (let t = s; t <= e; t += 86_400_000) {
    const d = new Date(t)
    if (d.getUTCFullYear() === year) {
      const m = d.getUTCMonth()
      out[m] = (out[m] ?? 0) + perDay
    }
  }
  return out.map((v) => Math.round(v * 10) / 10)
}

export function contractWindow(daysToExpiry: number): ContractWindowKey | null {
  if (daysToExpiry < 0) return 'expired'
  if (daysToExpiry <= 30) return 'd30'
  if (daysToExpiry <= 60) return 'd60'
  if (daysToExpiry <= 90) return 'd90'
  return null
}

export function daysToExpiry(contractExpiry: Date, asOf: Date): number {
  return daysBetween(asOf, contractExpiry)
}

const TENURE_BANDS = [
  { label: 'Under 1 year', max: 1 },
  { label: '1–3 years', max: 3 },
  { label: '3–5 years', max: 5 },
  { label: '5–10 years', max: 10 },
  { label: '10+ years', max: Infinity },
] as const

export function tenureBand(dateJoined: Date, asOf: Date): string {
  const years = (asOf.getTime() - dateJoined.getTime()) / (365.25 * 86_400_000)
  for (const b of TENURE_BANDS) if (years < b.max) return b.label
  return TENURE_BANDS[TENURE_BANDS.length - 1]?.label ?? ''
}

export const TENURE_LABELS = TENURE_BANDS.map((b) => b.label)

/** Count values into ordered labelled rows; unseen labels from `order` are kept with 0. */
export function countBy<T>(items: readonly T[], key: (item: T) => string, order?: readonly string[]) {
  const m = new Map<string, number>()
  order?.forEach((o) => m.set(o, 0))
  for (const it of items) {
    const k = key(it)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return Array.from(m.entries()).map(([label, count]) => ({ label, count }))
}

/** Score bands on a 1–5 scale (overallScore is stored as that scale). */
export function scoreBand(score: number): string {
  if (score >= 4.5) return 'Outstanding (4.5–5)'
  if (score >= 3.5) return 'Strong (3.5–4.4)'
  if (score >= 2.5) return 'Meets (2.5–3.4)'
  if (score >= 1.5) return 'Needs improvement (1.5–2.4)'
  return 'Unsatisfactory (<1.5)'
}

export const SCORE_BAND_ORDER = [
  'Outstanding (4.5–5)',
  'Strong (3.5–4.4)',
  'Meets (2.5–3.4)',
  'Needs improvement (1.5–2.4)',
  'Unsatisfactory (<1.5)',
] as const
