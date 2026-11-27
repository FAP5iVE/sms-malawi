/**
 * accountingService.reversal.test.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-04 (A1-F2, A2-F3, UQ-02): a journal entry is
 * reversed at most once. voidEntry claims the original, then creates the mirror with a unique
 * `reversalOfId`, and posts it; a reason is mandatory.
 * [P1-05] The claim is on `status` (POSTED to REVERSED); the mirror is a REVERSAL entry that keeps
 * the original's source and line dimensions.
 *
 * Prisma is mocked: this proves the SHAPE of the writes (the claim's condition, the order, the link).
 * That a second and a concurrent reversal are rejected by a real database is T-04, in
 * `src/server/__integration__/accountingService.itest.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

const h = vi.hoisted(() => {
  const calls: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
    chartOfAccount: { findMany: vi.fn(), update: vi.fn(async () => { calls.push('account.update') }) },
    journalEntry: {
      create: vi.fn(async () => { calls.push('create'); return { id: 'je2' } }),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(async () => { calls.push('claim'); return { count: 1 } }),
    },
  }
  db.$transaction = vi.fn(async (fn: (c: unknown) => unknown) => fn(db))
  return { db, calls }
})
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import * as accounting from '../accountingService'
import { LedgerError } from '../accountingService'

const dec = (v: string | number) => new Decimal(v)
const original = (over: Record<string, unknown> = {}) => ({
  id: 'je1', reference: 'R-1', description: 'orig', status: 'POSTED', isPosted: true, reversedAt: null,
  lines: [
    { accountId: 'a1000', debit: dec('100'), credit: dec('0'),   description: 'Cash', account: { code: '1000', type: 'ASSET' } },
    { accountId: 'a4000', debit: dec('0'),   credit: dec('100'), description: 'Rev',  account: { code: '4000', type: 'REVENUE' } },
  ],
  ...over,
})
const unpostedMirror = () => ({
  id: 'je2', status: 'DRAFT', isPosted: false,
  lines: [
    { accountId: 'a1000', debit: dec('0'),   credit: dec('100'), account: { type: 'ASSET' } },
    { accountId: 'a4000', debit: dec('100'), credit: dec('0'),   account: { type: 'REVENUE' } },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  h.calls.length = 0
  h.db.journalEntry.updateMany.mockImplementation(async () => { h.calls.push('claim'); return { count: 1 } })
  h.db.journalEntry.create.mockImplementation(async () => { h.calls.push('create'); return { id: 'je2' } })
  h.db.chartOfAccount.findMany.mockResolvedValue([{ id: 'a1000', code: '1000' }, { id: 'a4000', code: '4000' }])
  h.db.journalEntry.findUniqueOrThrow.mockResolvedValue(original())
  h.db.journalEntry.findUnique.mockResolvedValue(unpostedMirror())
})

describe('the reason is mandatory', () => {
  it.each([['empty', ''], ['spaces only', '   '], ['undefined', undefined as unknown as string]])(
    'a %s reason is refused before anything is read or written', async (_n, reason) => {
      const err = await accounting.voidEntry('je1', 'u1', reason).catch((e) => e)
      expect(err).toBeInstanceOf(LedgerError)
      expect(err).toMatchObject({ code: 'REASON_REQUIRED', status: 422 })
      expect(h.db.$transaction).not.toHaveBeenCalled()
      expect(h.db.journalEntry.updateMany).not.toHaveBeenCalled()
    })

  it('a reason over 500 characters is refused', async () => {
    await expect(accounting.voidEntry('je1', 'u1', 'x'.repeat(501))).rejects.toMatchObject({ code: 'REASON_REQUIRED' })
  })
})

describe('the claim (A1-F2)', () => {
  it('claims the original with ONE conditional write and stores who, when and why', async () => {
    await accounting.voidEntry('je1', 'u9', '  duplicate receipt  ')
    expect(h.db.journalEntry.updateMany).toHaveBeenCalledTimes(2) // 1 = the reversal claim, 2 = posting the mirror
    const first = h.db.journalEntry.updateMany.mock.calls[0]![0]
    expect(first.where).toEqual({ id: 'je1', status: 'POSTED' })
    expect(first.data).toMatchObject({ status: 'REVERSED', reversedByUid: 'u9', reversalReason: 'duplicate receipt' })
    // The claim writes nothing but the reversal fields: the database refuses any other change to a posted entry.
    expect(Object.keys(first.data).sort()).toEqual(['reversalReason', 'reversedAt', 'reversedByUid', 'status'])
    expect(first.data.reversedAt).toBeInstanceOf(Date)
  })

  it('the claim comes BEFORE the mirror is created', async () => {
    await accounting.voidEntry('je1', 'u1', 'why')
    expect(h.calls.slice(0, 2)).toEqual(['claim', 'create'])
  })

  it('the mirror is created with reversalOfId pointing at the original', async () => {
    await accounting.voidEntry('je1', 'u1', 'why')
    const data = h.db.journalEntry.create.mock.calls[0]![0].data
    expect(data.reversalOfId).toBe('je1')
    expect(data.reference).toBe('VOID-R-1')
    expect(data).toMatchObject({ status: 'DRAFT', isPosted: false, entryKind: 'REVERSAL', createdByUid: 'u1' })
  })

  it('the mirror keeps the source document and every line dimension, and numbers its lines (P1-05)', async () => {
    const dims = {
      memo: 'm', financialAccountId: 'fa1', partyType: 'STUDENT', partyId: 's1', budgetId: 'b1', departmentId: 'd1',
    }
    const base = original()
    h.db.journalEntry.findUniqueOrThrow.mockResolvedValue({
      ...base, sourceType: 'INVOICE', sourceId: 'inv1', lines: base.lines.map((l) => ({ ...l, ...dims })),
    })
    await accounting.voidEntry('je1', 'u1', 'why')
    const data = h.db.journalEntry.create.mock.calls[0]![0].data
    expect(data).toMatchObject({ sourceType: 'INVOICE', sourceId: 'inv1' })
    expect(data.lines.create).toHaveLength(2)
    expect(data.lines.create[0]).toMatchObject({ ...dims, lineNumber: 1 })
    expect(data.lines.create[1]).toMatchObject({ ...dims, lineNumber: 2 })
  })

  it('the loser of a race (claim count 0) gets ALREADY_REVERSED 409 and creates nothing', async () => {
    h.db.journalEntry.updateMany.mockImplementation(async () => { h.calls.push('claim'); return { count: 0 } })
    const err = await accounting.voidEntry('je1', 'u1', 'why').catch((e) => e)
    expect(err).toBeInstanceOf(LedgerError)
    expect(err).toMatchObject({ code: 'ALREADY_REVERSED', status: 409 })
    expect(h.db.journalEntry.create).not.toHaveBeenCalled()
    expect(h.db.chartOfAccount.update).not.toHaveBeenCalled()
  })

  it('an original already marked reversed is refused without attempting a claim', async () => {
    h.db.journalEntry.findUniqueOrThrow.mockResolvedValue(original({ status: 'REVERSED', reversedAt: new Date() }))
    await expect(accounting.voidEntry('je1', 'u1', 'why')).rejects.toMatchObject({ code: 'ALREADY_REVERSED', status: 409 })
    expect(h.db.journalEntry.updateMany).not.toHaveBeenCalled()
  })

  it('the unique index is the second guard: a duplicate reversalOfId (P2002) is the same conflict', async () => {
    h.db.journalEntry.create.mockRejectedValue(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))
    await expect(accounting.voidEntry('je1', 'u1', 'why')).rejects.toMatchObject({ code: 'ALREADY_REVERSED', status: 409 })
  })

  it('an unposted entry cannot be reversed (same message as before)', async () => {
    h.db.journalEntry.findUniqueOrThrow.mockResolvedValue(original({ status: 'DRAFT', isPosted: false }))
    await expect(accounting.voidEntry('je1', 'u1', 'why')).rejects.toMatchObject({
      code: 'NOT_POSTED', status: 409, message: 'Cannot void an unposted entry.',
    })
    expect(h.db.journalEntry.updateMany).not.toHaveBeenCalled()
  })

  it('a stored entry that is one cent out is refused BEFORE the claim', async () => {
    h.db.journalEntry.findUniqueOrThrow.mockResolvedValue(original({
      lines: [
        { accountId: 'a1000', debit: dec('100.01'), credit: dec('0'),   description: 'Cash', account: { code: '1000', type: 'ASSET' } },
        { accountId: 'a4000', debit: dec('0'),      credit: dec('100'), description: 'Rev',  account: { code: '4000', type: 'REVENUE' } },
      ],
    }))
    await expect(accounting.voidEntry('je1', 'u1', 'why')).rejects.toMatchObject({ code: 'UNBALANCED', status: 422 })
    expect(h.db.journalEntry.updateMany).not.toHaveBeenCalled()
  })

  it('a reversal can itself be reversed once (each posted entry at most once, INV-07), and only once', async () => {
    h.db.journalEntry.findUniqueOrThrow.mockResolvedValue(original({ id: 'je2', reference: 'VOID-R-1', reversalOfId: 'je1' }))
    await expect(accounting.voidEntry('je2', 'u1', 'restore')).resolves.toBe('je2')
    expect(h.db.journalEntry.updateMany.mock.calls[0]![0].where).toEqual({ id: 'je2', status: 'POSTED' })
  })
})
