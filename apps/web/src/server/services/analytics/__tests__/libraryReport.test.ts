/**
 * Digital-library and physical-stock reports, run end to end against a
 * controlled dataset. Also covers view recording: the single usage event the
 * digital report is built on.
 *
 * Digital: r1 eBook Biology F2 (approved), r2 past paper Maths F4 (approved),
 *          r3 past paper (approved, never viewed), r4 eBook (pending 20 days).
 * Views (in the 30-day window): r1 ×3 by 2 viewers, r2 ×1; r1 ×1 six months ago.
 */
import { describe, it, expect, vi } from 'vitest'
import { makeFakePrisma, makeTable } from '../../../../../test/fakePrisma'

const NOW = new Date('2026-03-31T12:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000)

const r = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: `Res ${id}`, type: 'EBOOK', subject: 'Biology', form: 2, approved: true, createdAt: ago(100), approvedAt: ago(90), ...over,
})
const resources = [
  r('r1'),
  r('r2', { type: 'PAST_PAPER', subject: 'Maths', form: 4 }),
  r('r3', { type: 'PAST_PAPER', subject: null, form: null }),
  r('r4', { approved: false, approvedAt: null, createdAt: ago(20) }),
]
const byId = new Map(resources.map((x) => [x.id, x]))
const view = (id: string, resourceId: string, viewerUid: string, d: number) => ({ id, resourceId, viewerUid, viewedAt: ago(d), resource: byId.get(resourceId) })
const viewRows = [
  view('v1', 'r1', 'u1', 10), view('v2', 'r1', 'u2', 9), view('v3', 'r1', 'u1', 2),
  view('v4', 'r2', 'u1', 8), view('v5', 'r1', 'u3', 180),
]

const book = (id: string, category: string, total: number, available: number) => ({ id, title: `Book ${id}`, author: 'Author', category, totalCopies: total, availableCopies: available })
const books = [book('b1', 'TEXTBOOK', 10, 4), book('b2', 'FICTION', 3, 0), book('b3', 'REFERENCE', 2, 1)]
const bookOf = (id: string) => books.find((b) => b.id === id)
const loan = (id: string, bookId: string, dueDate: Date, over: Record<string, unknown> = {}) => ({
  id, bookId, dueDate, returnedAt: null, status: 'ACTIVE', condition: 'GOOD', book: bookOf(bookId), ...over,
})
const borrowings = [
  ...Array.from({ length: 5 }, (_, i) => loan(`l${i}`, 'b1', ago(-10))),
  loan('l5', 'b2', ago(30)), loan('l6', 'b2', ago(-10)),
  loan('l7', 'b3', ago(40), { returnedAt: ago(35), condition: 'DAMAGED' }),
  loan('l8', 'b1', ago(200), { status: 'LOST' }),
]
const conditionLogs = [
  { bookId: 'b1', condition: 'DAMAGED', copies: 2, book: bookOf('b1') },
  { bookId: 'b3', condition: 'LOST', copies: 1, book: bookOf('b3') },
]

const state = { failCreate: false }
const viewTable = makeTable(viewRows)

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ...makeFakePrisma({ digitalResource: resources, book: books, borrowing: borrowings, bookConditionLog: conditionLogs }),
    digitalResourceView: {
      ...viewTable,
      create: async (a: { data: Record<string, unknown> }) => {
        if (state.failCreate) throw new Error('db down')
        return viewTable.create(a)
      },
    },
  },
}))

const { getLibraryDigital, getLibraryStock } = await import ('../libraryAnalytics')
const { recordDigitalResourceView } = await import ('../../digitalViewRecorder')

describe('digital library report', () => {
  it('reports the catalogue and usage separately, from recorded views only', async () => {
    const d = await getLibraryDigital({ days: 30 }, NOW)
    expect(d.catalogue).toEqual({ total: 4, approved: 3, pending: 1, oldestPendingDays: 20 })
    expect(d.usage).toEqual({ views: 4, uniqueViewers: 2, resourcesViewed: 2, usageRate: 66.7, approvedNotViewed: 1 })
    expect(d.mostUsed.map((x) => [x.id, x.views])).toEqual([['r1', 3], ['r2', 1]])
    expect(d.leastUsed[0]).toMatchObject({ id: 'r3', views: 0, lastViewedAt: null })
    expect(d.pending.map((p) => p.id)).toEqual(['r4'])
  })

  it('says when tracking began, so earlier usage is not read as zero', async () => {
    const d = await getLibraryDigital({ days: 30 }, NOW)
    expect(d.trackingSince).toBe(ago(180).toISOString())
  })

  it('a longer window brings in older views', async () => {
    const d = await getLibraryDigital({ days: 365 }, NOW)
    expect(d.usage.views).toBe(5)
    expect(d.usage.uniqueViewers).toBe(3)
    expect(d.trendUnit).toBe('week')
  })

  it('filters the catalogue and the views together', async () => {
    const past = await getLibraryDigital({ days: 30, type: 'PAST_PAPER' }, NOW)
    expect(past.catalogue.total).toBe(2)
    expect(past.usage.views).toBe(1)
    const pending = await getLibraryDigital({ days: 30, status: 'pending' }, NOW)
    expect(pending.catalogue).toMatchObject({ total: 1, approved: 0, pending: 1 })
    expect(pending.usage.views).toBe(0)
    expect(pending.usage.usageRate).toBeNull()
    const form = await getLibraryDigital({ days: 30, form: 2 }, NOW)
    expect(form.catalogue.total).toBe(2)
    const subject = await getLibraryDigital({ days: 30, subject: 'Maths' }, NOW)
    expect(subject.usage.views).toBe(1)
  })

  it('an explicit date range overrides the window and includes both end days', async () => {
    const d = await getLibraryDigital({ from: ago(10), to: ago(9) }, NOW)
    expect(d.usage.views).toBe(2)
  })

  it('names what is not recorded and never exposes viewers', async () => {
    const d = await getLibraryDigital({ days: 30 }, NOW)
    expect(d.notRecorded.map((n) => n.key)).toEqual(expect.arrayContaining(['downloads', 'searches', 'rejections']))
    expect(JSON.stringify(d)).not.toMatch(/"u1"|"u2"|viewerUid/)
  })

  it('does not count searches or downloads anywhere in the result', async () => {
    const d = await getLibraryDigital({ days: 30 }, NOW)
    expect(Object.keys(d.usage)).toEqual(['views', 'uniqueViewers', 'resourcesViewed', 'usageRate', 'approvedNotViewed'])
  })
})

describe('physical stock report', () => {
  it('splits copies into available, on loan and off the shelf', async () => {
    const s = await getLibraryStock({ days: 90 }, NOW)
    expect(s).toMatchObject({ titles: 3, copies: 15, available: 5, onLoan: 7, offShelf: 3, overdueLoans: 1 })
    expect(s.available + s.onLoan + s.offShelf).toBe(s.copies)
  })

  it('lists titles with no copy available and the loans behind them', async () => {
    const s = await getLibraryStock({}, NOW)
    expect(s.unavailable).toEqual([expect.objectContaining({ bookId: 'b2', onLoan: 2, overdue: 1 })])
  })

  it('reports condition from the catalogue log and the loans', async () => {
    const s = await getLibraryStock({ days: 90 }, NOW)
    expect(s.condition).toEqual({ shelfDamagedCopies: 2, shelfLostCopies: 1, loansLost: 1, returnedDamaged: 1 })
    const narrow = await getLibraryStock({ days: 10 }, NOW)
    expect(narrow.condition.returnedDamaged).toBe(0)
  })

  it('filters by category throughout', async () => {
    const s = await getLibraryStock({ category: 'FICTION' }, NOW)
    expect(s).toMatchObject({ titles: 1, copies: 3, available: 0, onLoan: 2, overdueLoans: 1 })
    expect(s.condition).toEqual({ shelfDamagedCopies: 0, shelfLostCopies: 0, loansLost: 0, returnedDamaged: 0 })
  })

  it('does not report renewals', async () => {
    const s = await getLibraryStock({}, NOW)
    expect(s.notRecorded.map((n) => n.key)).toContain('renewals')
  })
})

describe('view recording', () => {
  it('records a first view, ignores a quick repeat, and records again later', async () => {
    const before = viewRows.length
    expect(await recordDigitalResourceView('r1', 'u9', NOW)).toBe(true)
    expect(viewRows).toHaveLength(before + 1)
    expect(await recordDigitalResourceView('r1', 'u9', new Date(NOW.getTime() + 60_000))).toBe(false)
    expect(viewRows).toHaveLength(before + 1)
    expect(await recordDigitalResourceView('r1', 'u9', new Date(NOW.getTime() + 30 * 60_000))).toBe(true)
    expect(viewRows).toHaveLength(before + 2)
  })

  it('counts different viewers and different resources independently', async () => {
    const before = viewRows.length
    expect(await recordDigitalResourceView('r1', 'u10', NOW)).toBe(true)
    expect(await recordDigitalResourceView('r2', 'u9', NOW)).toBe(true)
    expect(viewRows).toHaveLength(before + 2)
  })

  it('never throws when storage fails, so a resource still opens', async () => {
    state.failCreate = true
    const before = viewRows.length
    expect(await recordDigitalResourceView('r3', 'u11', NOW)).toBe(false)
    expect(viewRows).toHaveLength(before)
    state.failCreate = false
  })
})
