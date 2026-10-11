/** Pure library-circulation maths (no database access, unit-tested). */
import { daysBetween, mean, ratioPct } from '@/server/services/reporting/kpi'

export const OVERDUE_BUCKETS = ['1–7 days', '8–14 days', '15–30 days', 'Over 30 days'] as const

export function overdueBucket(daysOverdue: number): (typeof OVERDUE_BUCKETS)[number] | null {
  if (daysOverdue < 1) return null
  if (daysOverdue <= 7) return '1–7 days'
  if (daysOverdue <= 14) return '8–14 days'
  if (daysOverdue <= 30) return '15–30 days'
  return 'Over 30 days'
}

export interface ReturnedLoan {
  issuedAt: Date
  dueDate: Date
  returnedAt: Date
}

export function onTimeRate(loans: readonly ReturnedLoan[]): number | null {
  return ratioPct(loans.filter((l) => l.returnedAt.getTime() <= l.dueDate.getTime() + 86_399_999).length, loans.length)
}

export function averageLoanDays(loans: readonly ReturnedLoan[]): number | null {
  return mean(loans.map((l) => daysBetween(l.issuedAt, l.returnedAt)).filter((d) => d >= 0))
}

/** Last `n` calendar months as { key: 'YYYY-MM', label } oldest first. */
export function lastMonths(n: number, asOf: Date): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - i, 1))
    out.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    })
  }
  return out
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
