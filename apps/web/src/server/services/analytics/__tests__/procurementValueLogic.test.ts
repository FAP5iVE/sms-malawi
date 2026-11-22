import { describe, it, expect } from 'vitest'
import { openPoCommitment } from '../financeLogic'
import { isOrdered, poValue, summariseProcurementValue, type ProcurementPo, type ProcurementRequisition } from '../procurementValueLogic'

const NOW = new Date('2026-03-31T00:00:00Z')
const ago = (n: number) => new Date(NOW.getTime() - n * 86_400_000)
const ahead = (n: number) => new Date(NOW.getTime() + n * 86_400_000)

const line = (ordered: number, received: number, total: number, cancelled = 0) => ({
  quantityOrdered: ordered, quantityReceived: received, quantityCancelled: cancelled, lineTotal: total,
})

const po = (over: Partial<ProcurementPo> & { id: string }): ProcurementPo => ({
  poNumber: `PO-${over.id}`,
  supplier: 'Acme',
  status: 'APPROVED',
  approvedAt: ago(10),
  expectedDeliveryDate: ahead(5),
  lines: [line(10, 0, 100_000)],
  ...over,
})

const req = (over: Partial<ProcurementRequisition> & { id: string }): ProcurementRequisition => ({
  requisitionNumber: `PR-${over.id}`,
  department: 'Science',
  status: 'APPROVED',
  submittedAt: ago(30),
  createdAt: ago(31),
  estimatedTotal: 100_000,
  purchaseOrders: [],
  ...over,
})

describe('poValue — ordered = received + released + open', () => {
  it('splits a partly delivered order', () => {
    const v = poValue({ status: 'PARTIALLY_RECEIVED', lines: [line(10, 6, 100_000)] })
    expect(v).toEqual({ total: 100_000, received: 60_000, released: 0, open: 40_000 })
  })

  it('treats cancelled quantity as released, not open', () => {
    const v = poValue({ status: 'PARTIALLY_RECEIVED', lines: [line(10, 5, 100_000, 3)] })
    expect(v).toMatchObject({ received: 50_000, released: 30_000, open: 20_000 })
    expect(v.received + v.released + v.open).toBe(v.total)
  })

  it('a cancelled order keeps what was already received and releases the rest', () => {
    const v = poValue({ status: 'CANCELLED', lines: [line(10, 4, 100_000)] })
    expect(v).toEqual({ total: 100_000, received: 40_000, released: 60_000, open: 0 })
  })

  it('a closed order short-delivered releases the shortfall instead of leaving it open', () => {
    const v = poValue({ status: 'CLOSED_WITH_VARIANCE', lines: [line(10, 8, 100_000)] })
    expect(v).toEqual({ total: 100_000, received: 80_000, released: 20_000, open: 0 })
  })

  it('caps over-receipt so received never exceeds the order', () => {
    const v = poValue({ status: 'FULLY_RECEIVED', lines: [line(10, 12, 100_000)] })
    expect(v.received).toBe(100_000)
    expect(v.received + v.released + v.open).toBe(v.total)
  })

  it('only approved orders count as ordered', () => {
    expect(isOrdered({ status: 'DRAFT', approvedAt: null })).toBe(false)
    expect(isOrdered({ status: 'PENDING_APPROVAL', approvedAt: null })).toBe(false)
    expect(isOrdered({ status: 'CANCELLED', approvedAt: null })).toBe(false)
    expect(isOrdered({ status: 'CANCELLED', approvedAt: ago(3) })).toBe(true)
    expect(isOrdered({ status: 'SENT', approvedAt: null })).toBe(true)
  })
})

describe('procurement value lifecycle', () => {
  const requisitions: ProcurementRequisition[] = [
    req({ id: 'draft', status: 'DRAFT', submittedAt: null, estimatedTotal: 999 }),
    req({ id: 'waiting', status: 'UNDER_REVIEW', submittedAt: ago(12), estimatedTotal: 50_000 }),
    req({ id: 'rejected', status: 'REJECTED', estimatedTotal: 30_000 }),
    // approved, ordered 100,000, 6 of 10 received, expense 60,000 (paid)
    req({
      id: 'a', status: 'APPROVED', estimatedTotal: 95_000,
      purchaseOrders: [po({ id: 'po-a', status: 'PARTIALLY_RECEIVED', expectedDeliveryDate: ago(7), lines: [line(10, 6, 100_000)] })],
    }),
    // closed: fully delivered 200,000; expensed 200,000 of which 150,000 paid
    req({
      id: 'b', status: 'CLOSED', estimatedTotal: 210_000,
      purchaseOrders: [po({ id: 'po-b', status: 'FULLY_RECEIVED', lines: [line(5, 5, 200_000)] })],
    }),
    // approved requisition whose PO is still awaiting approval
    req({ id: 'c', status: 'APPROVED', estimatedTotal: 40_000, purchaseOrders: [po({ id: 'po-c', status: 'PENDING_APPROVAL', approvedAt: null, lines: [line(4, 0, 40_000)] })] }),
  ]
  const expenses = [
    { purchaseOrderId: 'po-a', status: 'APPROVED', amount: 60_000, paidAt: ago(2) },
    { purchaseOrderId: 'po-b', status: 'APPROVED', amount: 150_000, paidAt: ago(20) },
    { purchaseOrderId: 'po-b', status: 'APPROVED', amount: 50_000, paidAt: null }, // owed
    { purchaseOrderId: 'po-b', status: 'PENDING', amount: 1_000, paidAt: null },
    { purchaseOrderId: 'po-b', status: 'REJECTED', amount: 9_999, paidAt: null },
    { purchaseOrderId: 'po-c', status: 'APPROVED', amount: 5, paidAt: null }, // PO not ordered → not counted
  ]
  const r = summariseProcurementValue(requisitions, expenses, NOW)
  const stage = (k: string) => r.stages.find((s) => s.key === k)

  it('requested counts submitted requisitions only — not drafts', () => {
    expect(stage('requested')).toMatchObject({ count: 5, value: 50_000 + 30_000 + 95_000 + 210_000 + 40_000 })
  })

  it('approved, ordered and received are distinct measures', () => {
    expect(stage('approved')).toMatchObject({ count: 3, value: 95_000 + 210_000 + 40_000 })
    expect(stage('ordered')).toMatchObject({ count: 2, value: 300_000 })
    expect(stage('received')).toMatchObject({ count: 2, value: 60_000 + 200_000 })
  })

  it('expensed and paid come only from approved expenses on ordered POs', () => {
    expect(stage('expensed')).toMatchObject({ count: 3, value: 260_000 })
    expect(stage('paid')).toMatchObject({ count: 2, value: 210_000 })
    expect(r.expenses).toMatchObject({ approved: 260_000, paid: 210_000, payable: 50_000, pendingApproval: 1_000 })
  })

  it('ordered splits exactly into received + released + open', () => {
    expect(r.orders).toEqual({ ordered: 300_000, received: 260_000, released: 0, open: 40_000, reconciles: true })
  })

  it('open value equals Finance’s open commitment calculation for the same orders', () => {
    const finance = openPoCommitment(requisitions.flatMap((q) => q.purchaseOrders).map((p) => ({ status: p.status, lines: p.lines })))
    expect(r.orders.open).toBe(finance.value)
  })

  it('shows received-not-expensed and expensed-ahead-of-delivery without going negative', () => {
    expect(r.expenses.receivedNotExpensed).toBe(0)
    expect(r.expenses.expensedAheadOfDelivery).toBe(0)
    const ahead2 = summariseProcurementValue(
      [req({ id: 'x', purchaseOrders: [po({ id: 'px', lines: [line(10, 1, 100_000)] })] })],
      [{ purchaseOrderId: 'px', status: 'APPROVED', amount: 50_000, paidAt: null }],
      NOW,
    )
    expect(ahead2.expenses.expensedAheadOfDelivery).toBe(40_000)
    expect(ahead2.expenses.receivedNotExpensed).toBe(0)
  })

  it('finds requests and orders waiting for a decision', () => {
    expect(r.awaitingApproval.requisitions).toEqual({ count: 1, value: 50_000, oldestDays: 12 })
    expect(r.awaitingApproval.purchaseOrders).toEqual({ count: 1, value: 40_000 })
  })

  it('lists delayed and partially delivered orders', () => {
    expect(r.delayed).toHaveLength(1)
    expect(r.delayed[0]).toMatchObject({ poNumber: 'PO-po-a', daysLate: 7, openValue: 40_000, receivedValue: 60_000 })
    expect(r.partiallyDelivered.map((p) => p.poNumber)).toEqual(['PO-po-a'])
  })

  it('does not call an order late when nothing is left to deliver or the date is in the future', () => {
    const none = summariseProcurementValue(
      [req({ id: 'y', purchaseOrders: [po({ id: 'py', status: 'FULLY_RECEIVED', expectedDeliveryDate: ago(30), lines: [line(1, 1, 10)] }), po({ id: 'pz', expectedDeliveryDate: ahead(3) })] })],
      [],
      NOW,
    )
    expect(none.delayed).toEqual([])
  })

  it('per-requisition rows tie back to the totals', () => {
    const sum = (k: 'ordered' | 'received' | 'expensed' | 'paid') => r.requisitions.reduce((t, x) => t + x[k], 0)
    expect(sum('ordered')).toBe(300_000)
    expect(sum('received')).toBe(260_000)
    expect(sum('expensed')).toBe(260_000)
    expect(sum('paid')).toBe(210_000)
  })

  it('has null values — not 0 — for stages with no data', () => {
    const e = summariseProcurementValue([], [], NOW)
    expect(e.stages.every((s) => s.count === 0 && s.value === null)).toBe(true)
    expect(e.orders.reconciles).toBe(true)
    expect(e.awaitingApproval.requisitions.oldestDays).toBeNull()
  })
})
