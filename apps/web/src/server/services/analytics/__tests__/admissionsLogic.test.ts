import { describe, it, expect } from 'vitest'
import {
  pendingAgeBucket, firstDecisions, firstApprovals, pipelineRates, reviewTimes,
  approvalToAdmissionDays, topWithOther,
} from '../admissionsLogic'

const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe('admissions logic', () => {
  it('buckets pending age', () => {
    expect(pendingAgeBucket(0)).toBe('0–3 days')
    expect(pendingAgeBucket(7)).toBe('4–7 days')
    expect(pendingAgeBucket(30)).toBe('15–30 days')
    expect(pendingAgeBucket(31)).toBe('Over 30 days')
  })

  it('takes the earliest decision and ignores unrelated actions', () => {
    const ev = [
      { applicationId: 'a', action: 'application.reviewed', at: d('2026-02-10') },
      { applicationId: 'a', action: 'application.approved', at: d('2026-02-05') },
      { applicationId: 'a', action: 'student.create', at: d('2026-01-01') },
    ]
    expect(firstDecisions(ev).get('a')).toEqual(d('2026-02-05'))
    expect(firstApprovals(ev).get('a')).toEqual(d('2026-02-05'))
  })

  it('computes rates with null on empty denominators', () => {
    expect(pipelineRates({})).toEqual({ approvalRate: null, denialRate: null, admissionRate: null, conversionRate: null })
    const r = pipelineRates({ PENDING: 2, APPROVED: 1, AWAITING_ADMISSION: 1, ADMITTED: 2, DENIED: 4 })
    expect(r.approvalRate).toBe(50)
    expect(r.denialRate).toBe(50)
    expect(r.admissionRate).toBe(50)
    expect(r.conversionRate).toBe(20)
  })

  it('measures review time and approval-to-admission', () => {
    const apps = [
      { id: 'a', status: 'ADMITTED', createdAt: d('2026-01-01'), reviewedAt: d('2026-01-20') },
      { id: 'b', status: 'PENDING', createdAt: d('2026-01-01'), reviewedAt: null },
    ]
    const ev = [{ applicationId: 'a', action: 'application.approved', at: d('2026-01-05') }]
    expect(reviewTimes(apps, firstDecisions(ev))).toEqual({ avg: 4, median: 4 })
    expect(approvalToAdmissionDays(apps, firstApprovals(ev))).toBe(15)
    expect(reviewTimes([], new Map())).toEqual({ avg: null, median: null })
  })

  it('folds the tail into Other and skips blanks', () => {
    const out = topWithOther(['A', 'A', 'B', 'C', ' ', null, 'D'], 2)
    expect(out).toEqual([{ label: 'A', count: 2 }, { label: 'B', count: 1 }, { label: 'Other', count: 2 }])
  })
})
