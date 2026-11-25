/**
 * accountingService.post.test.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-03 (A1-F1, A2-F2, X-10): posting is an atomic
 * claim, balancing is exact, and balances move once per account in ascending id.
 *
 * Prisma is mocked, so this proves the SHAPE of the writes (what is claimed, in which order, with
 * what condition). That two real concurrent posts yield exactly one winner is T-03, the real-Postgres
 * test in `src/server/__integration__/accountingService.itest.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

const h = vi.hoisted(() => {
  const calls: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = {
    chartOfAccount: {
      findMany: vi.fn(),
      update: vi.fn(async () => { calls.push('account.update') }),
    },
    journalEntry: {
      create: vi.fn(),
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
const line = (accountId: string, type: string, debit: string, credit: string) =>
  ({ accountId, debit: dec(debit), credit: dec(credit), account: { type } })
const draft = (lines: ReturnType<typeof line>[]) => ({ id: 'je1', isPosted: false, lines })
const balanced = () => draft([line('a-1000', 'ASSET', '100', '0'), line('a-4000', 'REVENUE', '0', '100')])

const updatedIds = () =>
  h.db.chartOfAccount.update.mock.calls.map((c: unknown[]) => (c[0] as { where: { id: string } }).where.id)

beforeEach(() => {
  vi.clearAllMocks()
  h.calls.length = 0
  h.db.journalEntry.updateMany.mockImplementation(async () => { h.calls.push('claim'); return { count: 1 } })
  h.db.chartOfAccount.findMany.mockResolvedValue([{ id: 'a-1000', code: '1000' }, { id: 'a-4000', code: '4000' }])
  h.db.journalEntry.create.mockResolvedValue({ id: 'je1' })
})

describe('the claim (A1-F1, A2-F2)', () => {
  it('claims with ONE conditional write: where id AND not yet posted', async () => {
    h.db.journalEntry.findUnique.mockResolvedValue(balanced())
    await accounting.postEntry('je1', 'u1')
    expect(h.db.journalEntry.updateMany).toHaveBeenCalledTimes(1)
    const arg = h.db.journalEntry.updateMany.mock.calls[0]![0]
    expect(arg.where).toEqual({ id: 'je1', isPosted: false })
    expect(arg.data).toMatchObject({ isPosted: true, postedByUid: 'u1' })
  })

  it('the loser of a race (claim count 0) gets ALREADY_POSTED 409 and moves NO balance', async () => {
    h.db.journalEntry.findUnique.mockResolvedValue(balanced())
    h.db.journalEntry.updateMany.mockResolvedValue({ count: 0 }) // someone else claimed it first
    const err = await accounting.postEntry('je1', 'u1').catch((e) => e)
    expect(err).toBeInstanceOf(LedgerError)
    expect(err).toMatchObject({ code: 'ALREADY_POSTED', status: 409, message: 'Entry je1 is already posted.' })
    expect(h.db.chartOfAccount.update).not.toHaveBeenCalled()
  })

  it('the claim comes BEFORE every balance update', async () => {
    h.db.journalEntry.findUnique.mockResolvedValue(balanced())
    await accounting.postEntry('je1', 'u1')
    expect(h.calls).toEqual(['claim', 'account.update', 'account.update'])
  })

  it('an entry already marked posted when read is refused without attempting a claim', async () => {
    h.db.journalEntry.findUnique.mockResolvedValue({ ...balanced(), isPosted: true })
    await expect(accounting.postEntry('je1', 'u1')).rejects.toMatchObject({ code: 'ALREADY_POSTED', status: 409 })
    expect(h.db.journalEntry.updateMany).not.toHaveBeenCalled()
  })

  it('an unknown entry is NOT_FOUND 404, not a generic failure', async () => {
    h.db.journalEntry.findUnique.mockResolvedValue(null)
    await expect(accounting.postEntry('nope', 'u1')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(h.db.journalEntry.updateMany).not.toHaveBeenCalled()
  })
})

describe('exact balancing (X-10)', () => {
  it('createJournalEntry rejects a ONE-CENT imbalance with UNBALANCED 422 and writes nothing', async () => {
    const err = await accounting.createJournalEntry({
      reference: 'T', description: 't', entryDate: new Date('2026-11-01'), actorUid: 'u1',
      lines: [{ accountCode: '1000', debit: 100.01 }, { accountCode: '4000', credit: 100 }],
    }).catch((e) => e)
    expect(err).toBeInstanceOf(LedgerError)
    expect(err).toMatchObject({ code: 'UNBALANCED', status: 422 })
    expect(h.db.journalEntry.create).not.toHaveBeenCalled()
  })

  it('amounts are rounded to the cent first, so 100.004 against 100 is balanced', async () => {
    await expect(accounting.createJournalEntry({
      reference: 'T', description: 't', entryDate: new Date('2026-11-01'), actorUid: 'u1',
      lines: [{ accountCode: '1000', debit: 100.004 }, { accountCode: '4000', credit: 100 }],
    })).resolves.toBe('je1')
  })

  it('postEntry refuses a stored draft that is one cent out (written under the old tolerance), BEFORE claiming', async () => {
    h.db.journalEntry.findUnique.mockResolvedValue(
      draft([line('a-1000', 'ASSET', '100.01', '0'), line('a-4000', 'REVENUE', '0', '100')]),
    )
    await expect(accounting.postEntry('je1', 'u1')).rejects.toMatchObject({ code: 'UNBALANCED', status: 422 })
    expect(h.db.journalEntry.updateMany).not.toHaveBeenCalled()
    expect(h.db.chartOfAccount.update).not.toHaveBeenCalled()
  })

  it('voidEntry still works: the mirror image of a balanced entry is exactly balanced', async () => {
    h.db.journalEntry.findUniqueOrThrow.mockResolvedValue({
      id: 'je1', reference: 'R', description: 'orig', isPosted: true,
      lines: [
        { accountId: 'a-1000', debit: dec('33.33'), credit: dec('0'),     description: 'c', account: { code: '1000', type: 'ASSET' } },
        { accountId: 'a-4000', debit: dec('0'),     credit: dec('33.33'), description: 'r', account: { code: '4000', type: 'REVENUE' } },
      ],
    })
    h.db.journalEntry.findUnique.mockResolvedValue(balanced())
    h.db.journalEntry.create.mockResolvedValue({ id: 'je2' })
    await expect(accounting.voidEntry('je1', 'u1')).resolves.toBe('je2')
  })
})

describe('balance updates (deadlock-free, exact)', () => {
  it('accounts are updated in ASCENDING id whatever the line order', async () => {
    h.db.journalEntry.findUnique.mockResolvedValue(draft([
      line('a-5000', 'EXPENSE', '10', '0'),
      line('a-1000', 'ASSET', '0', '4'),
      line('a-4000', 'REVENUE', '0', '6'),
    ]))
    await accounting.postEntry('je1', 'u1')
    expect(updatedIds()).toEqual(['a-1000', 'a-4000', 'a-5000'])
  })

  it('two postings that touch the same accounts lock them in the same order', async () => {
    const orders: string[][] = []
    for (const lines of [
      [line('a-4000', 'REVENUE', '0', '5'), line('a-1000', 'ASSET', '5', '0')],
      [line('a-1000', 'ASSET', '7', '0'), line('a-4000', 'REVENUE', '0', '7')],
    ]) {
      h.db.chartOfAccount.update.mockClear()
      h.db.journalEntry.findUnique.mockResolvedValue(draft(lines))
      await accounting.postEntry('je1', 'u1')
      orders.push(updatedIds())
    }
    expect(orders[0]).toEqual(orders[1])
  })

  it('several lines on one account become ONE write with the exact net delta', async () => {
    h.db.journalEntry.findUnique.mockResolvedValue(draft([
      line('a-1000', 'ASSET', '0.10', '0'),
      line('a-1000', 'ASSET', '0.20', '0'),
      line('a-1000', 'ASSET', '0', '0.05'),
      line('a-4000', 'REVENUE', '0', '0.25'),
    ]))
    await accounting.postEntry('je1', 'u1')
    const writes = h.db.chartOfAccount.update.mock.calls.map(
      (c: unknown[]) => c[0] as { where: { id: string }; data: { balance: { increment: Decimal } } },
    )
    expect(writes.map((w: { where: { id: string }; data: { balance: { increment: Decimal } } }) => [w.where.id, String(w.data.balance.increment)])).toEqual([
      ['a-1000', '0.25'],
      ['a-4000', '0.25'],
    ])
  })

  it('credits raise liability and revenue balances, lower an asset; a debit raises an expense', async () => {
    h.db.journalEntry.findUnique.mockResolvedValue(draft([
      line('a-1000', 'ASSET', '0', '30'),
      line('a-2000', 'LIABILITY', '0', '20'),
      line('a-4000', 'REVENUE', '0', '10'),
      line('a-5000', 'EXPENSE', '60', '0'),
    ]))
    await accounting.postEntry('je1', 'u1')
    const byId = Object.fromEntries(h.db.chartOfAccount.update.mock.calls.map(
      (c: unknown[]) => { const a = c[0] as { where: { id: string }; data: { balance: { increment: Decimal } } }; return [a.where.id, String(a.data.balance.increment)] },
    ))
    expect(byId).toEqual({ 'a-1000': '-30', 'a-2000': '20', 'a-4000': '10', 'a-5000': '60' })
  })
})
