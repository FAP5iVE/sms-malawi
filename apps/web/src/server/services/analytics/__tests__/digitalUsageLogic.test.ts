import { describe, it, expect } from 'vitest'
import { isRepeatView, summariseDigitalUsage, summariseStock, trendBuckets, VIEW_DEDUPE_MINUTES } from '../digitalUsageLogic'

const D = (s: string) => new Date(`${s}T12:00:00Z`)
const NOW = D('2026-03-31')
const win = { from: D('2026-03-01'), to: NOW }

const res = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: `Res ${id}`, type: 'EBOOK', subject: 'Biology', form: 2, approved: true,
  createdAt: D('2026-01-01'), approvedAt: D('2026-01-05'), ...over,
})
const view = (resourceId: string, viewerUid: string, day: string) => ({ resourceId, viewerUid, viewedAt: D(day) })

describe('isRepeatView', () => {
  it('treats a re-open within the window as a repeat, and one after it as new', () => {
    const now = new Date('2026-03-01T10:00:00Z')
    expect(isRepeatView(null, now)).toBe(false)
    expect(isRepeatView(new Date(now.getTime() - 60_000), now)).toBe(true)
    expect(isRepeatView(new Date(now.getTime() - (VIEW_DEDUPE_MINUTES + 1) * 60_000), now)).toBe(false)
  })
})

describe('trendBuckets', () => {
  it('uses days for a month or less and weeks beyond', () => {
    expect(trendBuckets(D('2026-03-01'), D('2026-03-10')).unit).toBe('day')
    expect(trendBuckets(D('2026-03-01'), D('2026-03-10')).keys).toHaveLength(10)
    expect(trendBuckets(D('2026-01-01'), D('2026-03-31')).unit).toBe('week')
  })
})

describe('summariseDigitalUsage', () => {
  const resources = [
    res('r1'),
    res('r2', { type: 'PAST_PAPER', subject: 'Maths', form: 4 }),
    res('r3', { type: 'PAST_PAPER', subject: null, form: null }),
    res('r4', { approved: false, approvedAt: null, createdAt: D('2026-03-11') }),
  ]
  const views = [
    view('r1', 'u1', '2026-03-05'), view('r1', 'u2', '2026-03-06'), view('r1', 'u1', '2026-03-20'),
    view('r2', 'u1', '2026-03-07'),
    view('r1', 'u3', '2026-02-01'), // before the window
    view('zzz', 'u1', '2026-03-07'), // not in the filtered set
  ]
  const s = summariseDigitalUsage(resources, views, win, NOW)

  it('separates the catalogue from usage', () => {
    expect(s.catalogue).toEqual({ total: 4, approved: 3, pending: 1, rejected: 0, oldestPendingDays: 20 })
    expect(s.usage).toEqual({ views: 4, uniqueViewers: 2, resourcesViewed: 2, usageRate: 66.7, approvedNotViewed: 1 })
  })

  it('counts only views of the filtered resources inside the window', () => {
    expect(s.mostUsed.map((r) => [r.id, r.views, r.uniqueViewers])).toEqual([['r1', 3, 2], ['r2', 1, 1]])
    expect(s.trend.reduce((t, p) => t + p.views, 0)).toBe(s.usage.views)
  })

  it('groups reconcile with the totals', () => {
    for (const g of [s.byType, s.bySubject, s.byForm]) {
      expect(g.reduce((t, r) => t + r.resources, 0)).toBe(4)
      expect(g.reduce((t, r) => t + r.views, 0)).toBe(4)
    }
    expect(s.byType.map((r) => [r.label, r.resources, r.approved, r.pending])).toEqual([['eBook', 2, 1, 1], ['Past paper', 2, 2, 0]])
    expect(s.bySubject.find((r) => r.label === 'No subject')?.resources).toBe(1)
    expect(s.byForm.find((r) => r.label === 'All forms')?.resources).toBe(1)
  })

  it('least used lists approved resources only, never-viewed first', () => {
    expect(s.leastUsed.map((r) => [r.id, r.views])).toEqual([['r3', 0], ['r2', 1], ['r1', 3]])
    expect(s.leastUsed.find((r) => r.id === 'r4')).toBeUndefined()
  })

  it('lists pending resources by age and never exposes viewers', () => {
    expect(s.pending).toEqual([expect.objectContaining({ id: 'r4', ageDays: 20 })])
    expect(JSON.stringify(s)).not.toMatch(/u1|u2|viewerUid/)
  })

  it('has no usage rate when nothing is approved', () => {
    const none = summariseDigitalUsage([res('p', { approved: false })], [], win, NOW)
    expect(none.usage.usageRate).toBeNull()
    expect(none.usage.views).toBe(0)
    expect(none.leastUsed).toEqual([])
  })
})

describe('rejected resources', () => {
  const resources = [
    res('a1'),
    res('p1', { approved: false, approvedAt: null, createdAt: D('2026-03-11') }),
    res('x1', { approved: false, approvedAt: null, createdAt: D('2026-03-01'), rejectedAt: D('2026-03-05') }),
    res('x2', { approved: false, approvedAt: null, createdAt: D('2026-03-02'), rejectedAt: D('2026-03-06'), type: 'PAST_PAPER' }),
  ]
  const s = summariseDigitalUsage(resources, [], win, NOW)

  it('counts rejected resources separately from approved and awaiting ones', () => {
    expect(s.catalogue).toEqual({ total: 4, approved: 1, pending: 1, rejected: 2, oldestPendingDays: 20 })
    expect(s.catalogue.approved + s.catalogue.pending + s.catalogue.rejected).toBe(s.catalogue.total)
  })

  it('keeps rejected resources out of the awaiting-approval list and the usage figures', () => {
    expect(s.pending.map((p) => p.id)).toEqual(['p1'])
    expect(s.usage.usageRate).toBe(0)
    expect(s.leastUsed.map((r) => r.id)).toEqual(['a1'])
  })

  it('splits each group into approved, awaiting and rejected', () => {
    expect(s.byType.map((r) => [r.label, r.resources, r.approved, r.pending, r.rejected]))
      .toEqual([['eBook', 3, 1, 1, 1], ['Past paper', 1, 0, 0, 1]])
  })
})

describe('summariseStock', () => {
  const books = [
    { id: 'b1', title: 'Maths F1', author: 'A', category: 'TEXTBOOK', totalCopies: 10, availableCopies: 4 },
    { id: 'b2', title: 'Novel', author: 'B', category: 'FICTION', totalCopies: 3, availableCopies: 0 },
    { id: 'b3', title: 'Atlas', author: 'C', category: 'REFERENCE', totalCopies: 2, availableCopies: 1 },
  ]
  const open = [
    ...Array.from({ length: 5 }, () => ({ bookId: 'b1', dueDate: D('2026-04-10') })),
    { bookId: 'b2', dueDate: D('2026-03-01') }, { bookId: 'b2', dueDate: D('2026-04-10') },
  ]
  const s = summariseStock(books, open, NOW)

  it('splits copies into available, on loan and off the shelf', () => {
    expect(s).toMatchObject({ titles: 3, copies: 15, available: 5, onLoan: 7, offShelf: 3 })
    expect(s.availabilityRate).toBe(33.3)
    expect(s.available + s.onLoan + s.offShelf).toBe(s.copies)
  })

  it('lists titles with no copy available, overdue first', () => {
    expect(s.unavailable).toEqual([expect.objectContaining({ bookId: 'b2', copies: 3, onLoan: 2, overdue: 1 })])
  })

  it('categories reconcile and show the lowest availability first', () => {
    expect(s.byCategory.map((c) => [c.category, c.availabilityRate])).toEqual([['FICTION', 0], ['TEXTBOOK', 40], ['REFERENCE', 50]])
    expect(s.byCategory.reduce((t, c) => t + c.copies, 0)).toBe(s.copies)
  })

  it('has no availability rate with no copies', () => {
    expect(summariseStock([], [], NOW).availabilityRate).toBeNull()
  })
})
