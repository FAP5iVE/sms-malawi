/**
 * Pure procurement value-lifecycle maths (no database access).
 *
 * "Value" is not one number. For the requisitions raised in a window, each
 * stage is a different measure and they are never added together:
 *
 *   requested  Σ estimated totals of submitted requisitions
 *   approved   Σ estimated totals of approved (or closed) requisitions
 *   ordered    Σ totals of purchase orders that were approved (a PO cancelled
 *              after approval still counts as ordered, then as released)
 *   received   Σ line value of goods actually accepted
 *   expensed   Σ approved Expenses linked to those purchase orders
 *   paid       the part of those expenses with a paid date
 *
 * Ordered value always splits exactly into where it is now:
 *   ordered = received + released + open
 *     open     undelivered value of orders still awaiting delivery — the figure
 *              Finance reports as "Open commitments" (financeLogic.openLineValue)
 *     released undelivered value that will never arrive: cancelled quantity,
 *              and the remainder of a cancelled order
 * Because received, released and open are disjoint slices of the same order,
 * commitments and expenses are never counted twice.
 */
import type {
  ApiProcurementValueReport,
  ApiProcurementValueStage,
  ApiPurchaseOrderRow,
  ApiRequisitionValueRow,
} from '@shared/types/reporting-operations'
import { daysBetween, round } from '@/server/services/reporting/kpi'
import { OPEN_PO_STATUSES, openLineValue, type PoLineInput } from './financeLogic'

export const REQUISITION_CAP = 100
export const ROW_CAP = 25

const SUBMITTED_EXCLUDED = new Set(['DRAFT', 'CANCELLED'])
const AWAITING_REQUISITION = new Set(['SUBMITTED', 'UNDER_REVIEW'])
const NOT_ORDERED_PO = new Set(['DRAFT', 'PENDING_APPROVAL'])

const finite = (n: number) => (Number.isFinite(n) ? n : 0)

export interface ProcurementPo {
  id: string
  poNumber: string
  supplier: string
  status: string
  approvedAt: Date | null
  expectedDeliveryDate: Date | null
  lines: PoLineInput[]
}

export interface ProcurementRequisition {
  id: string
  requisitionNumber: string
  department: string
  status: string
  submittedAt: Date | null
  createdAt: Date
  estimatedTotal: number
  purchaseOrders: ProcurementPo[]
}

export interface ProcurementExpense {
  purchaseOrderId: string
  status: string
  amount: number
  paidAt: Date | null
}

export interface PoValue {
  /** Gross value of the order, MWK. */
  total: number
  received: number
  released: number
  open: number
}

/** Was the order ever approved? Draft and pending orders are not yet an obligation. */
export function isOrdered(po: Pick<ProcurementPo, 'status' | 'approvedAt'>): boolean {
  if (po.approvedAt) return true
  return !NOT_ORDERED_PO.has(po.status) && po.status !== 'CANCELLED'
}

/** Split one order into received / released / open. total = received + released + open. */
export function poValue(po: Pick<ProcurementPo, 'status' | 'lines'>): PoValue {
  let total = 0
  let received = 0
  let released = 0
  let open = 0
  for (const l of po.lines) {
    const ordered = finite(l.quantityOrdered)
    const lineTotal = finite(l.lineTotal)
    total += lineTotal
    if (ordered <= 0) continue
    const cancelled = Math.min(Math.max(0, finite(l.quantityCancelled)), ordered)
    const rec = Math.min(Math.max(0, finite(l.quantityReceived)), ordered - cancelled)
    const per = lineTotal / ordered
    received += per * rec
    released += per * cancelled
    open += openLineValue(l)
  }
  if (po.status === 'CANCELLED') {
    // The undelivered remainder of a cancelled order will never be delivered.
    released += open
    open = 0
  } else if (!(OPEN_PO_STATUSES as readonly string[]).includes(po.status)) {
    // Fully received / closed orders carry no open value, whatever the lines say.
    released += open
    open = 0
  }
  return { total, received, released, open }
}

function poRow(po: ProcurementPo, now: Date): ApiPurchaseOrderRow {
  const v = poValue(po)
  const late = po.expectedDeliveryDate && v.open > 0 && po.expectedDeliveryDate.getTime() < now.getTime()
    ? daysBetween(po.expectedDeliveryDate, now)
    : null
  return {
    id: po.id,
    poNumber: po.poNumber,
    supplier: po.supplier,
    status: po.status,
    expectedDeliveryDate: po.expectedDeliveryDate ? po.expectedDeliveryDate.toISOString() : null,
    daysLate: late !== null && late > 0 ? late : null,
    orderedValue: round(v.total, 2),
    receivedValue: round(v.received, 2),
    openValue: round(v.open, 2),
  }
}

export function summariseProcurementValue(
  requisitions: readonly ProcurementRequisition[],
  expenses: readonly ProcurementExpense[],
  now: Date,
): Pick<ApiProcurementValueReport, 'stages' | 'orders' | 'awaitingApproval' | 'expenses' | 'delayed' | 'partiallyDelivered' | 'requisitions' | 'requisitionsTruncated'> {
  const submitted = requisitions.filter((r) => r.submittedAt !== null || !SUBMITTED_EXCLUDED.has(r.status))
  const approved = submitted.filter((r) => r.status === 'APPROVED' || r.status === 'CLOSED')
  const allPos = requisitions.flatMap((r) => r.purchaseOrders)
  const ordered = allPos.filter(isOrdered)
  const orderedIds = new Set(ordered.map((p) => p.id))

  const split = ordered.reduce(
    (a, po) => {
      const v = poValue(po)
      return { total: a.total + v.total, received: a.received + v.received, released: a.released + v.released, open: a.open + v.open }
    },
    { total: 0, received: 0, released: 0, open: 0 },
  )

  const linked = expenses.filter((e) => orderedIds.has(e.purchaseOrderId))
  const approvedExpenses = linked.filter((e) => e.status === 'APPROVED')
  const approvedTotal = approvedExpenses.reduce((s, e) => s + finite(e.amount), 0)
  const paidTotal = approvedExpenses.filter((e) => e.paidAt).reduce((s, e) => s + finite(e.amount), 0)
  const pendingTotal = linked.filter((e) => e.status === 'PENDING').reduce((s, e) => s + finite(e.amount), 0)

  const sumEst = (rs: readonly ProcurementRequisition[]) => round(rs.reduce((s, r) => s + finite(r.estimatedTotal), 0), 2)

  const stages: ApiProcurementValueStage[] = [
    { key: 'requested', label: 'Requested', description: 'Estimated cost of requisitions submitted for approval.', count: submitted.length, value: submitted.length ? sumEst(submitted) : null },
    { key: 'approved', label: 'Approved', description: 'Estimated cost of requisitions that were approved.', count: approved.length, value: approved.length ? sumEst(approved) : null },
    { key: 'ordered', label: 'Ordered', description: 'Total of approved purchase orders, including tax.', count: ordered.length, value: ordered.length ? round(split.total, 2) : null },
    { key: 'received', label: 'Received', description: 'Value of goods accepted so far, at ordered prices.', count: ordered.filter((p) => poValue(p).received > 0).length, value: ordered.length ? round(split.received, 2) : null },
    { key: 'expensed', label: 'Expensed', description: 'Approved expenses recorded against these orders.', count: approvedExpenses.length, value: ordered.length ? round(approvedTotal, 2) : null },
    { key: 'paid', label: 'Paid', description: 'Part of those expenses with a payment date.', count: approvedExpenses.filter((e) => e.paidAt).length, value: ordered.length ? round(paidTotal, 2) : null },
  ]

  const awaitingReqs = requisitions.filter((r) => AWAITING_REQUISITION.has(r.status))
  const awaitingDays = awaitingReqs.map((r) => daysBetween(r.submittedAt ?? r.createdAt, now)).filter((d) => d >= 0)
  const pendingPos = allPos.filter((p) => p.status === 'PENDING_APPROVAL')

  const openPos = ordered.filter((p) => (OPEN_PO_STATUSES as readonly string[]).includes(p.status) && poValue(p).open > 0)
  const delayed = openPos
    .map((p) => poRow(p, now))
    .filter((r) => r.daysLate !== null)
    .sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0) || a.poNumber.localeCompare(b.poNumber))
  const partial = openPos
    .filter((p) => poValue(p).received > 0)
    .map((p) => poRow(p, now))
    .sort((a, b) => b.openValue - a.openValue || a.poNumber.localeCompare(b.poNumber))

  const expensedBy = (poIds: Set<string>, pred: (e: ProcurementExpense) => boolean) =>
    linked.filter((e) => poIds.has(e.purchaseOrderId) && e.status === 'APPROVED' && pred(e)).reduce((s, e) => s + finite(e.amount), 0)

  const reqRows: ApiRequisitionValueRow[] = requisitions
    .map((r) => {
      const pos = r.purchaseOrders.filter(isOrdered)
      const ids = new Set(pos.map((p) => p.id))
      const values = pos.map(poValue)
      const finished = r.status === 'CLOSED' || r.status === 'REJECTED' || r.status === 'CANCELLED'
      return {
        id: r.id,
        requisitionNumber: r.requisitionNumber,
        department: r.department,
        status: r.status,
        ageDays: finished ? null : Math.max(0, daysBetween(r.submittedAt ?? r.createdAt, now)),
        requested: round(finite(r.estimatedTotal), 2),
        ordered: round(values.reduce((s, v) => s + v.total, 0), 2),
        received: round(values.reduce((s, v) => s + v.received, 0), 2),
        expensed: round(expensedBy(ids, () => true), 2),
        paid: round(expensedBy(ids, (e) => e.paidAt !== null), 2),
      }
    })
    .sort((a, b) => Number(b.ageDays !== null) - Number(a.ageDays !== null) || (b.ageDays ?? 0) - (a.ageDays ?? 0) || b.requested - a.requested)

  const receivedValue = round(split.received, 2)
  const approvedValue = round(approvedTotal, 2)
  return {
    stages,
    orders: {
      ordered: round(split.total, 2),
      received: receivedValue,
      released: round(split.released, 2),
      open: round(split.open, 2),
      reconciles: Math.abs(split.total - (split.received + split.released + split.open)) < 0.01,
    },
    awaitingApproval: {
      requisitions: { count: awaitingReqs.length, value: sumEst(awaitingReqs), oldestDays: awaitingDays.length ? Math.max(...awaitingDays) : null },
      purchaseOrders: { count: pendingPos.length, value: round(pendingPos.reduce((s, p) => s + p.lines.reduce((t, l) => t + finite(l.lineTotal), 0), 0), 2) },
    },
    expenses: {
      approved: approvedValue,
      paid: round(paidTotal, 2),
      payable: round(approvedTotal - paidTotal, 2),
      pendingApproval: round(pendingTotal, 2),
      receivedNotExpensed: round(Math.max(0, receivedValue - approvedValue), 2),
      expensedAheadOfDelivery: round(Math.max(0, approvedValue - receivedValue), 2),
    },
    delayed: delayed.slice(0, ROW_CAP),
    partiallyDelivered: partial.slice(0, ROW_CAP),
    requisitions: reqRows.slice(0, REQUISITION_CAP),
    requisitionsTruncated: reqRows.length > REQUISITION_CAP,
  }
}
