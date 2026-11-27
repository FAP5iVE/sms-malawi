/**
 * payrollApprovalService.lockBalance.test.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-03: with the 0.01 balancing tolerance removed,
 * the payroll journal must balance to the cent on its own. Before, `lock` skipped the deductions
 * line when gross - net was exactly 0.01 and the old tolerance hid the resulting 0.01 imbalance.
 * [P1-05] A journal line cannot be zero, so `lock` writes no zero line, and no entry at all for a
 * run with nothing to pay; `rollback` of such a run reverses nothing.
 *
 * This test uses the REAL createJournalEntry's balance rule (accountingService is only mocked at
 * its database edge), so it fails if the lines the payroll builds do not balance exactly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

const h = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = {
    payrollRun: { findUniqueOrThrow: vi.fn(), update: vi.fn(async () => ({ id: 'run1', status: 'LOCKED' })) },
    chartOfAccount: {
      findMany: vi.fn(async () => [
        { id: 'a5000', code: '5000' }, { id: 'a2100', code: '2100' }, { id: 'a2000', code: '2000' },
      ]),
      update: vi.fn(),
    },
    journalEntry: {
      create: vi.fn(async () => ({ id: 'je1' })), findUnique: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  }
  prisma.$transaction = vi.fn(async (fn: (c: unknown) => unknown) => fn(prisma))
  return { prisma }
})
vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/server/services/auditService', () => ({ log: vi.fn() }))
vi.mock('@/server/lib/selfReview', () => ({ assertNotSelfReview: vi.fn() }))

import { lock, rollback } from '../payrollApprovalService'

const run = (gross: string, net: string) => ({
  id: 'run1', status: 'APPROVED', month: 11, year: 2026,
  totalGross: new Decimal(gross), totalNet: new Decimal(net),
})

/** Lines the payroll handed to the journal, as [code, debit, credit]. */
const postedLines = () =>
  (h.prisma.journalEntry.create.mock.calls[0]![0].data.lines.create as Array<{ accountId: string; debit: Decimal; credit: Decimal }>)
    .map((l) => [l.accountId, String(l.debit), String(l.credit)])

beforeEach(() => {
  vi.clearAllMocks()
  h.prisma.journalEntry.findUnique.mockResolvedValue({
    id: 'je1', status: 'DRAFT', isPosted: false,
    lines: [
      { accountId: 'a5000', debit: new Decimal('1'), credit: new Decimal('0'), account: { type: 'EXPENSE' } },
      { accountId: 'a2100', debit: new Decimal('0'), credit: new Decimal('1'), account: { type: 'LIABILITY' } },
    ],
  })
})

describe('payroll lock balances exactly (P1-03)', () => {
  it('deductions of exactly 0.01 are booked (this used to be skipped and hidden by the tolerance)', async () => {
    h.prisma.payrollRun.findUniqueOrThrow.mockResolvedValue(run('1000.01', '1000.00'))
    await expect(lock('run1', 'u1', 'finance' as never)).resolves.toBeDefined()
    expect(postedLines()).toEqual([
      ['a5000', '1000.01', '0'],
      ['a2100', '0', '1000'],
      ['a2000', '0', '0.01'],
    ])
  })

  it('a float-unfriendly difference is exact: 0.3 - 0.1 style amounts book 0.20, not 0.19999…', async () => {
    h.prisma.payrollRun.findUniqueOrThrow.mockResolvedValue(run('1234567.89', '1000000.10'))
    await lock('run1', 'u1', 'finance' as never)
    expect(postedLines()).toEqual([
      ['a5000', '1234567.89', '0'],
      ['a2100', '0', '1000000.1'],
      ['a2000', '0', '234567.79'],
    ])
  })

  it('no deductions: no third line, and still balanced', async () => {
    h.prisma.payrollRun.findUniqueOrThrow.mockResolvedValue(run('500.00', '500.00'))
    await lock('run1', 'u1', 'finance' as never)
    expect(postedLines()).toEqual([
      ['a5000', '500', '0'],
      ['a2100', '0', '500'],
    ])
  })

  it('net pay above gross cannot be booked: refused as UNBALANCED, nothing written', async () => {
    h.prisma.payrollRun.findUniqueOrThrow.mockResolvedValue(run('100.00', '100.01'))
    await expect(lock('run1', 'u1', 'finance' as never)).rejects.toMatchObject({ code: 'UNBALANCED', status: 422 })
    expect(h.prisma.journalEntry.create).not.toHaveBeenCalled()
    expect(h.prisma.payrollRun.update).not.toHaveBeenCalled()
  })
})

describe('payroll runs with a zero amount (P1-05)', () => {
  it('everything deducted: no net-pay line, gross against deductions', async () => {
    h.prisma.payrollRun.findUniqueOrThrow.mockResolvedValue(run('250.00', '0'))
    await lock('run1', 'u1', 'finance' as never)
    expect(postedLines()).toEqual([
      ['a5000', '250', '0'],
      ['a2000', '0', '250'],
    ])
  })

  it.each([
    ['with some gross pay', '100.00', '-20.00', [['a5000', '100', '0'], ['a2100', '20', '0'], ['a2000', '0', '120']]],
    ['with no gross pay', '0', '-75.50', [['a2100', '75.5', '0'], ['a2000', '0', '75.5']]],
  ])('negative net pay %s is a debit on salaries payable, never a negative line', async (_n, gross, net, expected) => {
    h.prisma.payrollRun.findUniqueOrThrow.mockResolvedValue(run(gross, net))
    await expect(lock('run1', 'u1', 'finance' as never)).resolves.toBeDefined()
    expect(postedLines()).toEqual(expected)
  })

  it('nothing to pay: the run locks without a journal entry', async () => {
    h.prisma.payrollRun.findUniqueOrThrow.mockResolvedValue(run('0', '0'))
    await expect(lock('run1', 'u1', 'finance' as never)).resolves.toBeDefined()
    expect(h.prisma.journalEntry.create).not.toHaveBeenCalled()
    expect(h.prisma.journalEntry.updateMany).not.toHaveBeenCalled()
    expect(h.prisma.payrollRun.update).toHaveBeenCalledWith({ where: { id: 'run1' }, data: { status: 'LOCKED' } })
  })

  it('rolling back a run with nothing to pay does not go looking for an older entry', async () => {
    h.prisma.payrollRun.findUniqueOrThrow.mockResolvedValue({ ...run('0', '0'), status: 'LOCKED' })
    await rollback('run1', 'wrong month', 'u1', 'finance' as never)
    expect(h.prisma.journalEntry.findFirst).not.toHaveBeenCalled()
    expect(h.prisma.journalEntry.updateMany).not.toHaveBeenCalled()
    expect(h.prisma.payrollRun.update).toHaveBeenCalledWith({ where: { id: 'run1' }, data: { status: 'PENDING_APPROVAL' } })
  })

  it('rolling back a run with amounts still looks up its entry', async () => {
    h.prisma.payrollRun.findUniqueOrThrow.mockResolvedValue({ ...run('250.00', '200.00'), status: 'LOCKED' })
    h.prisma.journalEntry.findFirst.mockResolvedValue(null)
    await rollback('run1', 'wrong month', 'u1', 'finance' as never)
    expect(h.prisma.journalEntry.findFirst).toHaveBeenCalledTimes(1)
  })
})
