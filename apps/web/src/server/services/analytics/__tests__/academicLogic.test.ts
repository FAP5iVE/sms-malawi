import { describe, it, expect } from 'vitest'
import { distribution, summarise, spreadKind, flagStudent, assignmentStats, scorePct } from '../academicLogic'

describe('academic logic', () => {
  it('converts marks to percentages and rejects bad maxima', () => {
    expect(scorePct(45, 90)).toBe(50)
    expect(scorePct(10, 0)).toBeNull()
  })

  it('distributes scores into ten bands, 100 in the last', () => {
    const d = distribution([0, 9.9, 10, 55, 100])
    expect(d[0]?.count).toBe(2)
    expect(d[1]?.count).toBe(1)
    expect(d[5]?.count).toBe(1)
    expect(d[9]?.count).toBe(1)
  })

  it('summarises with N/A on empty input', () => {
    const s = summarise([40, 50, 60], 50)
    expect(s.average).toBe(50)
    expect(s.median).toBe(50)
    expect(s.passRate).toBe(66.7)
    expect(summarise([], 50)).toMatchObject({ assessed: 0, average: null, passRate: null, min: null })
  })

  it('separates class-wide weakness from uneven spread', () => {
    expect(spreadKind(40, 8, 50)).toBe('class-wide')
    expect(spreadKind(60, 25, 50)).toBe('wide-spread')
    expect(spreadKind(60, 10, 50)).toBeNull()
    expect(spreadKind(null, null, 50)).toBeNull()
  })

  it('flags students on average, subjects, absence and decline', () => {
    const r = flagStudent({
      average: 40,
      subjectAverages: [{ subject: 'Maths', average: 30 }, { subject: 'English', average: 45 }, { subject: 'Biology', average: 70 }],
      passMark: 50, absentDays: 3, recordedDays: 10, previousAverage: 55,
    })
    expect(r.flags).toEqual(['LOW_AVERAGE', 'SUBJECT_FAILS', 'ABSENCE', 'DECLINING'])
    expect(r.failingSubjects).toEqual(['English', 'Maths'])
    expect(r.change).toBe(-15)
    const ok = flagStudent({ average: 70, subjectAverages: [], passMark: 50, absentDays: 1, recordedDays: 3, previousAverage: null })
    expect(ok.flags).toEqual([])
    expect(ok.change).toBeNull()
  })

  it('marks an assignment overdue only after the due date with outstanding work', () => {
    const now = new Date('2026-10-10T00:00:00Z')
    expect(assignmentStats({ expected: 10, submitted: 8, late: 1, dueDate: new Date('2026-10-01') }, now)).toEqual({ completionRate: 80, overdue: true })
    expect(assignmentStats({ expected: 10, submitted: 10, late: 0, dueDate: new Date('2026-10-01') }, now).overdue).toBe(false)
    expect(assignmentStats({ expected: 0, submitted: 0, late: 0, dueDate: new Date('2026-10-20') }, now)).toEqual({ completionRate: null, overdue: false })
  })
})
