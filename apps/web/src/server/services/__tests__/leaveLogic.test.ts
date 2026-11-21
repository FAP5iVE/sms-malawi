/**
 * Leave arithmetic: working-day counting, the full / half / unpaid split, and
 * how payroll docks pay month by month. All pure (shared/utils/leave.ts).
 */
import { describe, it, expect } from 'vitest'
import {
  countLeaveDays, leaveWorkingDays, nextWorkingDay, weekdaysInMonth,
  splitLeavePay, dayPayFactor, monthLeaveReduction, leaveDeductionAmount,
  proRatedEntitlement, todayInMalawi,
} from '@shared/utils/leave'

describe('counting leave days', () => {
  it('counts Monday to Friday and skips the weekend', () => {
    // Mon 2 Nov 2026 -> Fri 13 Nov 2026
    expect(countLeaveDays('2026-11-02', '2026-11-13')).toBe(10)
  })

  it('does not count a public holiday', () => {
    // Mon 1 Jan 2029 is New Year's Day: Mon-Fri that week is 4 working days.
    expect(countLeaveDays('2029-01-01', '2029-01-05')).toBe(4)
  })

  it('returns nothing for a weekend-only range', () => {
    expect(leaveWorkingDays('2026-11-07', '2026-11-08')).toEqual([])
  })

  it('finds the first working day back after a Friday', () => {
    expect(nextWorkingDay('2026-11-13')).toBe('2026-11-16')
  })

  it('counts the weekdays of a month for the daily rate', () => {
    expect(weekdaysInMonth(11, 2026)).toBe(21)
  })
})

describe('splitting pay', () => {
  it('full pay type: every day is paid', () => {
    expect(splitLeavePay(10, 100)).toEqual({ fullPayDays: 10, halfPayDays: 0, unpaidDays: 0 })
  })
  it('unpaid type: every day is unpaid', () => {
    expect(splitLeavePay(10, 0)).toEqual({ fullPayDays: 0, halfPayDays: 0, unpaidDays: 10 })
  })
  it('half pay type: every day is half paid', () => {
    expect(splitLeavePay(10, 50)).toEqual({ fullPayDays: 0, halfPayDays: 10, unpaidDays: 0 })
  })
  it('sick leave uses the full-pay days first, then the half-pay days', () => {
    // 15 days asked, 5 full-pay days left this year, plenty of half-pay days.
    expect(splitLeavePay(15, 100, { fullTierLeft: 5, halfTierLeft: 40 }))
      .toEqual({ fullPayDays: 5, halfPayDays: 10, unpaidDays: 0 })
  })
  it('sick leave with no full-pay days left is all half pay', () => {
    expect(splitLeavePay(4, 100, { fullTierLeft: 0, halfTierLeft: 10 }))
      .toEqual({ fullPayDays: 0, halfPayDays: 4, unpaidDays: 0 })
  })
  it('days beyond both sick tiers are unpaid', () => {
    expect(splitLeavePay(10, 100, { fullTierLeft: 2, halfTierLeft: 3 }))
      .toEqual({ fullPayDays: 2, halfPayDays: 3, unpaidDays: 5 })
  })
})

describe('day pay factor', () => {
  it('treats a request with no split as fully paid (rows from before the change)', () => {
    expect(dayPayFactor(0, { fullPayDays: 0, halfPayDays: 0, unpaidDays: 0 })).toBe(1)
  })
  it('pays in order: full, then half, then unpaid', () => {
    const s = { fullPayDays: 2, halfPayDays: 1, unpaidDays: 1 }
    expect([0, 1, 2, 3].map((i) => dayPayFactor(i, s))).toEqual([1, 1, 0.5, 0])
  })
})

describe('payroll docking', () => {
  // Unpaid leave Thu 29 Oct 2026 - Tue 3 Nov 2026 = Thu, Fri, Mon, Tue: 4 working days.
  const unpaid = { startDate: '2026-10-29', endDate: '2026-11-03', fullPayDays: 0, halfPayDays: 0, unpaidDays: 4 }

  it('splits leave that crosses a month end between the two months', () => {
    expect(monthLeaveReduction([unpaid], 10, 2026).reductionDays).toBe(2)
    expect(monthLeaveReduction([unpaid], 11, 2026).reductionDays).toBe(2)
  })

  it('docks nothing for paid leave', () => {
    const paid = { startDate: '2026-11-02', endDate: '2026-11-06', fullPayDays: 5, halfPayDays: 0, unpaidDays: 0 }
    expect(monthLeaveReduction([paid], 11, 2026).reductionDays).toBe(0)
  })

  it('docks half a day for each half-pay day', () => {
    const half = { startDate: '2026-11-02', endDate: '2026-11-06', fullPayDays: 0, halfPayDays: 5, unpaidDays: 0 }
    const r = monthLeaveReduction([half], 11, 2026)
    expect(r.reductionDays).toBe(2.5)
    expect(r.halfPayDays).toBe(5)
  })

  it('works out the deduction from the daily rate (gross over the month\'s weekdays)', () => {
    // 21 weekdays in Nov 2026, gross 210,000 -> 10,000 a day; 2 days -> 20,000.
    expect(leaveDeductionAmount(210_000, 2, 11, 2026)).toBe(20_000)
  })

  it('never docks more than the gross pay', () => {
    expect(leaveDeductionAmount(100_000, 99, 11, 2026)).toBe(100_000)
  })

  it('docks nothing when there are no days to dock', () => {
    expect(leaveDeductionAmount(210_000, 0, 11, 2026)).toBe(0)
  })
})

describe('annual leave in the year someone joins', () => {
  it('gives the full allowance to someone who joined in an earlier year', () => {
    expect(proRatedEntitlement(15, '2024-03-10', 2026)).toBe(15)
  })
  it('pro-rates by the months left, counting the month they joined', () => {
    // Joined 1 July: July to December = 6 of 12 months.
    expect(proRatedEntitlement(15, '2026-07-01', 2026)).toBe(8)
  })
})

describe('Malawi today', () => {
  it('is already the next day at 23:30 UTC (Malawi is UTC+2)', () => {
    const d = todayInMalawi(new Date('2026-11-20T23:30:00Z'))
    expect(d.toISOString().slice(0, 10)).toBe('2026-11-21')
  })
})
