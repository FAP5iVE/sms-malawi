import { describe, it, expect } from 'vitest'
import {
  detectBursts, repeatedFailures, abnormalVolume, durationBand, domainOf, categoriesOf, lastDays, mondayOf,
} from '../adminLogic'

describe('admin logic', () => {
  it('lists UTC days oldest first and finds the Monday', () => {
    expect(lastDays(3, new Date('2026-10-11T10:00:00Z'))).toEqual(['2026-10-09', '2026-10-10', '2026-10-11'])
    expect(mondayOf(new Date('2026-10-11T10:00:00Z'))).toBe('2026-10-05')
  })

  it('flags only genuinely high failure days', () => {
    const days = [2, 1, 3, 2, 40, 2].map((failed, i) => ({ date: `d${i}`, failed }))
    expect(detectBursts(days)).toEqual([{ date: 'd4', failed: 40 }])
    expect(detectBursts([{ date: 'a', failed: 9 }])).toEqual([])
  })

  it('finds repeated failures per identifier', () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 10, 8, m))
    const events = [...Array(5)].map((_, i) => ({ identifier: 'a@x.mw', at: at(i) })).concat([{ identifier: 'b@x.mw', at: at(0) }])
    const out = repeatedFailures(events)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ identifier: 'a@x.mw', failures: 5 })
    expect(out[0]?.lastAt).toEqual(at(4))
  })

  it('detects abnormal audit volume only with a baseline and enough activity', () => {
    expect(abnormalVolume(200, [50, 60, 55])).toBe(true)
    expect(abnormalVolume(40, [5, 5, 5])).toBe(false)
    expect(abnormalVolume(500, [])).toBe(false)
  })

  it('bands durations', () => {
    expect(durationBand(2)).toBe('Under 5 min')
    expect(durationBand(60)).toBe('30 min–2 h')
    expect(durationBand(900)).toBe('Over 8 h')
  })

  it('derives domain and categories from audit actions', () => {
    expect(domainOf('LOGIN_FAILED')).toBe('auth')
    expect(domainOf('STUDENT_ARCHIVED')).toBe('student')
    expect(domainOf('procurement.purchaseOrder.approve')).toBe('procurement')
    expect(categoriesOf('procurement.purchaseOrder.approve')).toEqual(['approvals', 'finance'])
    expect(categoriesOf('exam.results_released')).toEqual(['releases'])
    expect(categoriesOf('student.softDelete')).toEqual(['destructive'])
    expect(categoriesOf('hr.allowance.delete')).toEqual(['destructive', 'hr'])
    expect(categoriesOf('auth.session_revoked')).toEqual(['destructive', 'access'])
    expect(categoriesOf('LOGIN_SUCCESS')).toEqual([])
  })
})
