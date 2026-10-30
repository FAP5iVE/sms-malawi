import { describe, it, expect } from 'vitest'
import { assignmentStatus, assignmentTotals, subjectRows, parseSubjectResults } from '../studentLogic'

const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe('student logic', () => {
  it('classifies assignment status', () => {
    const now = d('2026-10-10')
    expect(assignmentStatus({ status: 'SUBMITTED', submittedAt: d('2026-10-01') }, d('2026-10-05'), now)).toBe('SUBMITTED')
    expect(assignmentStatus({ status: 'SUBMITTED', submittedAt: d('2026-10-08') }, d('2026-10-05'), now)).toBe('LATE')
    expect(assignmentStatus({ status: 'LATE', submittedAt: d('2026-10-06') }, d('2026-10-05'), now)).toBe('LATE')
    expect(assignmentStatus(null, d('2026-10-05'), now)).toBe('OVERDUE')
    expect(assignmentStatus({ status: 'MISSING', submittedAt: d('2026-10-01') }, d('2026-10-20'), now)).toBe('PENDING')
  })

  it('judges the due DAY in Malawi time: legacy (midnight-UTC) and new rows agree', () => {
    const legacyDue = d('2026-10-05')                       // old rows: midnight UTC of the due day
    const newDue = new Date('2026-10-05T21:59:59.999Z')     // new rows: last millisecond of the day in Malawi
    for (const due of [legacyDue, newDue]) {
      // 12:00 in Malawi on the due day: still PENDING (this used to read OVERDUE for legacy rows)
      expect(assignmentStatus(null, due, new Date('2026-10-05T10:00:00Z'))).toBe('PENDING')
      // just after midnight Malawi time the next day: OVERDUE
      expect(assignmentStatus(null, due, new Date('2026-10-05T22:00:00Z'))).toBe('OVERDUE')
      // handed in on the due day (even late in the evening): on time
      expect(assignmentStatus({ status: 'SUBMITTED', submittedAt: new Date('2026-10-05T21:30:00Z') }, due, new Date('2026-10-10T00:00:00Z'))).toBe('SUBMITTED')
      // handed in after midnight Malawi time even if the stored status says SUBMITTED: late
      expect(assignmentStatus({ status: 'SUBMITTED', submittedAt: new Date('2026-10-05T22:30:00Z') }, due, new Date('2026-10-10T00:00:00Z'))).toBe('LATE')
    }
  })

  it('counts completion only against work already due', () => {
    const t = assignmentTotals(['SUBMITTED', 'LATE', 'OVERDUE', 'PENDING'])
    expect(t).toEqual({ total: 4, submitted: 1, late: 1, pending: 1, overdue: 1, completionRate: 66.7 })
    expect(assignmentTotals(['PENDING']).completionRate).toBeNull()
  })

  it('builds subject rows with change and distance from pass', () => {
    const rows = subjectRows(
      { Maths: { average: 45, grade: 'D', pass: false }, English: { average: 72, grade: 'B', pass: true } },
      { Maths: { average: 50, grade: 'C', pass: true } },
      50,
    )
    expect(rows[0]).toMatchObject({ subject: 'English', previousScore: null, change: null, distanceFromPass: 22 })
    expect(rows[1]).toMatchObject({ subject: 'Maths', change: -5, distanceFromPass: -5, pass: false })
  })

  it('parses only the flat subject map', () => {
    expect(parseSubjectResults([])).toEqual({})
    expect(parseSubjectResults(null)).toEqual({})
    expect(parseSubjectResults({ A: { average: '55', grade: 'C', pass: true }, B: 'bad' })).toEqual({ A: { average: 55, grade: 'C', pass: true } })
  })
})
