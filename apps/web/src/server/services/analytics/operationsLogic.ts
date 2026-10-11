/**
 * Pure procurement-pipeline and stocktake-variance maths (no database access).
 */
import type {
  ApiProcurementStage,
  ApiVarianceItemRow,
  ApiVarianceRoomRow,
} from '@shared/types/reporting-operations'
import { daysBetween, mean, ratioPct, round } from '@/server/services/reporting/kpi'

// ─── PROCUREMENT ─────────────────────────────────────────────────────────────

export interface PipelineRequisition {
  status: string
  submittedAt: Date | null
  approvedAt: Date | null
  estimatedTotal: number
  rfqs: { status: string; quotations: { status: string; total: number }[] }[]
  purchaseOrders: {
    status: string
    total: number
    orderDate: Date | null
    receipts: Date[]
  }[]
}

const NOT_RAISED_PO = new Set(['DRAFT', 'CANCELLED'])
const RECEIVED_PO = new Set(['PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CLOSED_WITH_VARIANCE'])

export function buildPipelineStages(reqs: readonly PipelineRequisition[]): ApiProcurementStage[] {
  const submitted = reqs.filter((r) => r.submittedAt !== null || !['DRAFT', 'CANCELLED'].includes(r.status))
  const approved = submitted.filter((r) => r.status === 'APPROVED' || r.status === 'CLOSED')
  const withRfq = approved.filter((r) => r.rfqs.some((x) => x.status !== 'DRAFT'))
  const withQuote = withRfq.filter((r) => r.rfqs.some((x) => x.quotations.length > 0))
  const pos = approved.flatMap((r) => r.purchaseOrders).filter((p) => !NOT_RAISED_PO.has(p.status))
  const received = pos.filter((p) => RECEIVED_PO.has(p.status))

  const sumEst = (rs: readonly PipelineRequisition[]) => round(rs.reduce((s, r) => s + r.estimatedTotal, 0), 2)

  const selectedQuoteValue = withQuote.reduce((s, r) => {
    const selected = r.rfqs.flatMap((x) => x.quotations).filter((q) => q.status === 'SELECTED')
    return s + selected.reduce((t, q) => t + q.total, 0)
  }, 0)

  return [
    { key: 'requisitions', label: 'Requisitions submitted', count: submitted.length, value: submitted.length ? sumEst(submitted) : null },
    { key: 'approved', label: 'Approved', count: approved.length, value: approved.length ? sumEst(approved) : null },
    { key: 'rfq', label: 'RFQ issued', count: withRfq.length, value: withRfq.length ? sumEst(withRfq) : null },
    { key: 'quotations', label: 'Quotations received', count: withQuote.length, value: selectedQuoteValue > 0 ? round(selectedQuoteValue, 2) : null },
    { key: 'purchaseOrders', label: 'Purchase orders raised', count: pos.length, value: pos.length ? round(pos.reduce((s, p) => s + p.total, 0), 2) : null },
    { key: 'received', label: 'Goods received', count: received.length, value: received.length ? round(received.reduce((s, p) => s + p.total, 0), 2) : null },
  ]
}

export function averageApprovalDays(reqs: readonly PipelineRequisition[]): number | null {
  const days = reqs
    .filter((r) => r.submittedAt && r.approvedAt)
    .map((r) => daysBetween(r.submittedAt as Date, r.approvedAt as Date))
    .filter((d) => d >= 0)
  return mean(days)
}

export function averageDeliveryDays(reqs: readonly PipelineRequisition[]): number | null {
  const days: number[] = []
  for (const po of reqs.flatMap((r) => r.purchaseOrders)) {
    if (!po.orderDate || po.receipts.length === 0) continue
    const first = po.receipts.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b))
    const d = daysBetween(po.orderDate, first)
    if (d >= 0) days.push(d)
  }
  return mean(days)
}

// ─── STOCKTAKE VARIANCE ──────────────────────────────────────────────────────

export interface VarianceInput {
  id: string
  stocktakeNumber: string
  building: string
  room: string
  itemName: string
  type: 'SHORTAGE' | 'SURPLUS'
  /** Absolute quantity of the variance. */
  quantity: number
  status: string
  reason: string | null
}

const RESOLVED_STATUSES = new Set(['RESOLVED', 'WRITTEN_OFF'])

export function isResolved(status: string): boolean {
  return RESOLVED_STATUSES.has(status)
}

export function summariseVariances(rows: readonly VarianceInput[], linesCounted: number) {
  let shortageCount = 0
  let surplusCount = 0
  let shortageQty = 0
  let surplusQty = 0
  let resolved = 0
  const rooms = new Map<string, ApiVarianceRoomRow>()

  for (const v of rows) {
    const qty = Math.abs(v.quantity)
    if (v.type === 'SHORTAGE') {
      shortageCount += 1
      shortageQty += qty
    } else {
      surplusCount += 1
      surplusQty += qty
    }
    const done = isResolved(v.status)
    if (done) resolved += 1

    const key = `${v.building}\u0000${v.room}`
    const row = rooms.get(key) ?? { building: v.building, room: v.room, open: 0, resolved: 0, shortageQty: 0, surplusQty: 0 }
    if (done) row.resolved += 1
    else row.open += 1
    if (v.type === 'SHORTAGE') row.shortageQty += qty
    else row.surplusQty += qty
    rooms.set(key, row)
  }

  const items: ApiVarianceItemRow[] = [...rows]
    .sort((a, b) => Number(isResolved(a.status)) - Number(isResolved(b.status)) || Math.abs(b.quantity) - Math.abs(a.quantity))
    .map((v) => ({
      varianceId: v.id,
      stocktakeNumber: v.stocktakeNumber,
      building: v.building,
      room: v.room,
      itemName: v.itemName,
      varianceType: v.type,
      quantity: Math.abs(v.quantity),
      status: v.status,
      reason: v.reason,
    }))

  return {
    totalVariances: rows.length,
    shortageCount,
    surplusCount,
    shortageQty: round(shortageQty, 2),
    surplusQty: round(surplusQty, 2),
    unresolved: rows.length - resolved,
    resolved,
    varianceRate: ratioPct(rows.length, linesCounted),
    byRoom: Array.from(rooms.values()).sort((a, b) => b.open - a.open || a.building.localeCompare(b.building) || a.room.localeCompare(b.room)),
    items,
  }
}
