import { describe, it, expect } from 'vitest'
import { overdueBucket, onTimeRate, averageLoanDays, lastMonths, monthKey } from '../libraryLogic'

describe('library logic', () => {
  it('buckets overdue days', () => {
    expect(overdueBucket(0)).toBeNull()
    expect(overdueBucket(1)).toBe('1–7 days')
    expect(overdueBucket(8)).toBe('8–14 days')
    expect(overdueBucket(30)).toBe('15–30 days')
    expect(overdueBucket(31)).toBe('Over 30 days')
  })

  it('on-time rate allows return on the due day and is null with no returns', () => {
    const l = (i: string, d: string, r: string) => ({ issuedAt: new Date(i), dueDate: new Date(d), returnedAt: new Date(r) })
    const loans = [l('2026-09-01', '2026-09-15', '2026-09-15T16:00:00Z'), l('2026-09-01', '2026-09-15', '2026-09-20')]
    expect(onTimeRate(loans)).toBe(50)
    expect(onTimeRate([])).toBeNull()
    expect(averageLoanDays(loans)).toBe(16.5)
    expect(averageLoanDays([])).toBeNull()
  })

  it('lists months oldest first', () => {
    const m = lastMonths(3, new Date('2026-02-10T00:00:00Z'))
    expect(m.map((x) => x.key)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(monthKey(new Date('2026-02-28T23:00:00Z'))).toBe('2026-02')
  })
})
