/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvals/financeAdapters.ts
 * [PURPOSE]: Hub adapters for Finance — expenses and payroll runs.
 *   Expense decisions go through expenseApprovalService (ledger posting +
 *   budget spend); payroll goes through payrollApprovalService.
 */

import 'server-only'
import type { ExpenseStatus, PayrollStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ApprovalStatus } from '@shared/constants/approvals'
import * as expenseApprovalService from '@/server/services/expenseApprovalService'
import * as payrollApprovalService from '@/server/services/payrollApprovalService'
import type { ApprovalAdapter } from './types'
import {
  dateFilter, detailList, emptyCounts, expandStatuses, humanize,
  lookupNames, makeItem, money, person, shortDate, tally,
} from './helpers'

// ─── EXPENSES ─────────────────────────────────────────────

const EXPENSE_STATUS: Record<ApprovalStatus, readonly ExpenseStatus[]> = {
  PENDING: ['PENDING'],
  APPROVED: ['APPROVED'],
  REJECTED: ['REJECTED'],
  CANCELLED: [],
  EXPIRED: [],
}

type ExpenseRow = Awaited<ReturnType<typeof prisma.expense.findUniqueOrThrow>>

function expenseItem(r: ExpenseRow, names: Map<string, string>) {
  return makeItem('expense', {
    sourceId: r.id,
    title: `${humanize(r.category)} — ${r.description}`,
    summary: r.description,
    status: r.status,
    sourceStatus: r.status,
    requester: person(r.recordedByUid, names.get(r.recordedByUid) ?? ''),
    amount: Number(r.amount),
    details: detailList([
      ['Category', humanize(r.category)],
      ['Description', r.description],
      ['Amount', money(r.amount)],
      ['Incurred on', shortDate(r.incurredAt)],
      ['Academic period', `${r.academicYear}, Term ${r.term}`],
      ['Receipt', r.receiptKey ? 'Attached' : 'None attached'],
      ['Supplier invoice', r.supplierInvoiceNumber],
      ['Payment', r.status === 'APPROVED' ? (r.paidAt ? 'Paid' : 'Owed (payable)') : null],
    ]),
    createdAt: r.createdAt,
    decidedAt: r.approvedAt,
    decidedBy: r.approvedByUid ? person(r.approvedByUid, names.get(r.approvedByUid) ?? '') : null,
  })
}

export const expenseAdapter: ApprovalAdapter = {
  source: 'expense',

  async list(q) {
    const statuses = expandStatuses(q.statuses, EXPENSE_STATUS)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.expense.findMany({
      where: {
        status: { in: statuses },
        ...(q.requesterUid ? { recordedByUid: q.requesterUid } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.flatMap((r) => [r.recordedByUid, r.approvedByUid]))
    return rows.map((r) => expenseItem(r, names))
  },

  async counts(requesterUid) {
    const rows = await prisma.expense.groupBy({
      by: ['status'],
      where: requesterUid ? { recordedByUid: requesterUid } : {},
      _count: { _all: true },
    })
    return rows.length ? tally(rows, EXPENSE_STATUS) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.expense.findUnique({ where: { id } })
    if (!r) return null
    return expenseItem(r, await lookupNames([r.recordedByUid, r.approvedByUid]))
  },

  async approve(id, actor, input) {
    await expenseApprovalService.approveExpense(id, actor.uid, actor.role, input.paidImmediately !== false)
  },

  async reject(id, actor, input) {
    await expenseApprovalService.rejectExpense(id, actor.uid, actor.role, input.notes)
  },
}

// ─── PAYROLL ──────────────────────────────────────────────

const PAYROLL_STATUS: Record<ApprovalStatus, readonly PayrollStatus[]> = {
  PENDING: ['PENDING_APPROVAL'],
  APPROVED: ['APPROVED', 'LOCKED'],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type PayrollRow = Awaited<ReturnType<typeof prisma.payrollRun.findUniqueOrThrow>>

function payrollItem(r: PayrollRow, names: Map<string, string>) {
  const period = `${MONTHS[r.month - 1] ?? `Month ${r.month}`} ${r.year}`
  const gross = Number(r.totalGross)
  const net = Number(r.totalNet)
  return makeItem('payroll', {
    sourceId: r.id,
    title: `Payroll run — ${period}`,
    summary: `Net payroll ${money(net)} for ${period}.`,
    status: r.status === 'PENDING_APPROVAL' ? 'PENDING' : 'APPROVED',
    sourceStatus: r.status,
    requester: person(r.submittedByUid, r.submittedByUid ? (names.get(r.submittedByUid) ?? '') : 'Finance'),
    amount: net,
    details: detailList([
      ['Period', period],
      ['Gross payroll', money(gross)],
      ['Deductions (PAYE, pension, loans)', money(gross - net)],
      ['Net payroll', money(net)],
      ['Run status', humanize(r.status)],
    ]),
    createdAt: r.createdAt,
    decidedAt: r.approvedAt,
    decidedBy: r.approvedByUid ? person(r.approvedByUid, names.get(r.approvedByUid) ?? '') : null,
  })
}

export const payrollAdapter: ApprovalAdapter = {
  source: 'payroll',

  async list(q) {
    const statuses = expandStatuses(q.statuses, PAYROLL_STATUS)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.payrollRun.findMany({
      where: {
        status: { in: statuses },
        ...(q.requesterUid ? { submittedByUid: q.requesterUid } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.flatMap((r) => [r.submittedByUid, r.approvedByUid]))
    return rows.map((r) => payrollItem(r, names))
  },

  async counts(requesterUid) {
    const rows = await prisma.payrollRun.groupBy({
      by: ['status'],
      where: requesterUid ? { submittedByUid: requesterUid } : {},
      _count: { _all: true },
    })
    return rows.length ? tally(rows, PAYROLL_STATUS) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.payrollRun.findUnique({ where: { id } })
    // A run that has not been submitted yet (PROCESSING / COMPLETED / FAILED)
    // is not an approval item.
    if (!r || !expandStatuses(null, PAYROLL_STATUS).includes(r.status)) return null
    return payrollItem(r, await lookupNames([r.submittedByUid, r.approvedByUid]))
  },

  async approve(id, actor) {
    await payrollApprovalService.approve(id, actor.uid, actor.role)
  },

  async return(id, actor, input) {
    await payrollApprovalService.returnToFinance(id, input.notes, actor.uid, actor.role)
  },
}
