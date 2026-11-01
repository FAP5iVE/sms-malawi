// @vitest-environment node
/**
 * Approval parity (Issue 7): the original per-module endpoints must enforce the
 * same separation-of-duties rule as the Approvals Hub — a person may not decide
 * their own request — and loan money may only move through the approved states.
 * Each case is a NEGATIVE test (denied) paired with a positive one (allowed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
    update: vi.fn(async (a: unknown) => a), updateMany: vi.fn(), create: vi.fn(), count: vi.fn(),
  })
  const prisma = {
    leaveRequest: model(), staffLoan: model(), expense: model(), payrollRun: model(),
    fineWaiverRequest: model(), libraryFine: model(), assetRequest: model(),
    leaveBalance: model(), salaryStructure: model(), staffProfile: model(),
    $transaction: vi.fn(async (x: unknown) => (typeof x === 'function' ? (x as (t: unknown) => unknown)(prisma) : Promise.all(x as unknown[]))),
  }
  return { prisma }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: m.prisma }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/tempPassword', () => ({ generateTempPassword: vi.fn() }))
vi.mock('firebase-admin', () => ({ auth: () => ({}) }))
vi.mock('@/server/services/auditService', () => ({ log: vi.fn(), logAsync: vi.fn() }))
vi.mock('@/server/services/algoliaService', () => ({ bulkIndexAssets: vi.fn(), indexAsset: vi.fn(), indexStaff: vi.fn(), updateAsset: vi.fn(), updateStaff: vi.fn() }))
vi.mock('@/server/services/leaveConflictService', () => ({ checkLeaveConflicts: vi.fn(async () => ({ conflicts: [] })) }))
vi.mock('@/server/services/notificationService', () => ({ sendLeaveUpdate: vi.fn() }))
vi.mock('@/server/services/settingsService', () => ({ get: vi.fn(), getMany: vi.fn() }))
vi.mock('@/server/services/budgetService', () => ({ updateBudgetSpent: vi.fn() }))
vi.mock('@/server/services/accountingService', () => ({ createJournalEntry: vi.fn(), postEntry: vi.fn(), voidEntry: vi.fn(), seedChartOfAccounts: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import * as hr from '../hrService'
import * as expenses from '../expenseApprovalService'
import * as payroll from '../payrollApprovalService'
import * as waivers from '../libraryWorkflowService'
import * as assets from '../assetService'

const SELF = 'uid-self'
const OTHER = 'uid-reviewer'
const selfError = { status: 403, name: 'SelfReviewError' }

beforeEach(() => vi.clearAllMocks())

describe('leave review', () => {
  const row = (staffUid: string) => ({
    id: 'l1', status: 'PENDING', staffId: 's1', leaveType: 'OTHER', startDate: new Date('2026-11-02'),
    endDate: new Date('2026-11-03'), days: 2, staff: { id: 's1', uid: staffUid, firstName: 'A', lastName: 'B', email: 'a@b.c' },
  })
  it('denies the applicant reviewing their own leave', async () => {
    m.prisma.leaveRequest.findUniqueOrThrow.mockResolvedValue(row(SELF))
    await expect(hr.reviewLeave('l1', { status: 'APPROVED' } as never, SELF)).rejects.toMatchObject(selfError)
    expect(m.prisma.leaveRequest.update).not.toHaveBeenCalled()
  })
  it('allows a different reviewer', async () => {
    m.prisma.leaveRequest.findUniqueOrThrow.mockResolvedValue(row(SELF))
    await hr.reviewLeave('l1', { status: 'REJECTED' } as never, OTHER)
    expect(m.prisma.leaveRequest.update).toHaveBeenCalled()
  })
})

describe('loans', () => {
  it('denies approving / rejecting your own loan, with no write', async () => {
    m.prisma.staffLoan.findUnique.mockResolvedValue({ status: 'PENDING', staff: { uid: SELF } })
    await expect(hr.approveLoan('ln1', SELF)).rejects.toMatchObject(selfError)
    await expect(hr.rejectLoan('ln1', SELF, 'hr', 'no')).rejects.toMatchObject(selfError)
    expect(m.prisma.staffLoan.update).not.toHaveBeenCalled()
  })
  it('lets someone else approve a pending loan', async () => {
    m.prisma.staffLoan.findUnique.mockResolvedValue({ status: 'PENDING', staff: { uid: SELF } })
    await hr.approveLoan('ln1', OTHER)
    expect(m.prisma.staffLoan.update).toHaveBeenCalled()
  })

  it('refuses to disburse a loan that is not APPROVED (pending / rejected / already paid out)', async () => {
    for (const status of ['PENDING', 'REJECTED', 'DISBURSED', 'SETTLED']) {
      m.prisma.staffLoan.updateMany.mockResolvedValueOnce({ count: 0 })
      m.prisma.staffLoan.findUnique.mockResolvedValueOnce({ status })
      await expect(hr.disburseLoan('ln1'), status).rejects.toMatchObject({ status: 409 })
    }
    expect(m.prisma.salaryStructure.update).not.toHaveBeenCalled()
  })
  it('the disburse claim is conditional on status APPROVED (atomic)', async () => {
    m.prisma.staffLoan.updateMany.mockResolvedValue({ count: 1 })
    m.prisma.staffLoan.findUniqueOrThrow.mockResolvedValue({ id: 'ln1', monthlyDeduction: 100, staff: { uid: SELF } })
    m.prisma.salaryStructure.findUnique.mockResolvedValue(null)
    await hr.disburseLoan('ln1')
    expect(m.prisma.staffLoan.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ln1', status: 'APPROVED' } }))
  })
  it('disburse of an unknown loan is 404', async () => {
    m.prisma.staffLoan.updateMany.mockResolvedValue({ count: 0 })
    m.prisma.staffLoan.findUnique.mockResolvedValue(null)
    await expect(hr.disburseLoan('nope')).rejects.toMatchObject({ status: 404 })
  })

  it.each([['string', 'abc'], ['NaN', NaN], ['zero', 0], ['negative', -5], ['Infinity', Infinity]])(
    'rejects a %s repayment amount before touching the database', async (_n, amount) => {
      await expect(hr.recordLoanRepayment('ln1', amount as never)).rejects.toMatchObject({ status: 400 })
      expect(m.prisma.staffLoan.findUniqueOrThrow).not.toHaveBeenCalled()
    })
  it('rejects repayments against a loan that was never disbursed', async () => {
    m.prisma.staffLoan.findUniqueOrThrow.mockResolvedValue({ id: 'ln1', status: 'PENDING', balance: 100, totalRepaid: 0, staff: { uid: SELF } })
    await expect(hr.recordLoanRepayment('ln1', 10)).rejects.toMatchObject({ status: 409 })
    expect(m.prisma.staffLoan.update).not.toHaveBeenCalled()
  })
  it('records a repayment against a DISBURSED loan', async () => {
    m.prisma.staffLoan.findUniqueOrThrow.mockResolvedValue({ id: 'ln1', status: 'DISBURSED', balance: 100, totalRepaid: 0, staff: { uid: SELF } })
    await hr.recordLoanRepayment('ln1', 40)
    expect(m.prisma.staffLoan.update).toHaveBeenCalledWith(expect.objectContaining({ data: { balance: 60, totalRepaid: 40, status: 'REPAYING' } }))
  })
})

describe('expenses', () => {
  it('denies the person who recorded an expense approving or rejecting it', async () => {
    m.prisma.expense.findUnique.mockResolvedValue({ recordedByUid: SELF })
    await expect(expenses.approveExpense('e1', SELF, 'admin')).rejects.toMatchObject(selfError)
    await expect(expenses.rejectExpense('e1', SELF, 'admin')).rejects.toMatchObject(selfError)
    expect(m.prisma.expense.updateMany).not.toHaveBeenCalled()
  })
  it('lets a different approver claim it', async () => {
    m.prisma.expense.findUnique.mockResolvedValue({ recordedByUid: SELF })
    m.prisma.expense.updateMany.mockResolvedValue({ count: 0 })
    // the self-review guard passes, so execution reaches the conditional claim
    await expenses.rejectExpense('e1', OTHER, 'high_rank').catch(() => undefined)
    expect(m.prisma.expense.updateMany).toHaveBeenCalled()
  })
})

describe('payroll', () => {
  it('denies the submitter approving or returning their own run', async () => {
    m.prisma.payrollRun.findUniqueOrThrow.mockResolvedValue({ id: 'r1', status: 'PENDING_APPROVAL', submittedByUid: SELF })
    await expect(payroll.approve('r1', SELF, 'high_rank')).rejects.toMatchObject(selfError)
    await expect(payroll.returnToFinance('r1', 'x', SELF, 'high_rank')).rejects.toMatchObject(selfError)
    expect(m.prisma.payrollRun.update).not.toHaveBeenCalled()
  })
  it('lets a different approver approve', async () => {
    m.prisma.payrollRun.findUniqueOrThrow.mockResolvedValue({ id: 'r1', status: 'PENDING_APPROVAL', submittedByUid: SELF })
    await payroll.approve('r1', OTHER, 'high_rank')
    expect(m.prisma.payrollRun.update).toHaveBeenCalled()
  })
})

describe('library fine waivers', () => {
  it('denies the requester approving or rejecting their own waiver', async () => {
    m.prisma.fineWaiverRequest.findUniqueOrThrow.mockResolvedValue({ id: 'w1', status: 'PENDING', requestedByUid: SELF, fineId: 'f1', fine: {} })
    await expect(waivers.approveFineWaiver('w1', SELF)).rejects.toMatchObject(selfError)
    await expect(waivers.rejectFineWaiver('w1', 'no', SELF)).rejects.toMatchObject(selfError)
    expect(m.prisma.$transaction).not.toHaveBeenCalled()
    expect(m.prisma.fineWaiverRequest.update).not.toHaveBeenCalled()
  })
  it('lets another staff member reject', async () => {
    m.prisma.fineWaiverRequest.findUniqueOrThrow.mockResolvedValue({ id: 'w1', status: 'PENDING', requestedByUid: SELF, fineId: 'f1' })
    await waivers.rejectFineWaiver('w1', 'no', OTHER)
    expect(m.prisma.fineWaiverRequest.update).toHaveBeenCalled()
  })
})

describe('asset requests', () => {
  it('denies the requester approving or rejecting their own request', async () => {
    m.prisma.assetRequest.findUnique.mockResolvedValue({ id: 'a1', status: 'PENDING', requestedByUid: SELF })
    await expect(assets.approveAssetRequest('a1', {} as never, SELF, 'high_rank')).rejects.toMatchObject(selfError)
    await expect(assets.rejectAssetRequest('a1', {} as never, SELF, 'high_rank')).rejects.toMatchObject(selfError)
    expect(m.prisma.assetRequest.update).not.toHaveBeenCalled()
  })
  it('lets another reviewer decide', async () => {
    m.prisma.assetRequest.findUnique.mockResolvedValue({ id: 'a1', status: 'PENDING', requestedByUid: SELF })
    m.prisma.assetRequest.update.mockResolvedValue({ id: 'a1', status: 'REJECTED' })
    await assets.rejectAssetRequest('a1', {} as never, OTHER, 'high_rank')
    expect(m.prisma.assetRequest.update).toHaveBeenCalled()
  })
})
