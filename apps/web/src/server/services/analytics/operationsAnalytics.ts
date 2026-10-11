/**
 * operationsAnalytics.ts — reporting over procurement and stocktakes.
 * (Asset valuation / status counts already exist in assetService.getInventoryStats
 * and are reused by the UI rather than duplicated here.)
 */
import 'server-only'
import { subDays } from 'date-fns'
import { prisma } from '@/lib/prisma'
import type { ApiProcurementPipeline, ApiStocktakeVariance } from '@shared/types/reporting-operations'
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
