/**
 * financialRegisterService.test.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-06.
 *
 * Prisma and the ledger functions are mocked: these prove what is written, on which transaction and in which order.
 * The database rules (UQ-04, numbering, CHK-17) are proven in `__integration__/financialRegister.itest.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  order: [] as string[],
  createJournalEntry: vi.fn(),
  postEntry: vi.fn(),
  voidEntry: vi.fn(),
  tx: {
    financialTransaction: { create: vi.fn(), updateMany: vi.fn() },
    idempotencyRecord: { updateMany: vi.fn() },
  },
}))

vi.mock('@/server/services/accountingService', () => ({
  createJournalEntry: h.createJournalEntry, postEntry: h.postEntry, voidEntry: h.voidEntry,
}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/server/services/settingsService', () => ({}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { record, recordAndPost, reverseAndPost, markPosted, type RegisterEvent } from '../financialRegisterService'

const tx = h.tx as never
const event = (over: Partial<RegisterEvent> = {}): RegisterEvent => ({
  type: 'STUDENT_PAYMENT', sourceType: 'PAYMENT', sourceId: 'p1', eventKey: 'RECEIPT', direction: 'IN',
  amount: 100.005, occurredAt: new Date('2026-11-27T08:00:00Z'), actorUid: 'u1', ...over,
})
const plan = { reference: 'PAY-1', description: 'd', lines: [{ accountCode: '1000', debit: 100 }, { accountCode: '4000', credit: 100 }] }

beforeEach(() => {
  vi.clearAllMocks()
  h.order.length = 0
  h.tx.financialTransaction.create.mockImplementation(async () => { h.order.push('register'); return { id: 'ft1', transactionNumber: 'TXN-2026-000001' } })
  h.tx.financialTransaction.updateMany.mockImplementation(async ({ data }: { data: { status: string } }) => { h.order.push(`status:${data.status}`); return { count: 1 } })
  h.createJournalEntry.mockImplementation(async () => { h.order.push('entry'); return 'je1' })
  h.postEntry.mockImplementation(async () => { h.order.push('post') })
  h.voidEntry.mockImplementation(async () => { h.order.push('reverse-entry'); return 'je2' })
})

describe('record', () => {
  it('rounds the amount to the cent and leaves the number to the database', async () => {
    await record(tx, event())
    const data = h.tx.financialTransaction.create.mock.calls[0]![0].data
    expect(String(data.amount)).toBe('100.01')
    expect(data.status).toBe('PENDING_POSTING')
    expect(data).not.toHaveProperty('transactionNumber')
  })

  it('refuses a negative amount', async () => {
    await expect(record(tx, event({ amount: -1 }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(h.tx.financialTransaction.create).not.toHaveBeenCalled()
  })

  it('links the idempotency record to the transaction', async () => {
    await record(tx, event({ idempotency: { scope: 's', key: 'k-12345678', requestHash: 'h' } }))
    expect(h.tx.financialTransaction.create.mock.calls[0]![0].data).toMatchObject({ idempotencyKey: 'k-12345678', requestFingerprint: 'h' })
    expect(h.tx.idempotencyRecord.updateMany).toHaveBeenCalledWith({
      where: { scope: 's', key: 'k-12345678' }, data: { financialTransactionId: 'ft1' },
    })
  })

  it('the same source event again is 409 ALREADY_POSTED (UQ-04)', async () => {
    h.tx.financialTransaction.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['sourceType', 'sourceId', 'eventKey'] } }),
    )
    await expect(record(tx, event())).rejects.toMatchObject({ code: 'ALREADY_POSTED', status: 409 })
  })

  it('a second reversal row is 409 ALREADY_REVERSED', async () => {
    h.tx.financialTransaction.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['reversalOfId'] } }),
    )
    await expect(record(tx, event(), { reversalOfId: 'ft0' })).rejects.toMatchObject({ code: 'ALREADY_REVERSED' })
  })
})

describe('recordAndPost', () => {
  it('writes the register row, then the linked entry, posts it and marks the row POSTED, all on the caller’s transaction', async () => {
    await expect(recordAndPost(tx, event(), plan)).resolves.toEqual({
      transactionId: 'ft1', transactionNumber: 'TXN-2026-000001', journalEntryId: 'je1',
    })
    expect(h.order).toEqual(['register', 'entry', 'post', 'status:POSTED'])
    expect(h.createJournalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: 'PAY-1', entryDate: event().occurredAt, financialTransactionId: 'ft1', sourceType: 'PAYMENT', sourceId: 'p1',
      }),
      tx,
    )
    expect(h.postEntry).toHaveBeenCalledWith('je1', 'u1', tx)
  })

  it('a posting failure reaches the caller, so the whole unit rolls back', async () => {
    h.postEntry.mockRejectedValue(new Error('unbalanced'))
    await expect(recordAndPost(tx, event(), plan)).rejects.toThrow('unbalanced')
    expect(h.tx.financialTransaction.updateMany).not.toHaveBeenCalled()
  })

  it('markPosted claims once', async () => {
    h.tx.financialTransaction.updateMany.mockResolvedValue({ count: 0 })
    await expect(markPosted(tx, 'ft1', 'je1')).rejects.toMatchObject({ code: 'ALREADY_POSTED' })
  })
})

describe('reverseAndPost', () => {
  const reversal = () => event({ type: 'STUDENT_PAYMENT_REVERSAL', eventKey: 'REVERSAL', direction: 'OUT' })

  it('claims the original first, then registers and posts the reversal', async () => {
    await reverseAndPost(tx, { originalTransactionId: 'ft0', journalEntryId: 'je0', reason: 'mistake', event: reversal() })
    expect(h.order).toEqual(['status:REVERSED', 'register', 'reverse-entry', 'status:POSTED'])
    expect(h.tx.financialTransaction.updateMany.mock.calls[0]![0].where).toEqual({ id: 'ft0', status: 'POSTED' })
    expect(h.tx.financialTransaction.create.mock.calls[0]![0].data.reversalOfId).toBe('ft0')
    expect(h.voidEntry).toHaveBeenCalledWith('je0', 'u1', 'mistake', tx, {
      financialTransactionId: 'ft1', sourceType: 'PAYMENT', sourceId: 'p1',
    })
  })

  it('a second reversal writes nothing', async () => {
    h.tx.financialTransaction.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      reverseAndPost(tx, { originalTransactionId: 'ft0', journalEntryId: 'je0', reason: 'again', event: reversal() }),
    ).rejects.toMatchObject({ code: 'ALREADY_REVERSED' })
    expect(h.tx.financialTransaction.create).not.toHaveBeenCalled()
    expect(h.voidEntry).not.toHaveBeenCalled()
  })

  it('an entry posted before the register existed is reversed and the reversal registered', async () => {
    await reverseAndPost(tx, { journalEntryId: 'je-old', reason: 'legacy', event: reversal() })
    expect(h.order).toEqual(['register', 'reverse-entry', 'status:POSTED'])
  })
})
