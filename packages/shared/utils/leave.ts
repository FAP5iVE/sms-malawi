/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/utils/leave.ts
 * [PURPOSE]: The leave arithmetic, in one pure place so the server (hrService,
 *   payrollService) and the Request leave form count days and pay the same way.
 *
 *   - A leave day is a working day: Monday to Friday, minus Malawi public
 *     holidays. (The Employment Act adds a day to annual leave for every public
 *     holiday inside it; not counting the holiday does the same thing.)
 *   - A request's days are paid in order: first the full-pay days, then the
 *     half-pay days, then the unpaid days. Payroll docks pay month by month
 *     from that order, so leave that crosses a month end is split correctly.
 *   - Everything is UTC and date-only ("YYYY-MM-DD"), so a date saved as
 *     "2026-11-02" is the same day on the server and in a Malawi browser.
 * [DEPENDS ON]: constants/malawi/holidays.ts
 */

import { getPublicHolidaysForYear } from '../constants/malawi/holidays'

const DAY_MS = 24 * 60 * 60 * 1000

/** "YYYY-MM-DD" (or a Date) -> UTC midnight of that day. */
export function toUtcDay(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  }
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
}

/** UTC Date -> "YYYY-MM-DD". */
export function toDayString(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function isWeekendDay(d: Date): boolean {
  const dow = d.getUTCDay()
  return dow === 0 || dow === 6
}

const holidayCache = new Map<number, Set<string>>()

export function isPublicHoliday(day: string): boolean {
  const year = Number(day.slice(0, 4))
  let set = holidayCache.get(year)
  if (!set) {
    set = new Set(getPublicHolidaysForYear(year).map((h) => h.date))
    holidayCache.set(year, set)
  }
  return set.has(day)
}

/** Monday to Friday and not a public holiday. */
export function isWorkingDay(d: Date): boolean {
  return !isWeekendDay(d) && !isPublicHoliday(toDayString(d))
}

/** Every leave day from start to end inclusive, as "YYYY-MM-DD", in order. */
export function leaveWorkingDays(start: string | Date, end: string | Date): string[] {
  const from = toUtcDay(start)
  const to = toUtcDay(end)
  const out: string[] = []
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const d = new Date(t)
    if (isWorkingDay(d)) out.push(toDayString(d))
  }
  return out
}

export function countLeaveDays(start: string | Date, end: string | Date): number {
  return leaveWorkingDays(start, end).length
}

/** The first working day after `date` (the day the person is back). */
export function nextWorkingDay(date: string | Date): string {
  let t = toUtcDay(date).getTime() + DAY_MS
  for (let i = 0; i < 20; i++, t += DAY_MS) {
    const d = new Date(t)
    if (isWorkingDay(d)) return toDayString(d)
  }
  return toDayString(new Date(t))
}

/** Monday-to-Friday days in a calendar month. This is the divisor for a daily rate. */
export function weekdaysInMonth(month: number, year: number): number {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  let n = 0
  for (let day = 1; day <= last; day++) {
    if (!isWeekendDay(new Date(Date.UTC(year, month - 1, day)))) n++
  }
  return n
}

export interface LeavePaySplit {
  fullPayDays: number
  halfPayDays: number
  unpaidDays: number
}

/**
 * Splits `days` between full pay, half pay and unpaid.
 * `payPercent` is the type's pay (0 to 100). `fullTierLeft` and `halfTierLeft`
 * are only used by sick leave: the full-pay days still available this year,
 * then the half-pay days still available. Other types ignore them.
 */
export function splitLeavePay(
  days: number,
  payPercent: number,
  tiers?: { fullTierLeft: number; halfTierLeft: number },
): LeavePaySplit {
  if (days <= 0) return { fullPayDays: 0, halfPayDays: 0, unpaidDays: 0 }
  if (tiers) {
    const full = Math.min(days, Math.max(0, tiers.fullTierLeft))
    const half = Math.min(days - full, Math.max(0, tiers.halfTierLeft))
    // The full tier follows the type's own pay setting: if HR made sick leave
    // unpaid or half paid, the "full" days are paid at that rate instead.
    return applyPercent(full, payPercent, half, days - full - half)
  }
  return applyPercent(days, payPercent, 0, 0)
}

/** Maps tier day counts onto full / half / unpaid for a given pay percent. */
function applyPercent(tierDays: number, percent: number, halfTierDays: number, beyond: number): LeavePaySplit {
  let fullPayDays = 0
  let halfPayDays = halfTierDays
  let unpaidDays = beyond
  if (percent >= 100) fullPayDays += tierDays
  else if (percent <= 0) unpaidDays += tierDays
  else halfPayDays += tierDays
  return { fullPayDays, halfPayDays, unpaidDays }
}

/** Pay factor for the nth leave day of a request: 1 full, 0.5 half, 0 unpaid. */
export function dayPayFactor(index: number, split: LeavePaySplit): number {
  const { fullPayDays, halfPayDays, unpaidDays } = split
  if (fullPayDays + halfPayDays + unpaidDays === 0) return 1 // legacy row: fully paid
  if (index < fullPayDays) return 1
  if (index < fullPayDays + halfPayDays) return 0.5
  if (index < fullPayDays + halfPayDays + unpaidDays) return 0
  return 1
}

export interface LeaveForPayroll extends LeavePaySplit {
  startDate: string | Date
  endDate: string | Date
}

export interface MonthLeaveReduction {
  /** Full days of pay lost in the month (a half-pay day counts 0.5). */
  reductionDays: number
  halfPayDays: number
  unpaidDays: number
}

/** Pay lost to approved leave in one calendar month, in days of pay. */
export function monthLeaveReduction(requests: readonly LeaveForPayroll[], month: number, year: number): MonthLeaveReduction {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`
  let reductionDays = 0
  let halfPayDays = 0
  let unpaidDays = 0
  for (const r of requests) {
    leaveWorkingDays(r.startDate, r.endDate).forEach((day, i) => {
      if (!day.startsWith(prefix)) return
      const f = dayPayFactor(i, r)
      if (f === 0.5) halfPayDays++
      if (f === 0) unpaidDays++
      reductionDays += 1 - f
    })
  }
  return { reductionDays, halfPayDays, unpaidDays }
}

/** Pay docked for the month: daily rate (gross over weekdays) times the days of pay lost. Never more than gross. */
export function leaveDeductionAmount(gross: number, reductionDays: number, month: number, year: number): number {
  if (reductionDays <= 0 || gross <= 0) return 0
  const rate = gross / weekdaysInMonth(month, year)
  return Math.min(gross, Math.round(rate * reductionDays * 100) / 100)
}

/** Pro-rated entitlement for a staff member who joined part way through `year` (Employment Act s.44(2)). */
export function proRatedEntitlement(fullYearDays: number, dateJoined: string | Date, year: number): number {
  const joined = toUtcDay(dateJoined)
  if (joined.getUTCFullYear() < year) return fullYearDays
  if (joined.getUTCFullYear() > year) return 0
  const monthsLeft = 12 - joined.getUTCMonth()
  return Math.round((fullYearDays * monthsLeft) / 12)
}

/** Today's date in Malawi (Africa/Blantyre, UTC+2, no daylight saving) as UTC midnight. */
export function todayInMalawi(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
}
