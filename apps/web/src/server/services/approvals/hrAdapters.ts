/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvals/hrAdapters.ts
 * [PURPOSE]: Hub adapters for HR — staff leave requests and staff loans.
 *   Decisions delegate to hrService (reviewLeave / approveLoan / rejectLoan /
 *   cancelLeave), so leave balances and staff status keep updating exactly
 *   as they do from the HR page.
 */

import 'server-only'
import type { LeaveStatus, LoanStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ApprovalStatus } from '@shared/constants/approvals'
import * as hrService from '@/server/services/hrService'
import type { AdapterItem, ApprovalAdapter } from './types'
import {
  dateFilter, detailList, emptyCounts, expandStatuses, fullName, humanize,
  lookupNames, makeItem, money, person, shortDate, tally,
} from './helpers'

// ─── LEAVE ────────────────────────────────────────────────

const LEAVE_STATUS: Record<ApprovalStatus, readonly LeaveStatus[]> = {
  PENDING: ['PENDING'],
  APPROVED: ['APPROVED'],
  REJECTED: ['REJECTED'],
  CANCELLED: ['CANCELLED'],
  EXPIRED: [],
}

const leaveInclude = {
  staff: { select: { uid: true, firstName: true, lastName: true, role: true, department: true } },
} satisfies Prisma.LeaveRequestInclude

type LeaveRow = Prisma.LeaveRequestGetPayload<{ include: typeof leaveInclude }>

function leaveItem(r: LeaveRow, names: Map<string, string>): AdapterItem {
  const staffName = fullName(r.staff.firstName, r.staff.lastName)
  const type = humanize(r.leaveType)
  return makeItem('leave', {
    sourceId: r.id,
    title: `${type} leave — ${r.days} working day${r.days === 1 ? '' : 's'}`,
    summary: r.reason,
    status: r.status,
    sourceStatus: r.status,
    requester: person(r.staff.uid, staffName, r.staff.role),
    details: detailList([
      ['Staff member', staffName],
      ['Department', r.staff.department],
      ['Leave type', type],
      ['From', shortDate(r.startDate)],
      ['To', shortDate(r.endDate)],
      ['Working days', r.days],
      ['Reason', r.reason],
    ]),
    createdAt: r.createdAt,
    decidedAt: r.reviewedAt,
    decidedBy: r.reviewedByUid ? person(r.reviewedByUid, names.get(r.reviewedByUid) ?? '') : null,
    decisionNotes: r.reviewNotes,
  })
}

export const leaveAdapter: ApprovalAdapter = {
  source: 'leave',
  notifiesRequester: true,

  async list(q) {
    const statuses = expandStatuses(q.statuses, LEAVE_STATUS)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.leaveRequest.findMany({
      where: {
        status: { in: statuses },
        ...(q.requesterUid ? { staff: { uid: q.requesterUid } } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: leaveInclude,
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.map((r) => r.reviewedByUid))
    return rows.map((r) => leaveItem(r, names))
  },

  async counts(requesterUid) {
    const rows = await prisma.leaveRequest.groupBy({
      by: ['status'],
      where: requesterUid ? { staff: { uid: requesterUid } } : {},
      _count: { _all: true },
    })
    return rows.length ? tally(rows, LEAVE_STATUS) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.leaveRequest.findUnique({ where: { id }, include: leaveInclude })
    if (!r) return null
    return leaveItem(r, await lookupNames([r.reviewedByUid]))
  },

  async approve(id, actor, input) {
    await hrService.reviewLeave(
      id,
      { status: 'APPROVED', ...(input.notes ? { reviewNotes: input.notes.slice(0, 300) } : {}) },
      actor.uid,
    )
  },

  async reject(id, actor, input) {
    await hrService.reviewLeave(id, { status: 'REJECTED', reviewNotes: input.notes.slice(0, 300) }, actor.uid)
  },

  async cancel(id, actor) {
    await hrService.cancelLeave(id, actor.uid)
  },
}

// ─── STAFF LOANS ──────────────────────────────────────────

const LOAN_STATUS: Record<ApprovalStatus, readonly LoanStatus[]> = {
  PENDING: ['PENDING'],
  APPROVED: ['APPROVED', 'DISBURSED', 'REPAYING', 'SETTLED'],
  REJECTED: ['REJECTED'],
  CANCELLED: [],
  EXPIRED: [],
}

const loanInclude = {
  staff: { select: { uid: true, firstName: true, lastName: true, role: true, department: true } },
} satisfies Prisma.StaffLoanInclude

type LoanRow = Prisma.StaffLoanGetPayload<{ include: typeof loanInclude }>

function loanItem(r: LoanRow, names: Map<string, string>): AdapterItem {
  const staffName = fullName(r.staff.firstName, r.staff.lastName)
  return makeItem('loan', {
    sourceId: r.id,
    title: `Staff loan — ${money(r.amount)}`,
    summary: r.reason,
    status: r.status === 'REJECTED' ? 'REJECTED' : r.status === 'PENDING' ? 'PENDING' : 'APPROVED',
    sourceStatus: r.status,
    requester: person(r.staff.uid, staffName, r.staff.role),
    amount: Number(r.amount),
    details: detailList([
      ['Staff member', staffName],
      ['Department', r.staff.department],
      ['Loan amount', money(r.amount)],
      ['Monthly deduction', money(r.monthlyDeduction)],
      ['Outstanding balance', r.status === 'PENDING' || r.status === 'REJECTED' ? null : money(r.balance)],
      ['Reason', r.reason],
    ]),
    createdAt: r.createdAt,
    decidedAt: r.approvedAt,
    decidedBy: r.approvedByUid ? person(r.approvedByUid, names.get(r.approvedByUid) ?? '') : null,
  })
}

export const loanAdapter: ApprovalAdapter = {
  source: 'loan',

  async list(q) {
    const statuses = expandStatuses(q.statuses, LOAN_STATUS)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.staffLoan.findMany({
      where: {
        status: { in: statuses },
        ...(q.requesterUid ? { staff: { uid: q.requesterUid } } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: loanInclude,
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.map((r) => r.approvedByUid))
    return rows.map((r) => loanItem(r, names))
  },

  async counts(requesterUid) {
    const rows = await prisma.staffLoan.groupBy({
      by: ['status'],
      where: requesterUid ? { staff: { uid: requesterUid } } : {},
      _count: { _all: true },
    })
    return rows.length ? tally(rows, LOAN_STATUS) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.staffLoan.findUnique({ where: { id }, include: loanInclude })
    if (!r) return null
    return loanItem(r, await lookupNames([r.approvedByUid]))
  },

  async approve(id, actor) {
    await hrService.approveLoan(id, actor.uid)
  },

  async reject(id, actor, input) {
    await hrService.rejectLoan(id, actor.uid, actor.role, input.notes)
  },
}
