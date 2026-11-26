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
 * [P1-03] Adds T-03 (concurrent post: exactly one success) and the deadlock and exact-balance tests below.
 *
 * STATUS: written against the schema and harness API by reading them; NOT yet run on a database
 * (the build environment that wrote it cannot reach the Prisma engine download or Postgres).
 * Run it once and record the result in IMPLEMENTATION-LOG.md before treating P1-02 as proven.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createTestDb, integrationEnabled, type TestDb } from './harness'

// Every statement is a network round trip when the database is remote, and several tests make dozens.
vi.setConfig({ testTimeout: 240_000 })

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
  createJournalEntry, postEntry, voidEntry, recordPaymentEntry, LedgerError,
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

describe.skipIf(!integrationEnabled())('accountingService: caller transactions (P1-02) and atomic posting (P1-03)', () => {
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
  // ── P1-03 ────────────────────────────────────────────────────────────────────────────────────

  it('T-03: six simultaneous posts of one draft give exactly ONE success and move the balances once', async () => {
    const ROUNDS = 5
    for (let round = 1; round <= ROUNDS; round++) {
      const id = await createJournalEntry(entry(`ITEST-T03-${round}`, 100))
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, i) => postEntry(id, `user-${i}`)),
      )
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(r.reason).toBeInstanceOf(LedgerError)
          expect(r.reason).toMatchObject({ code: 'ALREADY_POSTED', status: 409 })
        }
      }
    }
    const b = await balances()
    expect(b['1000']).toBe('500.00') // 5 entries x 100, never 600 or 3000
    expect(b['4000']).toBe('500.00')
  })

  it('T-03 (deterministic): a second post WAITS on the first, then loses with ALREADY_POSTED', async () => {
    const id = await createJournalEntry(entry('ITEST-T03-WAIT', 100))
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    let claimed!: () => void
    const firstHasClaimed = new Promise<void>((resolve) => { claimed = resolve })

    // A claims the entry inside a transaction it keeps open.
    const first = db.prisma.$transaction(async (tx) => {
      await postEntry(id, 'user-A', tx)
      claimed()
      await gate
    })
    await firstHasClaimed

    // B starts while A is uncommitted: its read still sees a draft, so only the claim can stop it.
    let secondSettled = false
    const second = postEntry(id, 'user-B').then(
      () => 'won' as const,
      (e: unknown) => e,
    ).finally(() => { secondSettled = true })

    // Wait until the database itself reports a session blocked on a row lock. A fixed sleep proves nothing on a
    // slow link (B might not even have reached its claim yet); this proves B is waiting on A's claim.
    const observer = db.newClient()
    let blocked = 0
    for (let waited = 0; waited < 60_000 && blocked === 0; waited += 250) {
      const rows = await observer.$queryRaw<Array<{ n: number }>>`
        SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname = ${db.database} AND wait_event_type = 'Lock'
      `
      blocked = rows[0]?.n ?? 0
      if (blocked === 0) await new Promise((resolve) => setTimeout(resolve, 250))
    }
    expect(blocked).toBeGreaterThanOrEqual(1) // B is blocked on A's row lock, not racing past it
    expect(secondSettled).toBe(false)

    release()
    await first
    const outcome = await second
    expect(outcome).toBeInstanceOf(LedgerError)
    expect(outcome).toMatchObject({ code: 'ALREADY_POSTED', status: 409 })

    const posted = await db.prisma.journalEntry.findFirstOrThrow({ where: { reference: 'ITEST-T03-WAIT' } })
    expect(posted.postedByUid).toBe('user-A')
    expect((await balances())['1000']).toBe('100.00')
  })

  it('postings that list the same two accounts in opposite orders never deadlock', async () => {
    const reversed = (reference: string, amount: number) => ({
      ...entry(reference, amount),
      lines: [
        { accountCode: '4000', credit: amount, description: 'Revenue' },
        { accountCode: '1000', debit: amount, description: 'Cash' },
      ],
    })
    const WAVES = 4
    const PER_WAVE = 6 // stays within the default connection pool so no run waits for a free connection
    for (let w = 0; w < WAVES; w++) {
      const ids = await Promise.all(
        Array.from({ length: PER_WAVE }, (_, i) =>
          createJournalEntry(i % 2 === 0 ? entry(`ITEST-DL-${w}-${i}`, 10) : reversed(`ITEST-DL-${w}-${i}`, 10))),
      )
      const results = await Promise.allSettled(ids.map((id) => postEntry(id, 'itest-user')))
      const failed = results.filter((r) => r.status === 'rejected')
      expect(failed).toEqual([]) // a deadlock would surface here as a rejected post
    }
    const b = await balances()
    expect(b['1000']).toBe('240.00') // 24 entries x 10
    expect(b['4000']).toBe('240.00')
  })

  it('a one-cent imbalance is refused on a real database and nothing is written', async () => {
    const before = await counts()
    await expect(
      createJournalEntry({
        ...entry('ITEST-UNBAL', 100),
        lines: [
          { accountCode: '1000', debit: 100.01, description: 'Cash' },
          { accountCode: '4000', credit: 100, description: 'Revenue' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'UNBALANCED', status: 422 })
    expect(await counts()).toEqual(before)
  })
})
