import { describe, it, expect } from 'vitest'
import {
  buildCompletionRow, groupCompletion, classifyBlocker,
  sortBest, spreadOf, buildStudentStanding, buildTopPerformersBody, type CohortMember,
} from '../examLogic'

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

describe('sortBest', () => {
  const r = (name: string, value: number, points: number | null = null) => ({ name, value, points })
  it('ranks JCE by percentage, highest first, ties by name', () => {
    const out = sortBest([r('Bea', 70), r('Ann', 70), r('Cy', 90)], false)
    expect(out.map((x) => x.name)).toEqual(['Cy', 'Ann', 'Bea'])
  })
  it('ranks MSCE by aggregate with the LOWER total first', () => {
    const out = sortBest([r('A', 90, 20), r('B', 60, 8), r('C', 70, 12)], true)
    expect(out.map((x) => x.name)).toEqual(['B', 'C', 'A'])
  })
  it('puts students with no aggregate last, never first', () => {
    const out = sortBest([r('NoAgg', 99, null), r('Has', 40, 30)], true)
    expect(out.map((x) => x.name)).toEqual(['Has', 'NoAgg'])
  })
})

describe('spreadOf', () => {
  it('returns best/worst/mean for higher-is-better', () => {
    expect(spreadOf([40, 60, 80])).toEqual({ best: 80, worst: 40, average: 60, count: 3 })
  })
  it('inverts best/worst for MSCE points', () => {
    expect(spreadOf([10, 20, 30], false, 1)).toEqual({ best: 10, worst: 30, average: 20, count: 3 })
  })
  it('is null for no values', () => {
    expect(spreadOf([])).toBeNull()
  })
})

describe('buildStudentStanding', () => {
  const m = (studentId: string, average: number, maths: number, points: number | null = null): CohortMember =>
    ({ studentId, name: studentId, average, points, subjects: { Maths: maths, English: average } })
  const cohort = [m('a', 80, 90), m('b', 70, 50), m('c', 60, 70), m('d', 50, 30)]

  it('finds position, outOf and the best/average/lowest overall', () => {
    const s = buildStudentStanding('b', cohort, false)!
    expect(s.position).toBe(2)
    expect(s.outOf).toBe(4)
    expect(s.overall).toEqual({ you: 70, best: 80, worst: 50, average: 65, count: 4 })
    expect(s.points).toBeNull()
  })
  it('compares each subject against the class', () => {
    const s = buildStudentStanding('b', cohort, false)!
    const maths = s.subjects.find((x) => x.subject === 'Maths')!
    expect(maths).toMatchObject({ you: 50, best: 90, worst: 30, average: 60, position: 3, outOf: 4 })
  })
  it('uses aggregate points on the MSCE track (lower is better)', () => {
    const msce = [m('a', 60, 60, 20), m('b', 90, 90, 25), m('c', 50, 50, 10)]
    const s = buildStudentStanding('a', msce, true)!
    expect(s.position).toBe(2)
    expect(s.points).toEqual({ you: 20, best: 10, worst: 25, average: 18.3, count: 3 })
  })
  it('is null when the student is not in the class results', () => {
    expect(buildStudentStanding('zzz', cohort, false)).toBeNull()
  })
  it('exposes no names on the comparison figures', () => {
    const s = buildStudentStanding('b', cohort, false)!
    expect(JSON.stringify(s)).not.toMatch(/"name"/)
  })
})

describe('buildTopPerformersBody', () => {
  const body = buildTopPerformersBody(2, '2025/2026', [
    { className: 'Form 2A', form: 2, students: [{ name: 'Zed Z' }] },
    { className: 'Form 1B', form: 1, students: [{ name: 'Bo B' }, { name: 'Al A' }] },
    { className: 'Form 1A', form: 1, students: [{ name: 'Cy C' }] },
  ])
  it('opens with a complete sentence (push previews show only this)', () => {
    expect(body.split('\n')[0]).toMatch(/^Congratulations to the top 10 students in every class for Term 2, 2025\/2026\./)
  })
  it('groups by form then class, forms ascending, ranked rows numbered', () => {
    const lines = body.split('\n')
    expect(lines.indexOf('# Form 1')).toBeLessThan(lines.indexOf('# Form 2'))
    expect(lines.indexOf('## Form 1A')).toBeLessThan(lines.indexOf('## Form 1B'))
    expect(lines).toContain('1. Bo B')
    expect(lines).toContain('2. Al A')
  })
  it('contains names only — no marks', () => {
    expect(body).not.toMatch(/%|pts|points/i)
  })
})
