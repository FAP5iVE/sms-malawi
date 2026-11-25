/**
 * accountingService.itest.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-02 (C-11, root cause of A1-F3).
 *
 * Proves on a REAL Postgres what the mocked unit tests (accountingService.tx.test.ts) cannot:
 * a ledger entry written through a caller's transaction commits and rolls back WITH that
 * transaction, together with the caller's own business write.
 *
 * [RUN]  TEST_DATABASE_URL=postgresql://… pnpm --filter web test:integration
 *        Skips when TEST_DATABASE_URL is unset. Each run builds and drops its own database (see
 *        harness.ts), so pointing it at a Neon branch of production is safe.
 *
 * The service imports the app's global Prisma client (bound to DATABASE_URL). This test replaces it
 * with a stand-in that points at the throwaway database, and that THROWS when no test database is
 * attached, so the test can never reach the real application database.
 *
 * STATUS: written against the schema and harness API by reading them; NOT yet run on a database
 * (the build environment that wrote it cannot reach the Prisma engine download or Postgres).
 * Run it once and record the result in IMPLEMENTATION-LOG.md before treating P1-02 as proven.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createTestDb, integrationEnabled, type TestDb } from './harness'

const holder = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }))

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, {
    get(_target, prop) {
      if (!holder.current) {
        throw new Error('accountingService used the global Prisma client outside a test database.')
      }
      const value = holder.current[prop as string]
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(holder.current) : value
    },
  }),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
  createJournalEntry, postEntry, voidEntry, recordPaymentEntry,
} from '../services/accountingService'

class Rollback extends Error {
  constructor() {
    super('rollback on purpose')
    this.name = 'Rollback'
  }
}

const entry = (reference: string, amount: number) => ({
  reference,
  description: `itest ${reference}`,
  entryDate: new Date('2026-11-25'),
  actorUid: 'itest-user',
  lines: [
    { accountCode: '1000', debit: amount, description: 'Cash' },
    { accountCode: '4000', credit: amount, description: 'Revenue' },
  ],
})

describe.skipIf(!integrationEnabled())('accountingService: caller transactions (P1-02)', () => {
  let db: TestDb

  const balances = async (): Promise<Record<string, string>> => {
    const rows = await db.prisma.chartOfAccount.findMany({ orderBy: { code: 'asc' } })
    return Object.fromEntries(rows.map((r) => [r.code, r.balance.toFixed(2)]))
  }
  const counts = async () => ({
    entries: await db.prisma.journalEntry.count(),
    lines: await db.prisma.journalLine.count(),
  })

  beforeAll(async () => {
    db = await createTestDb()
    await db.seed()
    holder.current = db.prisma as unknown as Record<string, unknown>
  })

  afterAll(async () => {
    holder.current = null
    await db.teardown()
  })

  // Each test starts from an empty ledger with every balance at zero.
  beforeEach(async () => {
    await db.prisma.journalLine.deleteMany()
    await db.prisma.journalEntry.deleteMany()
    await db.prisma.chartOfAccount.updateMany({ data: { balance: 0 } })
    await db.prisma.systemSettings.deleteMany({ where: { key: { startsWith: 'itest.biz.' } } })
  })

  it('create + post inside a caller transaction commit with it and move the balances once', async () => {
    await db.prisma.$transaction(async (tx) => {
      const id = await createJournalEntry(entry('ITEST-COMMIT', 100), tx)
      await postEntry(id, 'itest-user', tx)
    })

    const posted = await db.prisma.journalEntry.findFirstOrThrow({ where: { reference: 'ITEST-COMMIT' } })
    expect(posted.isPosted).toBe(true)
    expect(posted.postedByUid).toBe('itest-user')
    const b = await balances()
    expect(b['1000']).toBe('100.00') // asset, debit normal
    expect(b['4000']).toBe('100.00') // revenue, credit normal
  })

  it('a rollback undoes the ledger entry AND the caller’s own business write together', async () => {
    const before = await counts()
    const balancesBefore = await balances()

    await expect(
      db.prisma.$transaction(async (tx) => {
        await tx.systemSettings.create({ data: { key: 'itest.biz.write', value: 1, category: 'system' } })
        const id = await createJournalEntry(entry('ITEST-ROLLBACK', 250), tx)
        await postEntry(id, 'itest-user', tx)
        throw new Rollback()
      }),
    ).rejects.toThrow(Rollback)

    expect(await counts()).toEqual(before)                  // no entry, no lines
    expect(await balances()).toEqual(balancesBefore)        // no balance moved
    expect(await db.prisma.systemSettings.count({ where: { key: 'itest.biz.write' } })).toBe(0)
  })

  it('the entry is invisible to other connections until the caller commits', async () => {
    const before = await counts()
    let seenInsideByOthers = -1

    await db.prisma.$transaction(async (tx) => {
      const id = await createJournalEntry(entry('ITEST-ISOLATION', 40), tx)
      await postEntry(id, 'itest-user', tx)
      // A different connection (the shared client, outside tx) must not see the uncommitted entry.
      seenInsideByOthers = await db.newClient().journalEntry.count()
    })

    expect(seenInsideByOthers).toBe(before.entries)
    expect((await counts()).entries).toBe(before.entries + 1)
  })

  it('voidEntry inside a caller transaction rolls back with it', async () => {
    // A posted original, committed on its own.
    const originalId = await createJournalEntry(entry('ITEST-ORIG', 100))
    await postEntry(originalId, 'itest-user')
    const posted = await balances()
    const before = await counts()

    await expect(
      db.prisma.$transaction(async (tx) => {
        await voidEntry(originalId, 'itest-user', tx)
        throw new Rollback()
      }),
    ).rejects.toThrow(Rollback)

    expect(await counts()).toEqual(before)
    expect(await db.prisma.journalEntry.count({ where: { reference: 'VOID-ITEST-ORIG' } })).toBe(0)
    expect(await balances()).toEqual(posted)
  })

  it('voidEntry inside a committed caller transaction posts the reversal and zeroes the balances', async () => {
    const originalId = await createJournalEntry(entry('ITEST-ORIG2', 100))
    await postEntry(originalId, 'itest-user')

    await db.prisma.$transaction(async (tx) => {
      await voidEntry(originalId, 'itest-user', tx)
    })

    const reversal = await db.prisma.journalEntry.findFirstOrThrow({ where: { reference: 'VOID-ITEST-ORIG2' } })
    expect(reversal.isPosted).toBe(true)
    const b = await balances()
    expect(b['1000']).toBe('0.00')
    expect(b['4000']).toBe('0.00')
  })

  it('WITHOUT a caller transaction, create + post still commit together', async () => {
    await recordPaymentEntry({
      invoiceId: 'inv-itest-0001', studentName: 'Test Student', amount: 75, paymentRef: 'r-1', actorUid: 'itest-user',
    })
    const e = await db.prisma.journalEntry.findFirstOrThrow({ where: { reference: 'PAY-EST-0001' } })  // PAY- + last 8 chars of the invoice id, uppercased
    expect(e.isPosted).toBe(true)
    expect((await balances())['1000']).toBe('75.00')
  })

  it('WITHOUT a caller transaction, a failure while posting leaves no orphan draft (LG-03)', async () => {
    // Decimal(14,2) holds at most 999,999,999,999.99, so adding to this balance overflows when the
    // account is updated, which is AFTER the entry and its lines were created inside the transaction.
    await db.prisma.chartOfAccount.update({ where: { code: '1000' }, data: { balance: '999999999999.99' } })
    const before = await counts()

    await expect(
      recordPaymentEntry({
        invoiceId: 'inv-itest-overflow', studentName: 'Test Student', amount: 500, paymentRef: 'r-2', actorUid: 'itest-user',
      }),
    ).rejects.toThrow()

    expect(await counts()).toEqual(before)                                  // the draft was rolled back too
    const cash = await db.prisma.chartOfAccount.findUniqueOrThrow({ where: { code: '1000' } })
    expect(cash.balance.toFixed(2)).toBe('999999999999.99')                 // untouched
    expect((await balances())['4000']).toBe('0.00')
  })
})
