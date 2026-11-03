/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/utils/retirement.ts
 * [PURPOSE]: Retirement date from date of birth + the school's retirement age
 *   (SETTING_KEYS.HR_RETIREMENT_AGE, default 60). Pure and shared so the
 *   server (hrService) and the staff profile card compute it identically.
 *
 *   The date is COMPUTED, never stored: a stored date per person would go stale
 *   the moment the policy age changes. The retirement date used here is the
 *   birthday at retirement age. If the school retires staff at the end of that
 *   month, that is a one-line change in computeRetirementDate().
 *
 *   All arithmetic is UTC and date-only, so a date of birth saved as
 *   "1970-03-14" gives the same retirement date regardless of the viewer's
 *   timezone (Malawi is UTC+2).
 * [DEPENDS ON]: none
 */

export type RetirementStatus = 'RETIRED' | 'DUE_WITHIN_YEAR' | 'OK'

export interface RetirementInfo {
  retirementAge: number
  /** YYYY-MM-DD */
  retirementDate: string
  /** Whole months until retirement; 0 once the date has passed. */
  monthsRemaining: number
  status: RetirementStatus
}

/** Months-ahead window that counts as "retiring soon". */
export const RETIRING_SOON_MONTHS = 12

function toUtcDateOnly(value: Date | string): Date {
  if (typeof value === 'string') {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number)
    return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1))
  }
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

/** Calendar-month arithmetic in UTC; the day clamps to the end of a shorter month. */
function addMonthsUtc(date: Date, months: number): Date {
  const total = date.getUTCMonth() + months
  const year = date.getUTCFullYear() + Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDayOfMonth)))
}

/** Birthday at `retirementAge`. A 29 February birthday falls on 28 February in a non-leap year. */
export function computeRetirementDate(dateOfBirth: Date | string, retirementAge: number): Date {
  const dob = toUtcDateOnly(dateOfBirth)
  const year = dob.getUTCFullYear() + retirementAge
  const month = dob.getUTCMonth()
  const day = dob.getUTCDate()
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year, month, Math.min(day, lastDayOfMonth)))
}

export function getRetirementInfo(
  dateOfBirth: Date | string,
  retirementAge: number,
  now: Date = new Date(),
): RetirementInfo {
  const retirement = computeRetirementDate(dateOfBirth, retirementAge)
  const today = toUtcDateOnly(now)

  let monthsRemaining = 0
  if (retirement.getTime() > today.getTime()) {
    monthsRemaining =
      (retirement.getUTCFullYear() - today.getUTCFullYear()) * 12 +
      (retirement.getUTCMonth() - today.getUTCMonth())
    // Not yet reached the day-of-month within the final month: one month fewer.
    if (retirement.getUTCDate() < today.getUTCDate()) monthsRemaining -= 1
    monthsRemaining = Math.max(monthsRemaining, 0)
  }

  // "Within a year" is a calendar test (retirement on or before the same date
  // next year), not a whole-months count: 12 months and 1 day away is NOT soon.
  const soonCutoff = addMonthsUtc(today, RETIRING_SOON_MONTHS)
  const status: RetirementStatus =
    retirement.getTime() <= today.getTime()
      ? 'RETIRED'
      : retirement.getTime() <= soonCutoff.getTime()
        ? 'DUE_WITHIN_YEAR'
        : 'OK'

  return {
    retirementAge,
    retirementDate: retirement.toISOString().slice(0, 10),
    monthsRemaining,
    status,
  }
}
