/**
 * operationsAnalytics.ts — reporting over assets, stocktakes, procurement and
 * inventory.
 *
 * Lifecycle states are read as stored (Asset.status / condition, Stocktake.status,
 * PurchaseOrder.status …); no parallel workflow is invented. Money measures are
 * kept distinct — requested, approved, ordered, received, expensed, paid — and
 * the open-commitment figure is the very one Finance reports, so the two can
 * never disagree or double count. See procurementValueLogic.ts for the formulas.
 */
import 'server-only'
import { subDays } from 'date-fns'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type {
  ApiAssetFilters,
  ApiAssetRegisterReport,
  ApiProcurementPipeline,
  ApiProcurementValueReport,
  ApiStockReport,
  ApiStocktakeReport,
  ApiStocktakeVariance,
} from '@shared/types/reporting-operations'
import { openCommitments } from './financeAnalytics'
import { resolveHolder, summariseRegister, type AssetRow } from './assetRegisterLogic'
import { poValue, summariseProcurementValue } from './procurementValueLogic'
import { STOCKTAKE_STALE_DAYS, summariseStocktakes, type StocktakeInput } from './stocktakeLogic'
import { summariseStock, type StockItem, type StockTransaction } from './stockLevelLogic'
import {
  averageApprovalDays,
  averageDeliveryDays,
  buildPipelineStages,
  summariseVariances,
  type PipelineRequisition,
  type VarianceInput,
} from './operationsLogic'

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const ITEM_CAP = 200

export async function getProcurementPipeline(windowDays = 365): Promise<ApiProcurementPipeline> {
  const since = subDays(new Date(), windowDays)

  const [requisitions, reqByStatus, poByStatus] = await Promise.all([
    prisma.purchaseRequisition.findMany({
      where: { createdAt: { gte: since } },
      select: {
        status: true,
        submittedAt: true,
        approvedAt: true,
        lines: { select: { estimatedTotal: true } },
        rfqs: {
          select: { status: true, quotations: { select: { status: true, total: true } } },
        },
        purchaseOrders: {
          select: {
            status: true,
            total: true,
            orderDate: true,
            goodsReceipts: { select: { receivedAt: true } },
            lines: { select: { quantityOrdered: true, quantityReceived: true, quantityCancelled: true, lineTotal: true } },
          },
        },
      },
    }),
    prisma.purchaseRequisition.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.purchaseOrder.groupBy({
      by: ['status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { total: true },
    }),
  ])

  const reqs: PipelineRequisition[] = requisitions.map((r) => ({
    status: r.status,
    submittedAt: r.submittedAt,
    approvedAt: r.approvedAt,
    estimatedTotal: r.lines.reduce((s, l) => s + num(l.estimatedTotal), 0),
    rfqs: r.rfqs.map((x) => ({
      status: x.status,
      quotations: x.quotations.map((q) => ({ status: q.status, total: num(q.total) })),
    })),
    purchaseOrders: r.purchaseOrders.map((p) => ({
      status: p.status,
      total: num(p.total),
      orderDate: p.orderDate,
      receipts: p.goodsReceipts.map((g) => g.receivedAt),
      // Value actually accepted so far — a part-delivered order is not "received" in full.
      receivedValue: poValue({
        status: p.status,
        lines: p.lines.map((l) => ({
          quantityOrdered: num(l.quantityOrdered),
          quantityReceived: num(l.quantityReceived),
          quantityCancelled: num(l.quantityCancelled),
          lineTotal: num(l.lineTotal),
        })),
      }).received,
    })),
  }))

  return {
    windowDays,
    stages: buildPipelineStages(reqs),
    requisitionsByStatus: reqByStatus.map((r) => ({ status: r.status, count: r._count._all })),
    purchaseOrdersByStatus: poByStatus.map((p) => ({
      status: p.status,
      count: p._count._all,
      value: num(p._sum.total),
    })),
    avgApprovalDays: averageApprovalDays(reqs),
    avgDeliveryDays: averageDeliveryDays(reqs),
    generatedAt: new Date().toISOString(),
  }
}

export async function getStocktakeVariance(academicYear: string): Promise<ApiStocktakeVariance> {
  const [stocktakes, linesCounted, variances] = await Promise.all([
    prisma.stocktake.count({ where: { academicYear } }),
    prisma.stocktakeLine.count({ where: { stocktake: { academicYear } } }),
    prisma.inventoryVariance.findMany({
      where: { stocktake: { academicYear } },
      select: {
        id: true,
        varianceQuantity: true,
        varianceType: true,
        status: true,
        reason: true,
        stocktake: {
          select: {
            stocktakeNumber: true,
            room: { select: { name: true, building: { select: { name: true } } } },
          },
        },
        stocktakeLine: {
          select: { inventoryItem: { select: { name: true } }, asset: { select: { name: true } } },
        },
      },
    }),
  ])

  const rows: VarianceInput[] = variances.map((v) => ({
    id: v.id,
    stocktakeNumber: v.stocktake.stocktakeNumber,
    building: v.stocktake.room?.building.name ?? 'Unassigned',
    room: v.stocktake.room?.name ?? 'Whole school',
    itemName: v.stocktakeLine.inventoryItem?.name ?? v.stocktakeLine.asset?.name ?? 'Item',
    type: v.varianceType,
    quantity: num(v.varianceQuantity),
    status: v.status,
    reason: v.reason,
  }))

  const summary = summariseVariances(rows, linesCounted)
  return {
    academicYear,
    stocktakes,
    ...summary,
    items: summary.items.slice(0, ITEM_CAP),
    generatedAt: new Date().toISOString(),
  }
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

const personName = (p: { firstName: string; lastName: string } | null | undefined): string | null =>
  p ? `${p.firstName} ${p.lastName}`.trim() : null

const DAY_MS = 86_400_000
const startOfDay = (d: string) => new Date(`${d}T00:00:00.000Z`)
const endOfDay = (d: string) => new Date(`${d}T23:59:59.999Z`)

// ─── Asset register ──────────────────────────────────────────────────────────

const ASSET_ROW_CAP = 20_000

export interface AssetReportAccess {
  /** assets.viewAdvances — outstanding procurement advances. */
  advances: boolean
}

/**
 * The asset register as a report: what the school owns, where it is, who is
 * responsible, and what needs attention. Valuation follows the Assets screen's
 * rule (not disposed). Every figure is a roll-up of the same filtered rows.
 */
export async function getAssetRegisterReport(
  filters: Partial<ApiAssetFilters>,
  access: AssetReportAccess,
): Promise<ApiAssetRegisterReport> {
  const now = new Date()
  const f: ApiAssetFilters = {
    category: filters.category ?? null,
    status: filters.status ?? null,
    condition: filters.condition ?? null,
    departmentId: filters.departmentId ?? null,
    buildingId: filters.buildingId ?? null,
    roomId: filters.roomId ?? null,
    custodianUid: filters.custodianUid ?? null,
    from: filters.from ?? null,
    to: filters.to ?? null,
  }

  const and: Prisma.AssetWhereInput[] = []
  if (f.category) and.push({ category: f.category as never })
  if (f.status) and.push({ status: f.status as never })
  if (f.condition) and.push({ condition: f.condition as never })
  if (f.departmentId) and.push({ OR: [{ departmentId: f.departmentId }, { roomRef: { departmentId: f.departmentId } }] })
  if (f.buildingId) and.push({ roomRef: { buildingId: f.buildingId } })
  if (f.roomId) and.push({ roomId: f.roomId })
  if (f.custodianUid) {
    and.push({
      OR: [
        { assignments: { some: { status: 'ACTIVE', staff: { uid: f.custodianUid } } } },
        { roomRef: { custodianUid: f.custodianUid } },
      ],
    })
  }
  if (f.from) and.push({ acquisitionDate: { gte: startOfDay(f.from) } })
  if (f.to) and.push({ acquisitionDate: { lte: endOfDay(f.to) } })

  const [assets, pending, advances] = await Promise.all([
    prisma.asset.findMany({
      where: and.length ? { AND: and } : {},
      select: {
        id: true,
        name: true,
        assetTag: true,
        category: true,
        status: true,
        condition: true,
        quantity: true,
        acquisitionCost: true,
        warrantyExpiry: true,
        location: true,
        roomId: true,
        roomRef: {
          select: {
            name: true,
            building: { select: { name: true } },
            custodian: { select: { uid: true, firstName: true, lastName: true } },
          },
        },
        departmentRef: { select: { name: true } },
        assignments: {
          where: { status: 'ACTIVE' },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          select: {
            assignedToType: true,
            departmentOrRoom: true,
            staff: { select: { uid: true, firstName: true, lastName: true } },
            departmentRef: { select: { name: true } },
            roomRef: { select: { name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
      take: ASSET_ROW_CAP,
    }),
    prisma.assetRequest.count({ where: { status: 'PENDING' } }),
    access.advances
      ? prisma.assetAdvance.aggregate({ _sum: { amount: true }, where: { status: 'PENDING' } })
      : Promise.resolve(null),
  ])

  const rows: AssetRow[] = assets.map((a) => {
    const active = a.assignments[0] ?? null
    return {
      id: a.id,
      name: a.name,
      assetTag: a.assetTag,
      category: a.category,
      status: a.status,
      condition: a.condition,
      quantity: a.quantity,
      acquisitionCost: a.acquisitionCost === null ? null : num(a.acquisitionCost),
      warrantyExpiry: a.warrantyExpiry,
      buildingName: a.roomRef?.building.name ?? null,
      roomName: a.roomRef?.name ?? null,
      roomId: a.roomId,
      departmentName: a.departmentRef?.name ?? null,
      locationText: a.location,
      holder: resolveHolder(
        active
          ? {
              type: active.assignedToType,
              staffName: personName(active.staff),
              staffUid: active.staff?.uid ?? null,
              departmentName: active.departmentRef?.name ?? null,
              roomName: active.roomRef?.name ?? null,
              legacyText: active.departmentOrRoom,
            }
          : null,
        personName(a.roomRef?.custodian),
        a.roomRef?.custodian?.uid ?? null,
      ),
    }
  })

  return {
    generatedAt: now.toISOString(),
    filters: f,
    ...summariseRegister(rows, now),
    rowsCapped: assets.length >= ASSET_ROW_CAP,
    requests: {
      pending,
      outstandingAdvances: advances ? num(advances._sum.amount) : null,
    },
  }
}

// ─── Stocktakes ──────────────────────────────────────────────────────────────

export interface StocktakeReportFilters {
  academicYear: string
  term?: number
  departmentId?: string
  roomId?: string
  status?: string
}

export async function getStocktakeReport(filters: StocktakeReportFilters): Promise<ApiStocktakeReport> {
  const now = new Date()
  const where: Prisma.StocktakeWhereInput = {
    academicYear: filters.academicYear,
    ...(filters.term !== undefined ? { term: filters.term } : {}),
    ...(filters.roomId ? { roomId: filters.roomId } : {}),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.departmentId ? { OR: [{ departmentId: filters.departmentId }, { room: { departmentId: filters.departmentId } }] } : {}),
  }
  const roomWhere: Prisma.RoomWhereInput = {
    isActive: true,
    ...(filters.roomId ? { id: filters.roomId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
  }

  const [stocktakes, rooms] = await Promise.all([
    prisma.stocktake.findMany({
      where,
      select: {
        id: true,
        stocktakeNumber: true,
        term: true,
        status: true,
        roomId: true,
        startedByUid: true,
        custodianUid: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        room: { select: { name: true, building: { select: { name: true } } } },
        department: { select: { name: true } },
        lines: { select: { expectedQuantity: true, actualQuantity: true } },
        variances: { select: { status: true, varianceType: true, varianceQuantity: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.room.findMany({ where: roomWhere, select: { id: true, name: true, building: { select: { name: true } } } }),
  ])

  const uids = Array.from(new Set(stocktakes.flatMap((s) => [s.startedByUid, s.custodianUid]).filter((u): u is string => !!u)))
  const staff = uids.length
    ? await prisma.staffProfile.findMany({ where: { uid: { in: uids } }, select: { uid: true, firstName: true, lastName: true } })
    : []
  const nameOf = new Map(staff.map((p) => [p.uid, `${p.firstName} ${p.lastName}`.trim()]))

  const inputs: StocktakeInput[] = stocktakes.map((s) => ({
    id: s.id,
    stocktakeNumber: s.stocktakeNumber,
    term: s.term,
    status: s.status,
    roomId: s.roomId,
    building: s.room?.building.name ?? null,
    room: s.room?.name ?? null,
    department: s.department?.name ?? null,
    responsible: (s.startedByUid && nameOf.get(s.startedByUid)) || (s.custodianUid && nameOf.get(s.custodianUid)) || null,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    createdAt: s.createdAt,
    lines: s.lines.map((l) => ({ expected: num(l.expectedQuantity), actual: num(l.actualQuantity) })),
    variances: s.variances.map((v) => ({ status: v.status, type: v.varianceType, quantity: num(v.varianceQuantity) })),
  }))

  return {
    generatedAt: now.toISOString(),
    academicYear: filters.academicYear,
    term: filters.term ?? null,
    departmentId: filters.departmentId ?? null,
    roomId: filters.roomId ?? null,
    staleAfterDays: STOCKTAKE_STALE_DAYS,
    ...summariseStocktakes(
      inputs,
      rooms.map((r) => ({ id: r.id, label: `${r.building.name} · ${r.name}` })),
      now,
    ),
  }
}

// ─── Procurement value lifecycle ─────────────────────────────────────────────

export interface ProcurementValueFilters {
  from?: string
  to?: string
  /** Fallback window when no dates are given. */
  days: number
  departmentId?: string
}

export async function getProcurementValue(filters: ProcurementValueFilters): Promise<ApiProcurementValueReport> {
  const now = new Date()
  const to = filters.to ? endOfDay(filters.to) : now
  const from = filters.from ? startOfDay(filters.from) : subDays(to, filters.days)

  const requisitions = await prisma.purchaseRequisition.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    },
    select: {
      id: true,
      requisitionNumber: true,
      status: true,
      submittedAt: true,
      createdAt: true,
      department: { select: { name: true } },
      lines: { select: { estimatedTotal: true } },
      purchaseOrders: {
        select: {
          id: true,
          poNumber: true,
          status: true,
          approvedAt: true,
          expectedDeliveryDate: true,
          supplier: { select: { name: true } },
          lines: { select: { quantityOrdered: true, quantityReceived: true, quantityCancelled: true, lineTotal: true } },
        },
      },
    },
  })

  const poIds = requisitions.flatMap((r) => r.purchaseOrders.map((p) => p.id))
  const [expenses, openNow] = await Promise.all([
    poIds.length
      ? prisma.expense.findMany({
          where: { purchaseOrderId: { in: poIds } },
          select: { purchaseOrderId: true, status: true, amount: true, paidAt: true },
        })
      : Promise.resolve([]),
    openCommitments(),
  ])

  const summary = summariseProcurementValue(
    requisitions.map((r) => ({
      id: r.id,
      requisitionNumber: r.requisitionNumber,
      department: r.department.name,
      status: r.status,
      submittedAt: r.submittedAt,
      createdAt: r.createdAt,
      estimatedTotal: r.lines.reduce((t, l) => t + num(l.estimatedTotal), 0),
      purchaseOrders: r.purchaseOrders.map((p) => ({
        id: p.id,
        poNumber: p.poNumber,
        supplier: p.supplier.name,
        status: p.status,
        approvedAt: p.approvedAt,
        expectedDeliveryDate: p.expectedDeliveryDate,
        lines: p.lines.map((l) => ({
          quantityOrdered: num(l.quantityOrdered),
          quantityReceived: num(l.quantityReceived),
          quantityCancelled: num(l.quantityCancelled),
          lineTotal: num(l.lineTotal),
        })),
      })),
    })),
    expenses.flatMap((e) => (e.purchaseOrderId ? [{ purchaseOrderId: e.purchaseOrderId, status: e.status, amount: num(e.amount), paidAt: e.paidAt }] : [])),
    now,
  )

  return {
    generatedAt: now.toISOString(),
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    departmentId: filters.departmentId ?? null,
    ...summary,
    openNow,
  }
}

// ─── Inventory stock levels and movements ────────────────────────────────────

export interface StockReportFilters {
  days: number
  from?: string
  to?: string
  category?: string
  departmentId?: string
  roomId?: string
}

export async function getStockReport(filters: StockReportFilters): Promise<ApiStockReport> {
  const now = new Date()
  const to = filters.to ? endOfDay(filters.to) : now
  const from = filters.from ? startOfDay(filters.from) : new Date(to.getTime() - (filters.days - 1) * DAY_MS)

  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true, ...(filters.category ? { category: filters.category } : {}) },
    select: { id: true, itemCode: true, name: true, category: true, unitOfMeasure: true, reorderLevel: true, reorderQuantity: true },
    orderBy: { name: 'asc' },
  })
  const ids = items.map((i) => i.id)
  const rawTx = ids.length
    ? await prisma.inventoryTransaction.findMany({
        where: { inventoryItemId: { in: ids } },
        select: {
          id: true,
          inventoryItemId: true,
          transactionType: true,
          quantity: true,
          createdAt: true,
          sourceRoomId: true,
          destinationRoomId: true,
          departmentId: true,
          reason: true,
          sourceRoom: { select: { name: true } },
          destinationRoom: { select: { name: true } },
          department: { select: { name: true } },
        },
      })
    : []

  const all: (StockTransaction & { departmentId: string | null })[] = rawTx.map((t) => ({
    id: t.id,
    inventoryItemId: t.inventoryItemId,
    transactionType: t.transactionType,
    quantity: num(t.quantity),
    createdAt: t.createdAt,
    sourceRoomId: t.sourceRoomId,
    destinationRoomId: t.destinationRoomId,
    sourceRoom: t.sourceRoom?.name ?? null,
    destinationRoom: t.destinationRoom?.name ?? null,
    department: t.department?.name ?? null,
    departmentId: t.departmentId,
    reason: t.reason,
  }))

  // Balances are school-wide; the department and room filters narrow the movements only.
  const windowTx = all.filter(
    (t) =>
      t.createdAt >= from &&
      t.createdAt <= to &&
      (!filters.departmentId || t.departmentId === filters.departmentId) &&
      (!filters.roomId || t.sourceRoomId === filters.roomId || t.destinationRoomId === filters.roomId),
  )

  const stockItems: StockItem[] = items.map((i) => ({
    id: i.id,
    itemCode: i.itemCode,
    name: i.name,
    category: i.category,
    unit: i.unitOfMeasure,
    reorderLevel: i.reorderLevel === null ? null : num(i.reorderLevel),
    reorderQuantity: i.reorderQuantity === null ? null : num(i.reorderQuantity),
  }))

  return {
    generatedAt: now.toISOString(),
    days: filters.days,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    filters: { category: filters.category ?? null, departmentId: filters.departmentId ?? null, roomId: filters.roomId ?? null },
    ...summariseStock(stockItems, all, windowTx, from, to),
  }
}
