import { describe, it, expect } from 'vitest'
import { buildCompletionRow, groupCompletion, classifyBlocker } from '../examLogic'

const exam = (over: Partial<Parameters<typeof buildCompletionRow>[0]['exam']> = {}) => ({
  id: 'e1', title: 'Maths T1', subject: 'Maths', type: 'END_TERM', classId: 'c1',
  className: 'Form 1A', form: 1, status: 'MARKS_DRAFT', date: new Date('2026-10-01'), ...over,
})

const row = (o: { expected: number; entered: number; absent: number; finalised?: number; last?: Date | null; teacher?: string | null; ex?: ReturnType<typeof exam> }) =>
  buildCompletionRow({
    exam: o.ex ?? exam(), teacherUid: o.teacher ? 't' : null, teacher: o.teacher ?? null,
    expected: o.expected, entered: o.entered, absent: o.absent, finalised: o.finalised ?? 0, lastFinalisedAt: o.last ?? null,
  })

describe('buildCompletionRow', () => {
  it('computes missing and completion from roster', () => {
    const r = row({ expected: 40, entered: 30, absent: 2 })
    expect(r.missing).toBe(8)
    expect(r.completionRate).toBe(80)
  })
  it('never reports negative missing when marks exceed the roster', () => {
    const r = row({ expected: 10, entered: 11, absent: 0 })
    expect(r.missing).toBe(0)
    expect(r.completionRate).toBe(100)
  })
  it('is N/A (null) for an empty roster', () => {
    expect(row({ expected: 0, entered: 0, absent: 0 }).completionRate).toBeNull()
  })
  it('turnaround only when fully finalised', () => {
    expect(row({ expected: 10, entered: 9, absent: 1, finalised: 10, last: new Date('2026-10-08') }).turnaroundDays).toBe(7)
    expect(row({ expected: 10, entered: 9, absent: 1, finalised: 4, last: new Date('2026-10-08') }).turnaroundDays).toBeNull()
  })
})

describe('groupCompletion', () => {
  it('groups, sums and orders least complete first', () => {
    const rows = [
      row({ expected: 10, entered: 10, absent: 0, ex: exam({ subject: 'Maths' }) }),
      row({ expected: 10, entered: 4, absent: 0, ex: exam({ id: 'e2', subject: 'English' }) }),
      row({ expected: 10, entered: 5, absent: 1, ex: exam({ id: 'e3', subject: 'English' }) }),
    ]
    const g = groupCompletion(rows, (r) => ({ key: r.subject, label: r.subject }))
    expect(g[0]?.label).toBe('English')
    expect(g[0]?.missing).toBe(10)
    expect(g[0]?.completionRate).toBe(50)
    expect(g[1]?.completionRate).toBe(100)
  })
})

describe('classifyBlocker', () => {
  const now = new Date('2026-10-10')
  it('flags passed exams still scheduled, but not upcoming ones', () => {
    expect(classifyBlocker(row({ expected: 1, entered: 0, absent: 0, ex: exam({ status: 'SCHEDULED', date: new Date('2026-10-01') }) }), now, null)?.owner).toBe('exam_officer')
    expect(classifyBlocker(row({ expected: 1, entered: 0, absent: 0, ex: exam({ status: 'SCHEDULED', date: new Date('2026-10-20') }) }), now, null)).toBeNull()
  })
  it('assigns owners by stage and ignores released exams', () => {
    const mk = (status: string) => row({ expected: 5, entered: 5, absent: 0, ex: exam({ status }) })
    expect(classifyBlocker(mk('MARKS_DRAFT'), now, null)?.owner).toBe('teacher')
    expect(classifyBlocker(mk('MARKS_FINAL'), now, null)?.owner).toBe('exam_officer')
    expect(classifyBlocker(mk('RESULTS_APPROVED'), now, null)?.owner).toBe('high_rank')
    expect(classifyBlocker(mk('RESULTS_RELEASED'), now, null)).toBeNull()
  })
})
