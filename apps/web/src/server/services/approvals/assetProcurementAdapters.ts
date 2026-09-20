/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvals/assetProcurementAdapters.ts
 * [PURPOSE]: Hub adapters for Assets & Procurement — asset requests,
 *   purchase requisitions and purchase orders. All three delegate to the
 *   existing services, which already enforce their own status guards,
 *   self-approval rules and budget reservation.
 */

import 'server-only'
import type { AssetRequestStatus, ProcurementStatus, PurchaseOrderStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ApprovalStatus } from '@shared/constants/approvals'
import * as assetService from '@/server/services/assetService'
import * as procurementService from '@/server/services/procurementService'
import type { AdapterItem, ApprovalAdapter } from './types'
import {
  dateFilter, detailList, emptyCounts, expandStatuses, humanize,
  lookupNames, makeItem, money, person, shortDate, tally,
} from './helpers'

// ─── ASSET REQUESTS ───────────────────────────────────────

const ASSET_STATUS: Record<ApprovalStatus, readonly AssetRequestStatus[]> = {
  PENDING: ['PENDING'],
  APPROVED: ['APPROVED', 'FULFILLED'],
  REJECTED: ['REJECTED'],
  CANCELLED: [],
  EXPIRED: [],
}

const assetInclude = {
  departmentRef: { select: { name: true } },
} satisfies Prisma.AssetRequestInclude

type AssetRow = Prisma.AssetRequestGetPayload<{ include: typeof assetInclude }>

function assetItem(r: AssetRow, names: Map<string, string>): AdapterItem {
  return makeItem('asset_request', {
    sourceId: r.id,
    title: r.title,
    summary: r.justification,
    status: r.status === 'PENDING' ? 'PENDING' : r.status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
    sourceStatus: r.status,
    requester: person(r.requestedByUid, names.get(r.requestedByUid) ?? ''),
    details: detailList([
      ['Request', r.title],
      ['Category', humanize(r.category)],
      ['Quantity', r.quantity],
      ['Department', r.departmentRef?.name ?? r.department],
      ['Justification', r.justification],
    ]),
    createdAt: r.createdAt,
    decidedAt: r.reviewedAt,
    decidedBy: r.reviewedByUid ? person(r.reviewedByUid, names.get(r.reviewedByUid) ?? '') : null,
    decisionNotes: r.reviewNotes,
  })
}

export const assetRequestAdapter: ApprovalAdapter = {
  source: 'asset_request',

  async list(q) {
    const statuses = expandStatuses(q.statuses, ASSET_STATUS)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.assetRequest.findMany({
      where: {
        status: { in: statuses },
        ...(q.requesterUid ? { requestedByUid: q.requesterUid } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: assetInclude,
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.flatMap((r) => [r.requestedByUid, r.reviewedByUid]))
    return rows.map((r) => assetItem(r, names))
  },

  async counts(requesterUid) {
    const rows = await prisma.assetRequest.groupBy({
      by: ['status'],
      where: requesterUid ? { requestedByUid: requesterUid } : {},
      _count: { _all: true },
    })
    return rows.length ? tally(rows, ASSET_STATUS) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.assetRequest.findUnique({ where: { id }, include: assetInclude })
    if (!r) return null
    return assetItem(r, await lookupNames([r.requestedByUid, r.reviewedByUid]))
  },

  async approve(id, actor, input) {
    await assetService.approveAssetRequest(
      id,
      input.notes ? { reviewNotes: input.notes } : {},
      actor.uid,
      actor.role,
    )
  },

  async reject(id, actor, input) {
    await assetService.rejectAssetRequest(id, { reviewNotes: input.notes }, actor.uid, actor.role)
  },
}

// ─── PURCHASE REQUISITIONS ────────────────────────────────

const REQUISITION_STATUS: Record<ApprovalStatus, readonly ProcurementStatus[]> = {
  PENDING: ['SUBMITTED', 'UNDER_REVIEW'],
  APPROVED: ['APPROVED', 'CLOSED'],
  REJECTED: ['REJECTED', 'RETURNED'],
  CANCELLED: ['CANCELLED'],
  EXPIRED: [],
}

const requisitionInclude = {
  department: { select: { name: true } },
  lines: { select: { description: true, estimatedTotal: true } },
} satisfies Prisma.PurchaseRequisitionInclude

type RequisitionRow = Prisma.PurchaseRequisitionGetPayload<{ include: typeof requisitionInclude }>

function unifiedRequisitionStatus(s: ProcurementStatus): ApprovalStatus {
  if (s === 'SUBMITTED' || s === 'UNDER_REVIEW') return 'PENDING'
  if (s === 'APPROVED' || s === 'CLOSED') return 'APPROVED'
  if (s === 'CANCELLED') return 'CANCELLED'
  return 'REJECTED'
}

function requisitionItem(r: RequisitionRow, names: Map<string, string>): AdapterItem {
  const status = unifiedRequisitionStatus(r.status)
  const total = r.lines.reduce((sum, l) => sum + Number(l.estimatedTotal), 0)
  const decidedAt = status === 'PENDING' ? null : (r.approvedAt ?? r.rejectedAt ?? r.reviewedAt)
  const deciderUid = status === 'PENDING' ? null : (r.approvedByUid ?? r.rejectedByUid ?? r.reviewedByUid)
  const lineSummary = r.lines
    .slice(0, 4)
    .map((l) => l.description)
    .join('; ')
  return makeItem('requisition', {
    sourceId: r.id,
    title: `${r.requisitionNumber} — ${r.purpose}`,
    summary: r.justification ?? r.purpose,
    status,
    sourceStatus: r.status,
    requester: person(r.requestedByUid, names.get(r.requestedByUid) ?? ''),
    amount: total,
    details: detailList([
      ['Requisition no.', r.requisitionNumber],
      ['Department', r.department.name],
      ['Purpose', r.purpose],
      ['Justification', r.justification],
      ['Priority', r.isEmergency ? 'Emergency' : 'Standard'],
      ['Line items', r.lines.length ? `${r.lines.length}: ${lineSummary}${r.lines.length > 4 ? '…' : ''}` : null],
      ['Estimated total', money(total)],
      ['Submitted', shortDate(r.submittedAt)],
    ]),
    createdAt: r.submittedAt ?? r.createdAt,
    decidedAt,
    decidedBy: deciderUid ? person(deciderUid, names.get(deciderUid) ?? '') : null,
    decisionNotes: r.reviewNote,
  })
}

export const requisitionAdapter: ApprovalAdapter = {
  source: 'requisition',

  async list(q) {
    const statuses = expandStatuses(q.statuses, REQUISITION_STATUS)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.purchaseRequisition.findMany({
      where: {
        status: { in: statuses },
        ...(q.requesterUid ? { requestedByUid: q.requesterUid } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: requisitionInclude,
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(
      rows.flatMap((r) => [r.requestedByUid, r.approvedByUid, r.rejectedByUid, r.reviewedByUid]),
    )
    return rows.map((r) => requisitionItem(r, names))
  },

  async counts(requesterUid) {
    const rows = await prisma.purchaseRequisition.groupBy({
      by: ['status'],
      where: requesterUid ? { requestedByUid: requesterUid } : {},
      _count: { _all: true },
    })
    return rows.length ? tally(rows, REQUISITION_STATUS) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.purchaseRequisition.findUnique({ where: { id }, include: requisitionInclude })
    // A DRAFT has not been submitted, so it is not an approval item.
    if (!r || r.status === 'DRAFT') return null
    const names = await lookupNames([r.requestedByUid, r.approvedByUid, r.rejectedByUid, r.reviewedByUid])
    return requisitionItem(r, names)
  },

  async approve(id, actor, input) {
    await procurementService.approveRequisition(
      id,
      input.notes ? { reviewNote: input.notes } : {},
      actor.uid,
      actor.role,
    )
  },

  async reject(id, actor, input) {
    await procurementService.rejectRequisition(id, { reviewNote: input.notes }, actor.uid, actor.role)
  },

  async return(id, actor, input) {
    await procurementService.returnRequisition(id, { reviewNote: input.notes }, actor.uid, actor.role)
  },

  async cancel(id, actor) {
    await procurementService.cancelRequisition(id, actor.uid, actor.role)
  },
}

// ─── PURCHASE ORDERS ──────────────────────────────────────

// procurementService.approvePurchaseOrder() accepts DRAFT as well as
// PENDING_APPROVAL and nothing in the codebase ever moves a PO to
// PENDING_APPROVAL, so a freshly created DRAFT PO is the real "awaiting
// approval" state.
const PO_STATUS: Record<ApprovalStatus, readonly PurchaseOrderStatus[]> = {
  PENDING: ['DRAFT', 'PENDING_APPROVAL'],
  APPROVED: ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CLOSED_WITH_VARIANCE'],
  REJECTED: [],
  CANCELLED: ['CANCELLED'],
  EXPIRED: [],
}

const poInclude = {
  supplier: { select: { name: true } },
  purchaseRequisition: { select: { requisitionNumber: true, purpose: true } },
} satisfies Prisma.PurchaseOrderInclude

type PoRow = Prisma.PurchaseOrderGetPayload<{ include: typeof poInclude }>

function poItem(r: PoRow, names: Map<string, string>): AdapterItem {
  const status: ApprovalStatus =
    r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL' ? 'PENDING' : r.status === 'CANCELLED' ? 'CANCELLED' : 'APPROVED'
  return makeItem('purchase_order', {
    sourceId: r.id,
    title: `${r.poNumber} — ${r.supplier.name}`,
    summary: r.purchaseRequisition.purpose,
    status,
    sourceStatus: r.status,
    requester: person(r.createdByUid, names.get(r.createdByUid) ?? ''),
    amount: Number(r.total),
    details: detailList([
      ['PO number', r.poNumber],
      ['Supplier', r.supplier.name],
      ['From requisition', r.purchaseRequisition.requisitionNumber],
      ['Subtotal', money(r.subtotal)],
      ['Tax', money(r.tax)],
      ['Total', money(r.total)],
      ['Expected delivery', shortDate(r.expectedDeliveryDate)],
      ['Notes', r.notes],
    ]),
    createdAt: r.createdAt,
    decidedAt: status === 'APPROVED' ? r.approvedAt : null,
    decidedBy: r.approvedByUid && status === 'APPROVED' ? person(r.approvedByUid, names.get(r.approvedByUid) ?? '') : null,
  })
}

export const purchaseOrderAdapter: ApprovalAdapter = {
  source: 'purchase_order',

  async list(q) {
    const statuses = expandStatuses(q.statuses, PO_STATUS)
    if (statuses.length === 0) return []
    const createdAt = dateFilter(q)
    const rows = await prisma.purchaseOrder.findMany({
      where: {
        status: { in: statuses },
        ...(q.requesterUid ? { createdByUid: q.requesterUid } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      include: poInclude,
      orderBy: { createdAt: q.order },
      take: q.take,
    })
    const names = await lookupNames(rows.flatMap((r) => [r.createdByUid, r.approvedByUid]))
    return rows.map((r) => poItem(r, names))
  },

  async counts(requesterUid) {
    const rows = await prisma.purchaseOrder.groupBy({
      by: ['status'],
      where: requesterUid ? { createdByUid: requesterUid } : {},
      _count: { _all: true },
    })
    return rows.length ? tally(rows, PO_STATUS) : emptyCounts()
  },

  async get(id) {
    const r = await prisma.purchaseOrder.findUnique({ where: { id }, include: poInclude })
    if (!r) return null
    return poItem(r, await lookupNames([r.createdByUid, r.approvedByUid]))
  },

  async approve(id, actor) {
    await procurementService.approvePurchaseOrder(id, actor.uid, actor.role)
  },

  // A PO has no REJECTED state — declining one cancels it (and releases the
  // budget commitment, which cancelPurchaseOrder handles).
  async reject(id, actor) {
    await procurementService.cancelPurchaseOrder(id, actor.uid, actor.role)
  },
}
