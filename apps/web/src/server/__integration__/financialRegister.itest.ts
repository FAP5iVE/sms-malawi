/**
 * financialRegister.itest.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-06 (T-02; D-08, D-09, C-02, X-12).
 *
 * On a REAL Postgres: a payment, its register row, its journal entry and the balances are one unit; the same
 * request sent twice records one payment and answers the same way; and the database enforces the register rules
 * (UQ-04, UQ-05 numbering, CHK-17, TRG-06).
 *
 * [RUN]  TEST_DATABASE_URL=postgresql://… pnpm --filter web test:integration
 *        Skips when TEST_DATABASE_URL is unset. Each run builds and drops its own database (see harness.ts).
 *
 * The app's global Prisma client is replaced by a stand-in bound to the throwaway database; it THROWS when no test
 * database is attached. Services outside the money transaction (receipt PDF, search index, settings) are mocked.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { createTestDb, integrationEnabled, type TestDb } from './harness'

vi.setConfig({ testTimeout: 240_000 })

const holder = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }))

vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, {
    get(_target, prop) {
      if (!holder.current) {
        throw new Error('A service used the global Prisma client outside a test database.')
      }
      const value = holder.current[prop as string]
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(holder.current) : value
    },
  }),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/server/services/settingsService', () => ({ isFinanceV2: vi.fn(async () => false), get: vi.fn(async () => 'RCT') }))
vi.mock('@/server/services/receiptService', () => ({ generateReceipt: vi.fn(async () => 'receipt-key') }))
vi.mock('@/server/services/algoliaService', () => ({ updateInvoice: vi.fn() }))
vi.mock('@/server/services/studentService', () => ({ resolveStudentFromUid: vi.fn() }))
vi.mock('@/server/services/notificationService', () => ({ getSchoolBranding: vi.fn(async () => ({})) }))
vi.mock('@/server/services/invoiceNumberService', () => ({ withInvoiceNumber: vi.fn() }))

import { recordPayment } from '../services/feeService'
import { recordAndPost, reverseAndPost, record, type RegisterEvent } from '../services/financialRegisterService'
import { runFinancialTransaction, FinancialError, type IdempotencyContext } from '../lib/financialUnitOfWork'

const ACTOR = 'itest-finance'

describe.skipIf(!integrationEnabled())('financial register and idempotency (P1-06)', () => {
  let db: TestDb
  let studentNo = 0

  /** A new student with one unpaid MWK 1,000 invoice. */
  async function newInvoice() {
    studentNo += 1
    const student = await db.prisma.student.create({
      data: {
        registrationNo: `ITEST-${studentNo}`, firstName: 'Test', lastName: `Student${studentNo}`,
        dateOfBirth: new Date('2010-01-01'), sex: 'FEMALE', district: 'Blantyre',
        guardianName: 'G', guardianPhone: '0990000000', guardianRelation: 'Parent',
      },
    })
    const invoice = await db.prisma.invoice.create({
      data: {
        invoiceNumber: `INV-ITEST-${studentNo}`, studentId: student.id, academicYear: '2026/2027', term: 1,
        subtotal: 1000, totalAmount: 1000, balance: 1000, dueDate: new Date('2027-01-31'),
        lineItems: { create: [{ feeName: 'Tuition', amount: 1000, balance: 1000 }] },
      },
      include: { lineItems: true },
    })
    return invoice
  }

  const input = (invoice: { id: string; lineItems: { id: string }[] }, amount: number) => ({
    invoiceId: invoice.id,
    amount,
    method: 'CASH' as const,
    allocations: [{ lineItemId: invoice.lineItems[0]!.id, amount }],
    confirmOverpayment: false,
  })

  const key = (name: string, requestHash = name): IdempotencyContext => ({
    scope: 'payment.record', key: `itest-key-${name}`, requestHash,
  })

  const balanceOf = async (code: string) =>
    (await db.prisma.chartOfAccount.findUniqueOrThrow({ where: { code } })).balance.toFixed(2)

  const event = (over: Partial<RegisterEvent> = {}): RegisterEvent => ({
    type: 'STUDENT_PAYMENT', sourceType: 'PAYMENT', sourceId: 'itest-src', eventKey: 'RECEIPT', direction: 'IN',
    amount: 50, occurredAt: new Date('2026-11-27T09:00:00Z'), actorUid: ACTOR, ...over,
  })
  const plan = {
    reference: 'ITEST-REG', description: 'itest',
    lines: [{ accountCode: '1000', debit: 50 }, { accountCode: '4000', credit: 50 }],
  }

  beforeAll(async () => {
    db = await createTestDb()
    await db.seed()
    holder.current = db.prisma as unknown as Record<string, unknown>
  })

  afterAll(async () => {
    holder.current = null
    await db.teardown()
  })

  beforeEach(async () => {
    await db.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "journal_lines", "journal_entries", "financial_transactions", "idempotency_records", "financial_evidence"',
    )
    await db.prisma.chartOfAccount.updateMany({ data: { balance: 0 } })
  })

  it('one payment makes one posted register row and one balanced entry, linked both ways', async () => {
    const invoice = await newInvoice()
    const { payment } = await recordPayment(input(invoice, 400), ACTOR, 'finance')

    const rows = await db.prisma.financialTransaction.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ sourceType: 'PAYMENT', sourceId: payment.id, eventKey: 'RECEIPT', status: 'POSTED' })
    expect(rows[0]!.amount.toFixed(2)).toBe('400.00')
    expect(rows[0]!.transactionNumber).toMatch(/^TXN-\d{4}-000001$/)

    const entry = await db.prisma.journalEntry.findUniqueOrThrow({
      where: { id: rows[0]!.journalEntryId! }, include: { lines: true },
    })
    expect(entry).toMatchObject({ status: 'POSTED', financialTransactionId: rows[0]!.id, sourceType: 'PAYMENT', sourceId: payment.id })
    expect(entry.lines).toHaveLength(2)
    expect(await balanceOf('1000')).toBe('400.00')
    expect(await balanceOf('4000')).toBe('400.00')
  })

  it('a posting failure cancels the whole payment (nothing is left behind)', async () => {
    const invoice = await newInvoice()
    await db.prisma.chartOfAccount.update({ where: { code: '4000' }, data: { code: '4000-off' } })
    try {
      await expect(
        recordPayment(input(invoice, 400), ACTOR, 'finance', { idempotency: key('rollback') }),
      ).rejects.toThrow(/Unknown account codes/)
    } finally {
      await db.prisma.chartOfAccount.update({ where: { code: '4000-off' }, data: { code: '4000' } })
    }
    expect(await db.prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(0)
    expect((await db.prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).balance.toFixed(2)).toBe('1000.00')
    expect(await db.prisma.financialTransaction.count()).toBe(0)
    expect(await db.prisma.journalEntry.count()).toBe(0)
    expect(await db.prisma.idempotencyRecord.count()).toBe(0)

    // The same key works once the cause is fixed.
    await recordPayment(input(invoice, 400), ACTOR, 'finance', { idempotency: key('rollback') })
    expect(await db.prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(1)
  })

  it('T-02: the same key sent again records nothing and replays the first answer (lost acknowledgement)', async () => {
    const invoice = await newInvoice()
    const first = key('same')
    const a = await recordPayment(input(invoice, 300), ACTOR, 'finance', { idempotency: first })
    expect(first.replayed).toBe(false)

    // Well outside the two-minute duplicate guard's reach is not needed: the key is checked before it.
    const second = key('same')
    const b = await recordPayment(input(invoice, 300), ACTOR, 'finance', { idempotency: second })
    expect(second.replayed).toBe(true)
    expect(b.payment.id).toBe(a.payment.id)
    expect(await db.prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(1)
    expect(await db.prisma.financialTransaction.count()).toBe(1)
    expect(await balanceOf('1000')).toBe('300.00')

    const stored = await db.prisma.idempotencyRecord.findFirstOrThrow()
    expect(stored.status).toBe('COMPLETED')
    expect(stored.financialTransactionId).toBe((await db.prisma.financialTransaction.findFirstOrThrow()).id)
  })

  it('T-02: a reused key with a different request, or from another person, is refused (422)', async () => {
    const invoice = await newInvoice()
    await recordPayment(input(invoice, 100), ACTOR, 'finance', { idempotency: key('reuse', 'hash-1') })

    await expect(
      recordPayment(input(invoice, 200), ACTOR, 'finance', { idempotency: key('reuse', 'hash-2') }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 422 })
    await expect(
      recordPayment(input(invoice, 100), 'someone-else', 'finance', { idempotency: key('reuse', 'hash-1') }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })
    expect(await db.prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(1)
  })

  it('T-02: concurrent requests with one key record exactly one payment', async () => {
    const invoice = await newInvoice()
    const outcomes = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        recordPayment(input(invoice, 250), ACTOR, 'finance', { idempotency: key('race') })),
    )
    expect(await db.prisma.payment.count({ where: { invoiceId: invoice.id } })).toBe(1)
    expect(await db.prisma.financialTransaction.count()).toBe(1)
    expect(outcomes.some((o) => o.status === 'fulfilled')).toBe(true)
    for (const o of outcomes) {
      if (o.status === 'rejected') expect((o.reason as FinancialError).code).toBe('IN_PROGRESS')
    }
  })

  it('UQ-04: the same source event cannot be registered twice', async () => {
    await runFinancialTransaction({ actorUid: ACTOR }, (tx) => recordAndPost(tx, event(), plan))
    await expect(
      runFinancialTransaction({ actorUid: ACTOR }, (tx) => recordAndPost(tx, event(), plan)),
    ).rejects.toMatchObject({ code: 'ALREADY_POSTED', status: 409 })
    expect(await db.prisma.journalEntry.count()).toBe(1)
    expect(await balanceOf('1000')).toBe('50.00')
  })

  it('transaction numbers are gapless, assigned by the database and cannot be supplied or changed', async () => {
    const one = await runFinancialTransaction({ actorUid: ACTOR }, (tx) => record(tx, event({ sourceId: 'n1' })))
    await expect(
      runFinancialTransaction({ actorUid: ACTOR }, async (tx) => {
        await record(tx, event({ sourceId: 'n-rolled-back' }))
        throw new Error('roll back')
      }),
    ).rejects.toThrow('roll back')
    const two = await runFinancialTransaction({ actorUid: ACTOR }, (tx) => record(tx, event({ sourceId: 'n2' })))
    const n = (s: string) => Number(s.split('-')[2])
    expect(n(two.transactionNumber)).toBe(n(one.transactionNumber) + 1)

    await expect(
      db.prisma.$executeRawUnsafe(`UPDATE "financial_transactions" SET "transactionNumber" = 'TXN-2026-999999'`),
    ).rejects.toThrow(/REGISTER_IMMUTABLE/)
  })

  it('CHK-17: a row cannot be marked POSTED without a journal entry', async () => {
    const row = await runFinancialTransaction({ actorUid: ACTOR }, (tx) => record(tx, event({ sourceId: 'chk17' })))
    await expect(
      db.prisma.financialTransaction.update({ where: { id: row.id }, data: { status: 'POSTED' } }),
    ).rejects.toThrow(/financial_transactions_posted_has_entry_check/)
  })

  it('a posted event is reversed at most once, and the reversal is registered', async () => {
    const posted = await runFinancialTransaction({ actorUid: ACTOR }, (tx) => recordAndPost(tx, event(), plan))
    const reverse = () =>
      runFinancialTransaction({ actorUid: ACTOR }, (tx) =>
        reverseAndPost(tx, {
          originalTransactionId: posted.transactionId,
          journalEntryId: posted.journalEntryId,
          reason: 'itest',
          event: event({ type: 'STUDENT_PAYMENT_REVERSAL', eventKey: 'REVERSAL', direction: 'OUT' }),
        }))
    const reversal = await reverse()
    await expect(reverse()).rejects.toMatchObject({ code: 'ALREADY_REVERSED' })

    const rows = await db.prisma.financialTransaction.findMany({ orderBy: { transactionNumber: 'asc' } })
    expect(rows.map((r) => r.status)).toEqual(['REVERSED', 'POSTED'])
    expect(rows[1]!.reversalOfId).toBe(posted.transactionId)
    const mirror = await db.prisma.journalEntry.findUniqueOrThrow({ where: { id: reversal.journalEntryId } })
    expect(mirror).toMatchObject({ entryKind: 'REVERSAL', financialTransactionId: reversal.transactionId })
    expect(await balanceOf('1000')).toBe('0.00')
  })

  it('TRG-06: evidence cannot be changed or deleted; it can be superseded once', async () => {
    const make = (name: string) =>
      db.prisma.financialEvidence.create({
        data: {
          ownerType: 'Expense', ownerId: 'e1', kind: 'RECEIPT', fileKey: name, fileName: name,
          mimeType: 'application/pdf', sizeBytes: 10, sha256: 'a'.repeat(64), uploadedByUid: ACTOR,
        },
      })
    const old = await make('old.pdf')
    const next = await make('new.pdf')
    const third = await make('third.pdf')
    await expect(
      db.prisma.financialEvidence.update({ where: { id: old.id }, data: { fileKey: 'swapped' } }),
    ).rejects.toThrow(/EVIDENCE_IMMUTABLE/)
    await expect(db.prisma.financialEvidence.delete({ where: { id: old.id } })).rejects.toThrow(/EVIDENCE_IMMUTABLE/)
    await db.prisma.financialEvidence.update({ where: { id: old.id }, data: { supersededById: next.id } })
    await expect(
      db.prisma.financialEvidence.update({ where: { id: old.id }, data: { supersededById: third.id } }),
    ).rejects.toThrow(/EVIDENCE_IMMUTABLE/)
  })
})
