import { describe, it, expect } from 'vitest'
import { attendanceRate, weekStart, aggregateWeeks, aggregateWeekdays, findChronic } from '../attendanceLogic'

describe('attendance logic', () => {
  it('counts late as attended and is null with no records', () => {
    expect(attendanceRate(8, 1, 1)).toBe(90)
    expect(attendanceRate(0, 0, 0)).toBeNull()
  })

  it('finds the Monday of a week, including Sundays', () => {
    expect(weekStart(new Date('2026-10-07T10:00:00Z'))).toBe('2026-10-05') // Wed
    expect(weekStart(new Date('2026-10-11T10:00:00Z'))).toBe('2026-10-05') // Sun
    expect(weekStart(new Date('2026-10-05T00:00:00Z'))).toBe('2026-10-05') // Mon
  })

  it('aggregates weeks and weekdays', () => {
    const daily = [
      { date: new Date('2026-10-05T00:00:00Z'), status: 'PRESENT', count: 9 },
      { date: new Date('2026-10-05T00:00:00Z'), status: 'ABSENT', count: 1 },
      { date: new Date('2026-10-12T00:00:00Z'), status: 'PRESENT', count: 5 },
      { date: new Date('2026-10-12T00:00:00Z'), status: 'ABSENT', count: 5 },
    ]
    const w = aggregateWeeks(daily)
    expect(w.map((x) => x.rate)).toEqual([90, 50])
    const d = aggregateWeekdays(daily)
    expect(d).toHaveLength(1)
    expect(d[0]?.label).toBe('Mon')
    expect(d[0]?.recorded).toBe(20)
  })

  it('flags chronic absentees only with enough recorded days', () => {
    const rows = [
      { studentId: 'a', status: 'ABSENT', count: 6 }, { studentId: 'a', status: 'PRESENT', count: 14 },
      { studentId: 'b', status: 'ABSENT', count: 2 }, { studentId: 'b', status: 'PRESENT', count: 1 },
      { studentId: 'c', status: 'ABSENT', count: 1 }, { studentId: 'c', status: 'PRESENT', count: 29 },
    ]
    const r = findChronic(rows)
    expect(r).toHaveLength(1)
    expect(r[0]?.studentId).toBe('a')
    expect(r[0]?.absenceRate).toBe(30)
  })
})
