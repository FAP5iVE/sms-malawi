/**
 * accountingService.money.test.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-01: accountingService does its arithmetic
 * with `@/lib/money` (exact Decimal). Prisma is mocked, so this proves the amounts and deltas handed
 * to Prisma, not atomicity (P1-02/P1-03 cover that against a real database).
 *
 * [P1-03] The 0.01 balancing tolerance is gone: the test that pinned it now pins the opposite
 * (a one-cent imbalance is rejected). postEntry claims the entry and moves balances once per account.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

const h = vi.hoisted(() => {
  // [P1-02] postEntry/voidEntry now open an interactive transaction: the callback gets a client.
  // The mock hands back the same mock client, so the assertions below see every write.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    chartOfAccount: { findMany: vi.fn(), update: vi.fn((a: unknown) => a) },
    journalEntry:   { create: vi.fn(), update: vi.fn((a: unknown) => a), updateMany: vi.fn(() => ({ count: 1 })), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    journalLine:    { findMany: vi.fn() },
  }
  prisma.$transaction = vi.fn(async (fn: (db: unknown) => unknown) => fn(prisma))
  return { prisma }
})
vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import * as accounting from '../accountingService'

const dec = (v: string | number) => new Decimal(v)
const accounts = [{ id: 'a1000', code: '1000' }, { id: 'a4000', code: '4000' }]
const base = { reference: 'T-1', description: 'test', entryDate: new Date('2026-11-01'), actorUid: 'u1' }

beforeEach(() => {
  vi.clearAllMocks()
  h.prisma.chartOfAccount.findMany.mockResolvedValue(accounts)
  h.prisma.journalEntry.create.mockResolvedValue({ id: 'je1' })
})

describe('createJournalEntry', () => {
  it('stores each line rounded half-up to the cent, as Decimals', async () => {
    await accounting.createJournalEntry({
      ...base,
      lines: [
        { accountCode: '1000', debit: 1.005 },
        { accountCode: '4000', credit: 1.005 },
      ],
    })
    const lines = h.prisma.journalEntry.create.mock.calls[0]![0].data.lines.create
    expect(String(lines[0].debit)).toBe('1.01')
    expect(String(lines[1].credit)).toBe('1.01')
    expect(String(lines[0].credit)).toBe('0')
  })

  it('0.1 + 0.2 against 0.3 balances (a float comparison would not)', async () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    await expect(
      accounting.createJournalEntry({
        ...base,
        lines: [
          { accountCode: '1000', debit: 0.1 },
          { accountCode: '1000', debit: 0.2 },
          { accountCode: '4000', credit: 0.3 },
        ],
      }),
    ).resolves.toBe('je1')
  })

  it('a 0.05 imbalance is rejected', async () => {
    await expect(
      accounting.createJournalEntry({
        ...base,
        lines: [{ accountCode: '1000', debit: 100.05 }, { accountCode: '4000', credit: 100 }],
      }),
    ).rejects.toThrow(/unbalanced/)
  })

  it('a one-cent imbalance is now REJECTED (the 0.01 tolerance was removed in P1-03)', async () => {
    await expect(
      accounting.createJournalEntry({
        ...base,
        lines: [{ accountCode: '1000', debit: 100.01 }, { accountCode: '4000', credit: 100 }],
      }),
    ).rejects.toThrow(/unbalanced/)
    expect(h.prisma.journalEntry.create).not.toHaveBeenCalled()
  })
})

describe('postEntry', () => {
  it('moves each balance by an exact Decimal delta, by the account type (one write per account)', async () => {
    h.prisma.journalEntry.findUnique.mockResolvedValue({
      id: 'je1', status: 'DRAFT', isPosted: false,
      lines: [
        { accountId: 'a1000', debit: dec('0.10'), credit: dec('0'),    account: { type: 'ASSET' } },
        { accountId: 'a1000', debit: dec('0.20'), credit: dec('0'),    account: { type: 'ASSET' } },
        { accountId: 'a4000', debit: dec('0'),    credit: dec('0.30'), account: { type: 'REVENUE' } },
      ],
    })
    await accounting.postEntry('je1', 'u1')
    type BalanceUpdate = { where: { id: string }; data: { balance: { increment: Decimal } } }
    // `h.prisma` is deliberately `any` (a mock), so the callback parameter and the result are typed here.
    const updates: BalanceUpdate[] = h.prisma.chartOfAccount.update.mock.calls.map(
      (c: unknown[]) => c[0] as BalanceUpdate,
    )
    // 0.10 + 0.20 on the same account is ONE exact increment of 0.3 (P1-03), not two writes.
    expect(updates.map((u) => [u.where.id, String(u.data.balance.increment)])).toEqual([
      ['a1000', '0.3'],
      ['a4000', '0.3'],
    ])
  })

  it('refuses an entry that is already posted', async () => {
    h.prisma.journalEntry.findUnique.mockResolvedValue({ id: 'je1', status: 'POSTED', isPosted: true, lines: [] })
    await expect(accounting.postEntry('je1', 'u1')).rejects.toThrow(/already posted/)
  })
})

describe('reports', () => {
  it('getTrialBalance totals are exact', async () => {
    h.prisma.chartOfAccount.findMany.mockResolvedValue([
      { code: '1000', name: 'Cash', type: 'ASSET', lines: [
        { debit: dec('0.1'), credit: dec('0') }, { debit: dec('0.2'), credit: dec('0') },
      ] },
    ])
    const tb = await accounting.getTrialBalance()
    expect(tb).toEqual([{ code: '1000', name: 'Cash', type: 'ASSET', debit: 0.3, credit: 0 }])
  })

  it('getIncomeStatement nets revenue and expense exactly', async () => {
    h.prisma.journalLine.findMany.mockResolvedValue([
      { account: { code: '4000', name: 'Tuition', type: 'REVENUE' }, debit: dec('0'), credit: dec('0.3') },
      { account: { code: '5100', name: 'Utilities', type: 'EXPENSE' }, debit: dec('0.1'), credit: dec('0') },
      { account: { code: '5100', name: 'Utilities', type: 'EXPENSE' }, debit: dec('0.2'), credit: dec('0') },
    ])
    const is = await accounting.getIncomeStatement(new Date('2026-01-01'), new Date('2026-12-31'))
    expect(is.totalRevenue).toBe(0.3)
    expect(is.totalExpenses).toBe(0.3)
    expect(is.netSurplus).toBe(0)
    expect(is.expenseLines).toEqual([{ account: 'Utilities', code: '5100', amount: 0.3 }])
  })

  it('getAccountLedger keeps an exact running balance', async () => {
    h.prisma.chartOfAccount.findUniqueOrThrow = vi.fn().mockResolvedValue({ id: 'a1000', type: 'ASSET' })
    h.prisma.journalLine.findMany.mockResolvedValue([
      { debit: dec('0.1'), credit: dec('0'), description: null, journalEntry: { entryDate: new Date(), reference: 'R1', description: 'd' } },
      { debit: dec('0.2'), credit: dec('0'), description: null, journalEntry: { entryDate: new Date(), reference: 'R2', description: 'd' } },
    ])
    const ledger = await accounting.getAccountLedger('1000')
    expect(ledger.map((l) => l.balance)).toEqual([0.1, 0.3])
  })
})
