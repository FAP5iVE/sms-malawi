/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/lib/__tests__/parentPortalFormat.test.ts
 * [PURPOSE]: Pins the parent-facing display rules where a mistake would mislead a guardian:
 *   money, the attendance rate, and which sections are offered.
 */
import { describe, it, expect } from 'vitest'
import {
  attendanceFigures, attendanceLabel, availableSections, childName, formatDay, formatMwk, gradeText,
  humanize, invoiceStatusLabel, invoiceStatusTone, paymentMethodLabel, percentText, termLabel,
} from '../parentPortalFormat'

describe('formatMwk', () => {
  it('groups thousands and drops zero decimals', () => {
    expect(formatMwk(0)).toBe('MK 0')
    expect(formatMwk(950)).toBe('MK 950')
    expect(formatMwk(150000)).toBe('MK 150,000')
    expect(formatMwk(1234567)).toBe('MK 1,234,567')
  })
  it('keeps two decimals only when there is a fraction', () => {
    expect(formatMwk(1250.5)).toBe('MK 1,250.50')
    expect(formatMwk(0.1 + 0.2)).toBe('MK 0.30')
  })
  it('shows a credit as negative and an unknown amount as a dash, never NaN', () => {
    expect(formatMwk(-500)).toBe('-MK 500')
    for (const bad of [null, undefined, NaN, Infinity]) expect(formatMwk(bad as number | null), String(bad)).toBe('—')
  })
})

describe('termLabel / formatDay', () => {
  it('reads naturally with whatever is known', () => {
    expect(termLabel('2026', 2)).toBe('Term 2, 2026')
    expect(termLabel(null, 3)).toBe('Term 3')
    expect(termLabel('2026', null)).toBe('2026')
    expect(termLabel(null, null)).toBe('Term')
  })
  it('formats a UTC calendar day without shifting it, and is empty for junk', () => {
    expect(formatDay('2026-03-01T00:00:00.000Z')).toBe('01 Mar 2026')
    expect(formatDay('2026-12-31T23:59:59.000Z')).toBe('31 Dec 2026')
    for (const bad of [null, undefined, '', 'nope']) expect(formatDay(bad), String(bad)).toBe('')
  })
})

describe('status wording', () => {
  it('has words for every status the database can hold, and a readable fallback', () => {
    expect(invoiceStatusLabel('PARTIAL')).toBe('Part paid')
    expect(attendanceLabel('LATE')).toBe('Late')
    expect(paymentMethodLabel('TNM_MPAMBA')).toBe('TNM Mpamba')
    expect(paymentMethodLabel('SOME_NEW_WAY')).toBe('Some New Way')
    expect(humanize('AIRTEL_MONEY')).toBe('Airtel Money')
    expect(invoiceStatusLabel(null)).toBe('')
  })
  it('colours an overdue invoice as danger and a paid one as success', () => {
    expect(invoiceStatusTone('OVERDUE')).toBe('danger')
    expect(invoiceStatusTone('PAID')).toBe('success')
    expect(invoiceStatusTone('UNPAID')).toBe('warning')
    expect(invoiceStatusTone('???')).toBe('neutral')
  })
})

describe('attendanceFigures', () => {
  it('counts late as attended and rounds the rate', () => {
    expect(attendanceFigures({ windowSize: 10, byStatus: { PRESENT: 7, LATE: 1, ABSENT: 2 } }))
      .toEqual({ present: 7, late: 1, absent: 2, other: 0, total: 10, attendedPercent: 80 })
    expect(attendanceFigures({ windowSize: 3, byStatus: { PRESENT: 2, ABSENT: 1 } }).attendedPercent).toBe(67)
  })
  it('puts unrecognised statuses in "other" rather than inventing attendance', () => {
    const f = attendanceFigures({ windowSize: 5, byStatus: { PRESENT: 2, UNKNOWN: 3 } })
    expect(f.other).toBe(3)
    expect(f.attendedPercent).toBe(40)
  })
  it('has no rate (not 0%) when nothing is recorded', () => {
    expect(attendanceFigures({ windowSize: 0, byStatus: {} }).attendedPercent).toBeNull()
  })
  it('never goes negative or non-integer on odd input', () => {
    const f = attendanceFigures({ windowSize: 4, byStatus: { PRESENT: 9, ABSENT: -2, LATE: 1.9 } })
    expect(f.other).toBe(0)
    expect(f.absent).toBe(0)
    expect(f.late).toBe(1)
  })
})

describe('results text', () => {
  it('treats an empty grade (Forms 3–4) as no grade', () => {
    expect(gradeText('')).toBeNull()
    expect(gradeText('  ')).toBeNull()
    expect(gradeText(null)).toBeNull()
    expect(gradeText('B')).toBe('B')
  })
  it('percent text is a dash when unknown', () => {
    expect(percentText(71.3)).toBe('71.3%')
    expect(percentText(null)).toBe('—')
  })
})

describe('childName / availableSections', () => {
  it('falls back instead of printing "null null"', () => {
    expect(childName({ firstName: 'Chikondi', lastName: 'Phiri' })).toBe('Chikondi Phiri')
    expect(childName({ firstName: null, lastName: 'Phiri' })).toBe('Phiri')
    expect(childName({ firstName: null, lastName: null })).toBe('Student')
  })
  it('offers only granted sections, in a fixed order, and none for a student who left', () => {
    expect(availableSections(['attendance', 'results', 'profile'], true)).toEqual(['results', 'attendance'])
    expect(availableSections(['profile', 'notices'], true)).toEqual([])
    expect(availableSections(['results', 'fees', 'attendance'], false)).toEqual([])
  })
})
