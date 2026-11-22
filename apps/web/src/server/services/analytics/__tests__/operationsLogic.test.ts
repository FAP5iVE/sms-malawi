import { describe, it, expect } from 'vitest'
import {
  buildPipelineStages,
  averageApprovalDays,
  averageDeliveryDays,
  summariseVariances,
  type PipelineRequisition,
  type VarianceInput,
} from '../operationsLogic'

const d = (s: string) => new Date(s)

const reqs: PipelineRequisition[] = [
  { status: 'DRAFT', submittedAt: null, approvedAt: null, estimatedTotal: 999, rfqs: [], purchaseOrders: [] },
  { status: 'UNDER_REVIEW', submittedAt: d('2026-09-01'), approvedAt: null, estimatedTotal: 1000, rfqs: [], purchaseOrders: [] },
  {
    status: 'APPROVED', submittedAt: d('2026-09-01'), approvedAt: d('2026-09-05'), estimatedTotal: 2000,
    rfqs: [{ status: 'ISSUED', quotations: [{ status: 'SELECTED', total: 1900 }, { status: 'REJECTED', total: 2500 }] }],
    purchaseOrders: [{ status: 'APPROVED', total: 1900, orderDate: d('2026-09-10'), receipts: [] }],
  },
  {
    status: 'CLOSED', submittedAt: d('2026-09-02'), approvedAt: d('2026-09-04'), estimatedTotal: 3000,
    rfqs: [{ status: 'CLOSED', quotations: [{ status: 'SELECTED', total: 2800 }] }],
    purchaseOrders: [{ status: 'FULLY_RECEIVED', total: 2800, orderDate: d('2026-09-06'), receipts: [d('2026-09-12'), d('2026-09-09')] }],
  },
]

describe('procurement pipeline', () => {
  it('counts each stage from real statuses and excludes drafts', () => {
    const s = buildPipelineStages(reqs)
    expect(s.map((x) => x.count)).toEqual([3, 2, 2, 2, 2, 1])
    expect(s[0]?.value).toBe(6000)
    expect(s[3]?.value).toBe(4700)
    expect(s[5]?.value).toBe(2800)
  })

  it('returns null values rather than 0 for empty stages', () => {
    const s = buildPipelineStages([])
    expect(s.every((x) => x.count === 0 && x.value === null)).toBe(true)
  })

  it('computes approval and delivery cycle time', () => {
    expect(averageApprovalDays(reqs)).toBe(3)
    expect(averageDeliveryDays(reqs)).toBe(3)
    expect(averageApprovalDays([])).toBeNull()
  })
})

describe('stocktake variance', () => {
  const rows: VarianceInput[] = [
    { id: '1', stocktakeNumber: 'ST-1', building: 'Main', room: 'Lab', itemName: 'Beaker', type: 'SHORTAGE', quantity: -4, status: 'OPEN', reason: null },
    { id: '2', stocktakeNumber: 'ST-1', building: 'Main', room: 'Lab', itemName: 'Flask', type: 'SURPLUS', quantity: 2, status: 'RESOLVED', reason: 'miscount' },
    { id: '3', stocktakeNumber: 'ST-2', building: 'Annex', room: 'Store', itemName: 'Chalk', type: 'SHORTAGE', quantity: -10, status: 'INVESTIGATING', reason: null },
  ]

  it('separates shortage/surplus and resolved/unresolved', () => {
    const r = summariseVariances(rows, 20)
    expect(r.shortageCount).toBe(2)
    expect(r.shortageQty).toBe(14)
    expect(r.surplusQty).toBe(2)
    expect(r.unresolved).toBe(2)
    expect(r.resolved).toBe(1)
    expect(r.varianceRate).toBe(15)
    expect(r.items[0]?.itemName).toBe('Chalk')
    expect(r.items[2]?.status).toBe('RESOLVED')
    expect(r.byRoom[0]?.open).toBe(1)
  })

  it('variance rate is null when nothing was counted', () => {
    expect(summariseVariances([], 0).varianceRate).toBeNull()
  })
})
