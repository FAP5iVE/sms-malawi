/**
 * accountingService.tx.test.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-02 (C-11): the ledger functions accept the
 * caller's transaction.
 *
 * With Prisma mocked this proves WIRING only: which client each call is made on, and whether a
 * transaction is opened. It cannot prove that a rollback really undoes the ledger writes; that is
 * `accountingService.itest.ts`, which needs a real Postgres (TEST_DATABASE_URL).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

type Fn = ReturnType<typeof vi.fn>
interface FakeClient {
  chartOfAccount: { findMany: Fn; update: Fn }
  journalEntry: { create: Fn; update: Fn; updateMany: Fn; findUnique: Fn; findUniqueOrThrow: Fn }
  $transaction?: Fn
}

const h = vi.hoisted(() => {
  const client = (_name: string): FakeClient => ({
    chartOfAccount: { findMany: vi.fn(), update: vi.fn() },
    journalEntry: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  })
  const shared = client('shared')
  // The shared client can open a transaction; the one it hands out (and a caller's tx) cannot nest one.
  const own = client('own-tx')
  shared.$transaction = vi.fn(async (fn: (db: FakeClient) => unknown) => fn(own))
  return { shared, own, client }
})

vi.mock('@/lib/prisma', () => ({ prisma: h.shared }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import * as accounting from '../accountingService'

const dec = (v: string | number) => new Decimal(v)
const base = { reference: 'T-1', description: 'test', entryDate: new Date('2026-11-01'), actorUid: 'u1' }
const lines = [{ accountCode: '1000', debit: 100 }, { accountCode: '4000', credit: 100 }]

const callerTx = h.client('caller-tx')
const asTx = (c: FakeClient) => c as unknown as accounting.LedgerTx

function wire(db: FakeClient) {
  db.chartOfAccount.findMany.mockResolvedValue([{ id: 'a1000', code: '1000' }, { id: 'a4000', code: '4000' }])
  db.journalEntry.create.mockResolvedValue({ id: 'je1' })
  db.journalEntry.updateMany.mockResolvedValue({ count: 1 })
  db.journalEntry.findUniqueOrThrow.mockResolvedValue({
    id: 'je1', reference: 'R-1', description: 'orig', isPosted: true,
    lines: [
      { accountId: 'a1000', debit: dec('100'), credit: dec('0'),   description: 'Cash', account: { code: '1000', type: 'ASSET' } },
      { accountId: 'a4000', debit: dec('0'),   credit: dec('100'), description: 'Rev',  account: { code: '4000', type: 'REVENUE' } },
    ],
  })
}

const touched = (c: FakeClient) =>
  [c.chartOfAccount.findMany, c.journalEntry.create, c.journalEntry.update, c.journalEntry.updateMany, c.journalEntry.findUnique, c.journalEntry.findUniqueOrThrow, c.chartOfAccount.update]
    .reduce((n, f) => n + f.mock.calls.length, 0)

beforeEach(() => {
  vi.clearAllMocks()
  for (const c of [h.shared, h.own, callerTx]) wire(c)
})

const unpostedEntry = () => ({
  id: 'je1', isPosted: false,
  lines: [
    { accountId: 'a1000', debit: dec('100'), credit: dec('0'),   account: { type: 'ASSET' } },
    { accountId: 'a4000', debit: dec('0'),   credit: dec('100'), account: { type: 'REVENUE' } },
  ],
})

describe('with a caller transaction: everything runs on it, nothing else is touched', () => {
  it('createJournalEntry writes through tx only', async () => {
    await expect(accounting.createJournalEntry({ ...base, lines }, asTx(callerTx))).resolves.toBe('je1')
    expect(callerTx.journalEntry.create).toHaveBeenCalledTimes(1)
    expect(touched(h.shared)).toBe(0)
    expect(h.shared.$transaction).not.toHaveBeenCalled()
  })

  it('postEntry reads and writes through tx only and opens no transaction of its own', async () => {
    callerTx.journalEntry.findUnique.mockResolvedValue(unpostedEntry())
    await accounting.postEntry('je1', 'u1', asTx(callerTx))
    expect(callerTx.journalEntry.updateMany).toHaveBeenCalledTimes(1)
    expect(callerTx.chartOfAccount.update).toHaveBeenCalledTimes(2)
    expect(touched(h.shared)).toBe(0)
    expect(touched(h.own)).toBe(0)
    expect(h.shared.$transaction).not.toHaveBeenCalled()
  })

  it('voidEntry creates and posts the reversal on tx only', async () => {
    // First read = the posted original; the nested postEntry then reads the (unposted) reversal.
    callerTx.journalEntry.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'je1', reference: 'R-1', description: 'orig', isPosted: true,
        lines: [
          { accountId: 'a1000', debit: dec('100'), credit: dec('0'),   description: 'Cash', account: { code: '1000', type: 'ASSET' } },
          { accountId: 'a4000', debit: dec('0'),   credit: dec('100'), description: 'Rev',  account: { code: '4000', type: 'REVENUE' } },
        ],
      })
    callerTx.journalEntry.findUnique.mockResolvedValue(unpostedEntry())
    callerTx.journalEntry.create.mockResolvedValue({ id: 'je2' })

    await expect(accounting.voidEntry('je1', 'u1', 'entered in error', asTx(callerTx))).resolves.toBe('je2')
    const reversal = callerTx.journalEntry.create.mock.calls[0]![0].data
    expect(reversal.reference).toBe('VOID-R-1')
    // debits and credits swapped
    expect(String(reversal.lines.create[0].credit)).toBe('100')
    expect(String(reversal.lines.create[1].debit)).toBe('100')
    expect(touched(h.shared)).toBe(0)
    expect(h.shared.$transaction).not.toHaveBeenCalled()
  })

  it('recordPaymentEntry creates and posts on tx only', async () => {
    callerTx.journalEntry.findUnique.mockResolvedValue(unpostedEntry())
    await accounting.recordPaymentEntry(
      { invoiceId: 'inv-12345678', studentName: 'A B', amount: 100, paymentRef: 'r', actorUid: 'u1' },
      asTx(callerTx),
    )
    expect(callerTx.journalEntry.create).toHaveBeenCalledTimes(1)
    expect(callerTx.journalEntry.updateMany).toHaveBeenCalledTimes(1)
    expect(touched(h.shared)).toBe(0)
    expect(h.shared.$transaction).not.toHaveBeenCalled()
  })

  it('an error inside is thrown to the caller, who decides to roll back', async () => {
    callerTx.journalEntry.findUnique.mockResolvedValue({ ...unpostedEntry(), isPosted: true })
    await expect(accounting.postEntry('je1', 'u1', asTx(callerTx))).rejects.toThrow(/already posted/)
    expect(callerTx.journalEntry.updateMany).not.toHaveBeenCalled()
  })
})

describe('without a caller transaction: one transaction of its own', () => {
  it('postEntry opens exactly one transaction and does all its work inside it', async () => {
    h.own.journalEntry.findUnique.mockResolvedValue(unpostedEntry())
    await accounting.postEntry('je1', 'u1')
    expect(h.shared.$transaction).toHaveBeenCalledTimes(1)
    expect(h.own.journalEntry.updateMany).toHaveBeenCalledTimes(1)
    expect(h.own.chartOfAccount.update).toHaveBeenCalledTimes(2)
    expect(touched(h.shared)).toBe(0) // nothing on the shared client outside the transaction
  })

  it('recordPaymentEntry creates AND posts inside one transaction (no orphan draft)', async () => {
    h.own.journalEntry.findUnique.mockResolvedValue(unpostedEntry())
    await accounting.recordPaymentEntry(
      { invoiceId: 'inv-12345678', studentName: 'A B', amount: 100, paymentRef: 'r', actorUid: 'u1' },
    )
    expect(h.shared.$transaction).toHaveBeenCalledTimes(1)
    expect(h.own.journalEntry.create).toHaveBeenCalledTimes(1)
    expect(h.own.journalEntry.updateMany).toHaveBeenCalledTimes(1)
    expect(touched(h.shared)).toBe(0)
  })

  it('a failure while posting propagates out of the transaction (so the create rolls back with it)', async () => {
    h.own.journalEntry.findUnique.mockResolvedValue(unpostedEntry())
    h.own.chartOfAccount.update.mockRejectedValueOnce(new Error('numeric overflow'))
    await expect(
      accounting.recordPaymentEntry(
        { invoiceId: 'inv-12345678', studentName: 'A B', amount: 100, paymentRef: 'r', actorUid: 'u1' },
      ),
    ).rejects.toThrow(/numeric overflow/)
  })

  it('voidEntry runs the whole reversal inside one transaction', async () => {
    h.own.journalEntry.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'je1', reference: 'R-1', description: 'orig', isPosted: true,
        lines: [
          { accountId: 'a1000', debit: dec('100'), credit: dec('0'),   description: 'Cash', account: { code: '1000', type: 'ASSET' } },
          { accountId: 'a4000', debit: dec('0'),   credit: dec('100'), description: 'Rev',  account: { code: '4000', type: 'REVENUE' } },
        ],
      })
    h.own.journalEntry.findUnique.mockResolvedValue(unpostedEntry())
    h.own.journalEntry.create.mockResolvedValue({ id: 'je2' })
    await expect(accounting.voidEntry('je1', 'u1', 'entered in error')).resolves.toBe('je2')
    expect(h.shared.$transaction).toHaveBeenCalledTimes(1)
    expect(touched(h.shared)).toBe(0)
  })

  it('createJournalEntry alone opens no transaction (one nested create is already atomic)', async () => {
    await accounting.createJournalEntry({ ...base, lines })
    expect(h.shared.$transaction).not.toHaveBeenCalled()
    expect(h.shared.journalEntry.create).toHaveBeenCalledTimes(1)
  })
})

describe('message compatibility', () => {
  it('an already-posted entry is still refused with the same message', async () => {
    h.own.journalEntry.findUnique.mockResolvedValue({ ...unpostedEntry(), isPosted: true })
    await expect(accounting.postEntry('je1', 'u1')).rejects.toThrow('Entry je1 is already posted.')
  })
})
