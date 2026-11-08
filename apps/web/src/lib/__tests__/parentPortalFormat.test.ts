/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/lib/__tests__/parentPortalFormat.test.ts
 * [PURPOSE]: Pins the parent-facing display rules where a mistake would mislead a guardian:
 *   money, the attendance rate, and which sections are offered.
 */
import { describe, it, expect } from 'vitest'
import {
  attendanceByDate, attendanceLabel, availableSections, buildMonthGrid, childName, examTypeLabel, formatDay, formatMwk, gradeText,
  examOpens, humanize, invoiceStatusLabel, invoiceStatusTone, isEndTermExam, isFutureMonth, monthLabel, paymentMethodLabel, percentText,
  shiftMonth, termHeadline, termLabel, termVerdict,
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

describe('attendance calendar', () => {
  it('builds the same Sun-Sat grid the student page draws, with leading blanks and every day keyed yyyy-mm-dd', () => {
    const g = buildMonthGrid(2026, 2)                      // March 2026 starts on a Sunday
    expect(g.leadingBlanks).toBe(0)
    expect(g.days).toHaveLength(31)
    expect(g.days[0]).toEqual({ day: 1, key: '2026-03-01' })
    expect(g.days[30]).toEqual({ day: 31, key: '2026-03-31' })
    expect(buildMonthGrid(2026, 3).leadingBlanks).toBe(3)  // April 2026 starts on a Wednesday
  })
  it('knows month lengths, including February in leap and non-leap years', () => {
    expect(buildMonthGrid(2024, 1).days).toHaveLength(29)
    expect(buildMonthGrid(2026, 1).days).toHaveLength(28)
    expect(buildMonthGrid(2026, 11).days).toHaveLength(31)
  })
  it('labels months in words', () => {
    expect(monthLabel(2026, 2)).toBe('March 2026')
  })
  it('steps across year boundaries in both directions', () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, monthIndex: 11 })
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, monthIndex: 0 })
  })
  it('stops the next button at the first future month', () => {
    const now = new Date('2026-11-08T10:00:00Z')
    expect(isFutureMonth(2026, 10, now)).toBe(false)
    expect(isFutureMonth(2026, 11, now)).toBe(true)
    expect(isFutureMonth(2025, 11, now)).toBe(false)
  })
  it('indexes records by calendar day and ignores malformed ones', () => {
    const m = attendanceByDate([
      { date: '2026-03-02T00:00:00.000Z', status: 'ABSENT' }, { date: '2026-03-01T00:00:00.000Z', status: 'LATE' },
      { date: null, status: 'PRESENT' }, { date: 'junk', status: 'PRESENT' }, { date: '2026-03-03T00:00:00.000Z', status: null },
    ])
    expect([...m.entries()].sort()).toEqual([['2026-03-01', 'LATE'], ['2026-03-02', 'ABSENT']])
  })
})

describe('exam labels', () => {
  it('words every exam type and only end-of-term exams open as a report card', () => {
    expect(examTypeLabel('WEEKLY_TEST')).toBe('Weekly test')
    expect(examTypeLabel('END_TERM')).toBe('End of term')
    expect(examTypeLabel('SOMETHING_NEW')).toBe('Something New')
    expect(isEndTermExam('END_TERM')).toBe(true)
    for (const t of ['WEEKLY_TEST', 'ASSIGNMENT', 'QUIZ', 'MIDTERM', 'MANEB_JCE', 'MANEB_MSCE']) expect(isEndTermExam(t), t).toBe(false)
  })
})

describe('what tapping an exam opens', () => {
  it('an end-of-term exam opens the report card when the term has one', () => {
    expect(examOpens('END_TERM', true)).toBe('reportCard')
  })
  it('an end-of-term exam with no report card available falls back to its own detail', () => {
    expect(examOpens('END_TERM', false)).toBe('detail')
  })
  it('every other exam opens its own detail, even when the term has a report card', () => {
    for (const t of ['WEEKLY_TEST', 'ASSIGNMENT', 'QUIZ', 'MIDTERM', 'MANEB_JCE', 'MANEB_MSCE', 'ANYTHING']) {
      expect(examOpens(t, true), t).toBe('detail')
      expect(examOpens(t, false), t).toBe('detail')
    }
  })
})

describe('termHeadline / termVerdict (worded as the student view words them)', () => {
  it('MSCE shows Points, never a Grade; fewer than six graded subjects says so', () => {
    expect(termHeadline({ gradingTrack: 'MSCE', aggregatePoints: 14, grade: '' })).toEqual({ label: 'Points', value: '14', hint: 'Aggregate of the six best subjects' })
    expect(termHeadline({ gradingTrack: 'MSCE', aggregatePoints: null, grade: '7' })).toEqual({ label: 'Points', value: '—', hint: 'Needs six graded subjects' })
  })
  it('JCE (or unknown) shows the overall Grade, a dash when there is none', () => {
    expect(termHeadline({ gradingTrack: 'JCE', aggregatePoints: null, grade: 'B' }).value).toBe('B')
    expect(termHeadline({ gradingTrack: null, aggregatePoints: null, grade: '' })).toMatchObject({ label: 'Grade', value: '—' })
  })
  it('the verdict states what it rests on: subjects passed and points or grade', () => {
    const subjects = [{ pass: true }, { pass: true }, { pass: false }]
    expect(termVerdict({ term: 2, passStatus: true, gradingTrack: 'MSCE', aggregatePoints: 14, grade: '', subjects }))
      .toEqual({ passed: true, headline: 'Passed Term 2', detail: '2 of 3 subjects passed, aggregate 14 points' })
    expect(termVerdict({ term: 1, passStatus: false, gradingTrack: 'JCE', aggregatePoints: null, grade: 'D', subjects: [{ pass: false }] }))
      .toEqual({ passed: false, headline: 'Did not meet the pass requirement this term', detail: '0 of 1 subject passed, overall grade D' })
  })
  it('no verdict at all when the pass flag was not recorded', () => {
    expect(termVerdict({ term: 1, passStatus: null, gradingTrack: null, aggregatePoints: null, grade: null, subjects: [] })).toBeNull()
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
