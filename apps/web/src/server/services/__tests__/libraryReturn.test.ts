/**
 * libraryReturn.test.ts
 *
 * Covers returnBook(): the overdue (LATE) fine and the damage / loss fee are saved
 * together with the return, each fine carries its kind and is linked to the loan,
 * the borrower is notified, and a lost loan cannot be returned (and billed) twice.
 *
 * Also pins the validation regression that made the old two-step charge fail every
 * time: the fine schema must accept the `null` studentId/staffId a borrowing carries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted above imports, so anything its factory uses must be hoisted too.
const { tx, prismaMock, pushToFeed } = vi.hoisted(() => {
  const tx = {
    libraryFine: { create: vi.fn() },
    borrowing:   { update: vi.fn() },
    book:        { update: vi.fn() },
  }
  const prismaMock = {
    borrowing:    { findUniqueOrThrow: vi.fn(), findMany: vi.fn() },
    libraryFine:  { findMany: vi.fn(), findFirst: vi.fn() },
    student:      { findUnique: vi.fn() },
    staffProfile: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  }
  return { tx, prismaMock, pushToFeed: vi.fn() }
})
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/storage', () => ({ getSignedViewUrl: vi.fn() }))
vi.mock('../digitalViewRecorder', () => ({ recordDigitalResourceView: vi.fn() }))
vi.mock('@/server/services/algoliaService', () => ({ indexBook: vi.fn(), updateBook: vi.fn() }))
vi.mock('@/server/services/settingsService', () => ({ get: vi.fn(async () => 100) })) // MWK 100 / day
vi.mock('@/server/services/notificationFeedService', () => ({ pushToFeed }))

import { returnBook, describeReturnCharges, listMyBorrowings, listMyFines, fineBelongsTo } from '../libraryService'
import { ReturnBorrowingSchema } from '@shared/schemas/library'
import { CreateLibraryFineSchema } from '@shared/schemas/finance'

const DAY = 86_400_000

type FineData = { kind: string; amount: number; borrowingId?: string; studentId?: string | null; staffId?: string | null; reason?: string }
const createdFines = (): FineData[] => tx.libraryFine.create.mock.calls.map((c) => (c[0] as { data: FineData }).data)

function loan(over: Record<string, unknown> = {}) {
  return {
    id: 'b1', bookId: 'book1', status: 'ACTIVE',
    dueDate: new Date(Date.now() - 3 * DAY - 60_000),   // 3 full days late
    studentId: 'stu1', staffId: null,
    book: { id: 'book1', title: 'Physics for Malawi Secondary Schools' },
    student: { firebaseUid: 'fb-stu1' }, staff: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  tx.libraryFine.create.mockImplementation(async ({ data }: { data: { kind: string } }) => ({ id: `fine-${data.kind}` }))
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))
  tx.borrowing.update.mockResolvedValue({})
  tx.book.update.mockResolvedValue({})
})

describe('returnBook — charges are saved with the return', () => {
  it('damaged + overdue: saves a LATE fine and a DAMAGED fine, both linked to the loan', async () => {
    prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue(loan())
    const res = await returnBook('b1', { condition: 'DAMAGED', notes: 'Torn binding', fee: 5000 }, 'lib-1')

    const created = createdFines()
    expect(created).toHaveLength(2)
    expect(created[0]).toMatchObject({ kind: 'LATE', amount: 300, borrowingId: 'b1', studentId: 'stu1', staffId: null })
    expect(created[1]).toMatchObject({ kind: 'DAMAGED', amount: 5000, borrowingId: 'b1', studentId: 'stu1', reason: 'Torn binding' })
    expect(res).toMatchObject({ overdueDays: 3, fineAmount: 300, conditionFee: 5000, fineId: 'fine-LATE', conditionFeeId: 'fine-DAMAGED' })
    // Damaged copy goes back on the shelf.
    expect(tx.book.update).toHaveBeenCalledWith({ where: { id: 'book1' }, data: { availableCopies: { increment: 1 } } })
  })

  it('lost: saves a LOST fine, closes the loan as LOST and removes the copy from the collection', async () => {
    prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue(loan({ dueDate: new Date(Date.now() + DAY) })) // not overdue
    const res = await returnBook('b1', { condition: 'LOST', fee: 12000 }, 'lib-1')

    const created = createdFines()
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ kind: 'LOST', amount: 12000, reason: 'Book returned lost.' })
    expect((tx.borrowing.update.mock.calls[0]![0] as { data: object }).data).toMatchObject({ status: 'LOST', condition: 'LOST', fineAmount: null, fineId: null })
    expect(tx.book.update).toHaveBeenCalledWith({ where: { id: 'book1' }, data: { totalCopies: { decrement: 1 } } })
    expect(res.conditionFeeId).toBe('fine-LOST')
  })

  it('damaged with no amount typed: no condition fine (only the overdue one)', async () => {
    prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue(loan())
    const res = await returnBook('b1', { condition: 'DAMAGED' }, 'lib-1')
    expect(createdFines().map((f) => f.kind)).toEqual(['LATE'])
    expect(res.conditionFeeId).toBeUndefined()
  })

  it('a fee sent with a GOOD return is ignored', async () => {
    prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue(loan({ dueDate: new Date(Date.now() + DAY) }))
    await returnBook('b1', { condition: 'GOOD', fee: 9999 }, 'lib-1')
    expect(tx.libraryFine.create).not.toHaveBeenCalled()
  })

  it('a staff borrower is charged on the staff id', async () => {
    prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue(loan({ studentId: null, staffId: 'staff1', student: null, staff: { uid: 'fb-staff1' } }))
    await returnBook('b1', { condition: 'LOST', fee: 3000 }, 'lib-1')
    const lost = createdFines().find((d) => d.kind === 'LOST')
    expect(lost).toMatchObject({ studentId: null, staffId: 'staff1', amount: 3000 })
    expect(pushToFeed).toHaveBeenCalledWith('fb-staff1', expect.objectContaining({ category: 'library_fine', actionUrl: '/library' }))
  })

  it('a loan already recorded as LOST cannot be returned again (no second charge)', async () => {
    prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue(loan({ status: 'LOST' }))
    await expect(returnBook('b1', { condition: 'LOST', fee: 12000 }, 'lib-1')).rejects.toThrow(/already recorded as lost/i)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('an already returned loan is still rejected', async () => {
    prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue(loan({ status: 'RETURNED' }))
    await expect(returnBook('b1', { condition: 'GOOD' }, 'lib-1')).rejects.toThrow(/already returned/i)
  })
})

describe('returnBook — borrower notification', () => {
  it('tells the student what was charged and why', async () => {
    prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue(loan())
    await returnBook('b1', { condition: 'DAMAGED', fee: 5000 }, 'lib-1')
    expect(pushToFeed).toHaveBeenCalledTimes(1)
    const [uid, item] = pushToFeed.mock.calls[0] as [string, { body: string }]
    expect(uid).toBe('fb-stu1')
    expect(item).toMatchObject({ title: 'Library fine added', type: 'WARNING', category: 'library_fine', actionUrl: '/reports?tab=library' })
    expect(item.body).toContain('MWK 5,000')
    expect(item.body).toContain('returned damaged')
    expect(item.body).toContain('MWK 300 late fee')
  })

  it('sends nothing when nothing was charged', async () => {
    prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue(loan({ dueDate: new Date(Date.now() + DAY) }))
    await returnBook('b1', { condition: 'GOOD' }, 'lib-1')
    expect(pushToFeed).not.toHaveBeenCalled()
  })

  it('a failing notification never fails the return', async () => {
    prismaMock.borrowing.findUniqueOrThrow.mockResolvedValue(loan())
    pushToFeed.mockRejectedValueOnce(new Error('firestore down'))
    await expect(returnBook('b1', { condition: 'DAMAGED', fee: 5000 }, 'lib-1')).resolves.toMatchObject({ conditionFee: 5000 })
  })
})

describe('describeReturnCharges', () => {
  it('words a lost book and singular days', () => {
    expect(describeReturnCharges({ bookTitle: 'Biology', condition: 'LOST', overdueDays: 1, lateFine: 100, conditionFee: 8000 }))
      .toBe('MWK 8,000 for "Biology" — recorded as lost. MWK 100 late fee for "Biology" — 1 day overdue.')
  })
})

describe('validation', () => {
  it('ReturnBorrowingSchema accepts a fee and rejects a negative one', () => {
    expect(ReturnBorrowingSchema.safeParse({ condition: 'LOST', fee: 5000 }).success).toBe(true)
    expect(ReturnBorrowingSchema.safeParse({ condition: 'LOST', fee: -1 }).success).toBe(false)
    expect(ReturnBorrowingSchema.parse({}).condition).toBe('GOOD')
  })

  // The bug that silently dropped every damage/loss charge: a borrowing carries the OTHER
  // borrower id as null, and the old schema (.optional()) rejected null with a 400.
  it('CreateLibraryFineSchema accepts the null studentId/staffId a borrowing carries', () => {
    const student = CreateLibraryFineSchema.safeParse({ studentId: 'stu1', staffId: null, bookTitle: 'Physics', amount: 5000, reason: 'Torn' })
    const staff   = CreateLibraryFineSchema.safeParse({ studentId: null, staffId: 'st1', bookTitle: 'Physics', amount: 5000, reason: 'Lost' })
    expect(student.success).toBe(true)
    expect(staff.success).toBe(true)
  })
  it('CreateLibraryFineSchema still requires one borrower', () => {
    expect(CreateLibraryFineSchema.safeParse({ studentId: null, staffId: null, bookTitle: 'x', amount: 1, reason: 'x' }).success).toBe(false)
  })
})


// ─── A person's OWN loans and fines (students / staff without library-desk access) ───

describe('listMyBorrowings / listMyFines / fineBelongsTo', () => {
  const studentRow = { id: 'stu1' }

  beforeEach(() => {
    prismaMock.student.findUnique.mockResolvedValue(studentRow)
    prismaMock.staffProfile.findUnique.mockResolvedValue(null)
  })

  it('is scoped to the student behind the auth uid — never to an id from the request', async () => {
    prismaMock.borrowing.findMany.mockResolvedValue([])
    await listMyBorrowings('fb-stu1')
    expect(prismaMock.student.findUnique).toHaveBeenCalledWith({ where: { firebaseUid: 'fb-stu1' }, select: { id: true } })
    expect(prismaMock.borrowing.findMany.mock.calls[0]![0]).toMatchObject({ where: { studentId: 'stu1' } })
  })

  it('a staff member is found by their uid and scoped to staffId', async () => {
    prismaMock.student.findUnique.mockResolvedValue(null)
    prismaMock.staffProfile.findUnique.mockResolvedValue({ id: 'staff1' })
    prismaMock.borrowing.findMany.mockResolvedValue([])
    await listMyBorrowings('fb-staff1')
    expect(prismaMock.borrowing.findMany.mock.calls[0]![0]).toMatchObject({ where: { staffId: 'staff1' } })
  })

  it('someone with no student or staff record gets nothing (and no query)', async () => {
    prismaMock.student.findUnique.mockResolvedValue(null)
    expect(await listMyBorrowings('nobody')).toMatchObject({ loans: [] })
    expect(await listMyFines('nobody')).toEqual([])
    expect(await fineBelongsTo('nobody', 'f1')).toBe(false)
    expect(prismaMock.borrowing.findMany).not.toHaveBeenCalled()
    expect(prismaMock.libraryFine.findMany).not.toHaveBeenCalled()
  })

  it('shows an overdue book with the late fee building up, and a lost book with what was charged', async () => {
    prismaMock.borrowing.findMany.mockResolvedValue([
      { id: 'b1', issuedAt: new Date(Date.now() - 20 * DAY), dueDate: new Date(Date.now() - 3 * DAY - 60_000), returnedAt: null,
        status: 'ACTIVE', condition: 'GOOD', book: { title: 'Physics', author: 'A. Banda', barcode: 'BC1' }, libraryFines: [] },
      { id: 'b2', issuedAt: new Date(Date.now() - 60 * DAY), dueDate: new Date(Date.now() - 40 * DAY), returnedAt: new Date(Date.now() - 30 * DAY),
        status: 'LOST', condition: 'LOST', book: { title: 'Biology', author: 'C. Phiri', barcode: null },
        libraryFines: [{ amount: 8000, status: 'PENDING' }, { amount: 1000, status: 'PAID' }] },
    ])
    const { finePerDay, loans } = await listMyBorrowings('fb-stu1')
    expect(finePerDay).toBe(100)
    expect(loans[0]).toMatchObject({ status: 'OVERDUE', daysOverdue: 3, accruedLateFee: 300, chargedTotal: 0 })
    expect(loans[1]).toMatchObject({ status: 'LOST', condition: 'LOST', daysOverdue: 0, accruedLateFee: 0, chargedTotal: 9000, chargedPending: 8000 })
  })

  it('lists fines of every kind with the latest waiver request on each', async () => {
    prismaMock.libraryFine.findMany.mockResolvedValue([
      { id: 'f1', bookTitle: 'Biology', kind: 'LOST', amount: { toString: () => '8000' }, reason: 'Book returned lost.', status: 'PENDING', borrowingId: 'b2',
        createdAt: new Date('2026-10-01'), paidAt: null, waivedAt: null,
        waiverRequests: [{ id: 'w1', status: 'REJECTED', reason: 'Hardship', reviewNotes: 'Pay half first', createdAt: new Date('2026-10-02') }] },
      { id: 'f2', bookTitle: 'Physics', kind: 'LATE', amount: 300, reason: '3 overdue day(s) at MWK 100/day', status: 'PAID', borrowingId: 'b1',
        createdAt: new Date('2026-09-20'), paidAt: new Date('2026-09-25'), waivedAt: null, waiverRequests: [] },
    ])
    const fines = await listMyFines('fb-stu1')
    expect(prismaMock.libraryFine.findMany.mock.calls[0]![0]).toMatchObject({ where: { studentId: 'stu1' } })
    expect(fines.map((f) => [f.kind, f.amount, f.status])).toEqual([['LOST', 8000, 'PENDING'], ['LATE', 300, 'PAID']])
    expect(fines[0]!.waiver).toMatchObject({ status: 'REJECTED', reviewNotes: 'Pay half first' })
    expect(fines[1]!.waiver).toBeNull()
    expect(fines[1]!.settledAt).toBe(new Date('2026-09-25').toISOString())
  })

  it('fineBelongsTo only says yes for a fine charged to that person', async () => {
    prismaMock.libraryFine.findFirst.mockResolvedValueOnce({ id: 'f1' })
    expect(await fineBelongsTo('fb-stu1', 'f1')).toBe(true)
    expect(prismaMock.libraryFine.findFirst).toHaveBeenCalledWith({ where: { id: 'f1', studentId: 'stu1' }, select: { id: true } })
    prismaMock.libraryFine.findFirst.mockResolvedValueOnce(null)
    expect(await fineBelongsTo('fb-stu1', 'someone-elses')).toBe(false)
  })
})
