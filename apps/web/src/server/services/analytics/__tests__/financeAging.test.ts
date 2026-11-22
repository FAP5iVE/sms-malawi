import { describe, it, expect } from 'vitest'
import { bucketForDaysOverdue, buildAging, type AgingInvoiceInput } from '../financeAging'

const asOf = new Date('2026-10-10T08:00:00Z')

function inv(id: string, balance: number, due: string, form: number | null = 1): AgingInvoiceInput {
  return {
    invoiceId: id,
    invoiceNumber: `INV-${id}`,
    studentId: `s-${id}`,
    studentName: `Student ${id}`,
    className: form === null ? null : `Form ${form}A`,
    form,
    balance,
    dueDate: new Date(due),
  }
}

describe('bucketForDaysOverdue', () => {
  it('treats not-yet-due and due-today as current', () => {
    expect(bucketForDaysOverdue(-5)).toBe('current')
    expect(bucketForDaysOverdue(0)).toBe('current')
  })
  it('assigns boundaries correctly', () => {
    expect(bucketForDaysOverdue(1)).toBe('d1_30')
    expect(bucketForDaysOverdue(30)).toBe('d1_30')
    expect(bucketForDaysOverdue(31)).toBe('d31_60')
    expect(bucketForDaysOverdue(60)).toBe('d31_60')
    expect(bucketForDaysOverdue(61)).toBe('d61_90')
    expect(bucketForDaysOverdue(90)).toBe('d61_90')
    expect(bucketForDaysOverdue(91)).toBe('d90_plus')
  })
})

describe('buildAging', () => {
  it('ages from the due date and ignores settled invoices', () => {
    const r = buildAging(
      [
        inv('a', 1000, '2026-11-01'), // not yet due
        inv('b', 2000, '2026-09-30'), // 10 days
        inv('c', 3000, '2026-08-01'), // 70 days
        inv('d', 4000, '2026-05-01'), // 162 days
        inv('e', 0, '2026-01-01'), // settled
      ],
      asOf,
    )
    expect(r.totalOutstanding).toBe(10000)
    expect(r.overdueAmount).toBe(9000)
    expect(r.severeAmount).toBe(7000)
    expect(r.severeShare).toBe(70)
    expect(r.buckets.find((b) => b.key === 'current')?.amount).toBe(1000)
    expect(r.buckets.find((b) => b.key === 'd90_plus')?.count).toBe(1)
    expect(r.debtors).toHaveLength(4)
    expect(r.debtors[0]?.invoiceId).toBe('d')
  })

  it('returns null share (not 0) with nothing outstanding', () => {
    const r = buildAging([inv('a', 0, '2026-01-01')], asOf)
    expect(r.severeShare).toBeNull()
    expect(r.totalOutstanding).toBe(0)
  })

  it('groups by form with a No class bucket and truncates debtors', () => {
    const r = buildAging([inv('a', 10, '2026-09-01', 2), inv('b', 20, '2026-09-01', null), inv('c', 5, '2026-09-01', 1)], asOf, 2)
    expect(r.byForm.map((f) => f.label)).toEqual(['Form 1', 'Form 2', 'No class'])
    expect(r.debtors).toHaveLength(2)
    expect(r.debtorsTruncated).toBe(true)
  })
})
