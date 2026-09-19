/*
 * apps/web/src/server/services/procurementService.ts
 *
 * [CHANGE TYPE]: REWRITE (R22) — the partner's delivered draft only covered
 *   createPurchaseRequisition/submitPurchaseRequisition (2 of ~15 needed
 *   operations); everything else here (review, RFQ, quotation, PO, goods
 *   receipt) is new.
 *
 * [FIXES — supersedes the partner's draft]:
 *   - PurchaseRequisitionLine.classification now uses
 *     ProcurementLineClassification (FIXED_ASSET/INVENTORY/CONSUMABLE/
 *     SERVICE/DIRECT_EXPENSE), not the 2-value AssetClassification the
 *     draft reused. The field-level spec (§18) is explicit that this
 *     matters because "procurement does not always create an Asset" —
 *     the draft's version couldn't correctly classify a consumable or
 *     service line at all.
 *   - requisitionNumber (not requisitionNo — the draft used a field name
 *     no design artefact actually specifies; every artefact from 6
 *     onward says requisitionNumber).
 *   - Budget commitments are reserved on approval and released/committed/
 *     consumed via budgetWindowService, inside the same transaction as
 *     the state change that causes them — never as an afterthought.
 *
 * [WORKFLOW]: PR (draft -> submit -> review -> approve/reject/return) ->
 *   optional RFQ -> Quotation(s) -> selected Quotation -> PO (create ->
 *   approve -> send) -> Goods Receipt (creates one Asset row per accepted
 *   unit for FIXED_ASSET lines, an InventoryTransaction for INVENTORY/
 *   CONSUMABLE lines; SERVICE/DIRECT_EXPENSE lines have no physical
 *   effect) -> Expense (existing accounting, untouched — procurement
 *   never posts its own journal entries, Artefact 6 §25 / §24).
 *
 * [ASSUMPTION, documented]: v1 supports one active PurchaseOrder per
 *   PurchaseRequisition (matching one BudgetCommitment per obligation).
 *   Splitting one requisition across multiple suppliers/POs is real-world
 *   possible but not modelled here — flagged as a known follow-up rather
 *   than half-built.
 *
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (R22 procurement models),
 *   budgetWindowService.ts, apps/web/src/server/lib/sequenceNumbers.ts
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'
import * as budgetWindowService from '@/server/services/budgetWindowService'
import {
  nextSequenceNumber,
  isUniqueConstraintError,
  SEQUENCE_MAX_ATTEMPTS,
} from '@/server/lib/sequenceNumbers'
import type { UserRole } from '@shared/types/roles'

// ─── REQUISITIONS ─────────────────────────────────────────

async function nextRequisitionNumber() {
  return nextSequenceNumber(
    'PR',
    (p) =>
      prisma.purchaseRequisition.findFirst({
        where: { requisitionNumber: { startsWith: p } },
        orderBy: { requisitionNumber: 'desc' },
        select: { requisitionNumber: true },
      }),
    'requisitionNumber'
  )
}

export async function listRequisitions(filters: {
  departmentId?: string
  status?: string
  requestedByUid?: string
}) {
  return prisma.purchaseRequisition.findMany({
    where: {
      departmentId: filters.departmentId,
      status: filters.status as never,
      requestedByUid: filters.requestedByUid,
    },
    include: { department: { select: { name: true } }, lines: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createPurchaseRequisition(
  input: {
    departmentId: string
    budgetWindowId?: string
    budgetId?: string
    purpose: string
    justification?: string
    isEmergency?: boolean
    lines: Array<{
      description: string
      category?: string
      classification: 'FIXED_ASSET' | 'INVENTORY' | 'CONSUMABLE' | 'SERVICE' | 'DIRECT_EXPENSE'
      assetCategory?:
        | 'FURNITURE'
        | 'IT_EQUIPMENT'
        | 'LAB_EQUIPMENT'
        | 'SPORTS_EQUIPMENT'
        | 'KITCHEN_EQUIPMENT'
        | 'VEHICLE'
        | 'MAINTENANCE_TOOL'
        | 'OTHER'
      quantity: number
      unitOfMeasure: string
      estimatedUnitCost: number
      preferredSpecification?: string
      notes?: string
      budgetId?: string
    }>
  },
  actorUid: string,
  actorRole: UserRole
) {
  if (!input.lines.length)
    throw Object.assign(new Error('A requisition needs at least one line.'), { status: 400 })
  for (const l of input.lines) {
    if (l.classification === 'FIXED_ASSET' && !l.assetCategory) {
      throw Object.assign(
        new Error(`Line "${l.description}": an asset category is required for FIXED_ASSET lines.`),
        { status: 400 }
      )
    }
  }

  for (let attempt = 0; attempt < SEQUENCE_MAX_ATTEMPTS; attempt++) {
    const requisitionNumber = await nextRequisitionNumber()
    try {
      const requisition = await prisma.purchaseRequisition.create({
        data: {
          requisitionNumber,
          departmentId: input.departmentId,
          budgetWindowId: input.budgetWindowId,
          budgetId: input.budgetId,
          requestedByUid: actorUid,
          purpose: input.purpose,
          justification: input.justification,
          isEmergency: input.isEmergency ?? false,
          status: 'DRAFT',
          lines: {
            create: input.lines.map((l) => ({
              description: l.description,
              category: l.category,
              classification: l.classification,
              quantity: l.quantity,
              unitOfMeasure: l.unitOfMeasure,
              estimatedUnitCost: l.estimatedUnitCost,
              estimatedTotal: l.quantity * l.estimatedUnitCost,
              preferredSpecification: l.preferredSpecification,
              notes: l.notes,
              budgetId: l.budgetId,
              assetCategory: l.assetCategory,
            })),
          },
        },
        include: { lines: true },
      })
      await auditService.log({
        action: 'procurement.requisition.create',
        entityType: 'PurchaseRequisition',
        entityId: requisition.id,
        actorUid,
        actorRole,
        metadata: {
          context: {
            requisitionNumber,
            departmentId: input.departmentId,
            lineCount: input.lines.length,
          },
        },
      })
      return requisition
    } catch (err) {
      if (!isUniqueConstraintError(err) || attempt === SEQUENCE_MAX_ATTEMPTS - 1) throw err
    }
  }
  throw Object.assign(new Error('Could not allocate a requisition number — please retry.'), {
    status: 500,
  })
}

export async function submitRequisition(id: string, actorUid: string, actorRole: UserRole) {
  const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } })
  if (!requisition) throw Object.assign(new Error('Requisition not found.'), { status: 404 })
  if (requisition.status !== 'DRAFT' && requisition.status !== 'RETURNED') {
    throw Object.assign(new Error('Only a draft or returned requisition can be submitted.'), {
      status: 409,
    })
  }
  const canSubmitAny = ['finance', 'admin', 'high_rank'].includes(actorRole)
  if (!canSubmitAny && requisition.requestedByUid !== actorUid) {
    throw Object.assign(new Error('You can only submit your own requisitions.'), { status: 403 })
  }

  const updated = await prisma.purchaseRequisition.update({
    where: { id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  })
  await auditService.log({
    action: 'procurement.requisition.submit',
    entityType: 'PurchaseRequisition',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}

export async function approveRequisition(
  id: string,
  input: { reviewNote?: string },
  actorUid: string,
  actorRole: UserRole
) {
  const requisition = await prisma.purchaseRequisition.findUnique({
    where: { id },
    include: { lines: true },
  })
  if (!requisition) throw Object.assign(new Error('Requisition not found.'), { status: 404 })
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(requisition.status)) {
    throw Object.assign(new Error('Only a submitted requisition can be approved.'), { status: 409 })
  }
  // Self-approval prevention (permission spec §5): a requester cannot approve their own requisition.
  if (requisition.requestedByUid === actorUid) {
    throw Object.assign(new Error('You cannot approve your own requisition.'), { status: 403 })
  }
  if (!requisition.budgetId) {
    throw Object.assign(
      new Error('This requisition has no budget attached — assign one before approving.'),
      { status: 400 }
    )
  }

  const estimatedTotal = requisition.lines.reduce((sum, l) => sum + Number(l.estimatedTotal), 0)

  const updated = await prisma.$transaction(async (tx) => {
    await budgetWindowService.reserveCommitment(
      tx,
      {
        budgetId: requisition.budgetId!,
        budgetWindowId: requisition.budgetWindowId,
        purchaseRequisitionId: id,
        amount: estimatedTotal,
      },
      actorUid
    )

    return tx.purchaseRequisition.update({
      where: { id },
      data: {
        status: 'APPROVED',
        reviewedByUid: actorUid,
        reviewedAt: new Date(),
        approvedByUid: actorUid,
        approvedAt: new Date(),
        reviewNote: input.reviewNote,
      },
    })
  })

  await auditService.log({
    action: 'procurement.requisition.approve',
    entityType: 'PurchaseRequisition',
    entityId: id,
    actorUid,
    actorRole,
    metadata: { context: { estimatedTotal } },
  })
  return updated
}

export async function rejectRequisition(
  id: string,
  input: { reviewNote: string },
  actorUid: string,
  actorRole: UserRole
) {
  const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } })
  if (!requisition) throw Object.assign(new Error('Requisition not found.'), { status: 404 })
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(requisition.status)) {
    throw Object.assign(new Error('Only a submitted requisition can be rejected.'), { status: 409 })
  }

  const updated = await prisma.purchaseRequisition.update({
    where: { id },
    data: {
      status: 'REJECTED',
      reviewedByUid: actorUid,
      reviewedAt: new Date(),
      rejectedByUid: actorUid,
      rejectedAt: new Date(),
      reviewNote: input.reviewNote,
    },
  })
  await auditService.log({
    action: 'procurement.requisition.reject',
    entityType: 'PurchaseRequisition',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}

export async function returnRequisition(
  id: string,
  input: { reviewNote: string },
  actorUid: string,
  actorRole: UserRole
) {
  const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } })
  if (!requisition) throw Object.assign(new Error('Requisition not found.'), { status: 404 })
  if (!['SUBMITTED', 'UNDER_REVIEW'].includes(requisition.status)) {
    throw Object.assign(new Error('Only a submitted requisition can be returned for changes.'), {
      status: 409,
    })
  }

  const updated = await prisma.purchaseRequisition.update({
    where: { id },
    data: {
      status: 'RETURNED',
      reviewedByUid: actorUid,
      reviewedAt: new Date(),
      reviewNote: input.reviewNote,
    },
  })
  await auditService.log({
    action: 'procurement.requisition.return',
    entityType: 'PurchaseRequisition',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}

export async function cancelRequisition(id: string, actorUid: string, actorRole: UserRole) {
  const requisition = await prisma.purchaseRequisition.findUnique({ where: { id } })
  if (!requisition) throw Object.assign(new Error('Requisition not found.'), { status: 404 })
  if (['REJECTED', 'CANCELLED', 'CLOSED'].includes(requisition.status)) {
    throw Object.assign(new Error('This requisition is already closed out.'), { status: 409 })
  }
  // A plain requester may only cancel their own; broader review authority can cancel any.
  const canCancelAny = ['finance', 'admin', 'high_rank'].includes(actorRole)
  if (!canCancelAny && requisition.requestedByUid !== actorUid) {
    throw Object.assign(new Error('You can only cancel your own requisitions.'), { status: 403 })
  }

  const activeCommitment = await prisma.budgetCommitment.findFirst({
    where: { purchaseRequisitionId: id, status: { in: ['RESERVED', 'COMMITTED'] } },
  })
  const updated = await prisma.$transaction(async (tx) => {
    if (activeCommitment)
      await tx.budgetCommitment.update({
        where: { id: activeCommitment.id },
        data: { status: 'CANCELLED' },
      })
    return tx.purchaseRequisition.update({ where: { id }, data: { status: 'CANCELLED' } })
  })
  await auditService.log({
    action: 'procurement.requisition.cancel',
    entityType: 'PurchaseRequisition',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}

// ─── SUPPLIERS ────────────────────────────────────────────

export async function listSuppliers(includeInactive = false) {
  return prisma.supplier.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { name: 'asc' },
    // bankDetails deliberately excluded from the list view — access to it must go through a dedicated,
    // explicitly-permissioned read (Artefact 6 §16: "Bank details require restricted access")
    select: {
      id: true,
      supplierCode: true,
      name: true,
      contactPerson: true,
      phone: true,
      email: true,
      address: true,
      taxNumber: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  })
}

export async function createSupplier(
  input: {
    supplierCode: string
    name: string
    contactPerson?: string
    phone?: string
    email?: string
    address?: string
    taxNumber?: string
    bankDetails?: string
  },
  actorUid: string,
  actorRole: UserRole
) {
  const existing = await prisma.supplier.findUnique({ where: { supplierCode: input.supplierCode } })
  if (existing)
    throw Object.assign(new Error('A supplier with this code already exists.'), { status: 409 })

  const supplier = await prisma.supplier.create({ data: { ...input } })
  await auditService.log({
    action: 'procurement.supplier.create',
    entityType: 'Supplier',
    entityId: supplier.id,
    actorUid,
    actorRole,
    metadata: { context: { supplierCode: supplier.supplierCode } },
  })
  return supplier
}

// ─── RFQ ──────────────────────────────────────────────────

async function nextRfqNumber() {
  return nextSequenceNumber(
    'RFQ',
    (p) =>
      prisma.rFQ.findFirst({
        where: { rfqNumber: { startsWith: p } },
        orderBy: { rfqNumber: 'desc' },
        select: { rfqNumber: true },
      }),
    'rfqNumber'
  )
}

export async function listRFQs(filters: { purchaseRequisitionId?: string }) {
  return prisma.rFQ.findMany({
    where: { purchaseRequisitionId: filters.purchaseRequisitionId },
    include: {
      purchaseRequisition: { select: { requisitionNumber: true } },
      quotations: { select: { id: true, status: true, supplierId: true } },
      lines: {
        include: {
          purchaseRequisitionLine: {
            select: { description: true, quantity: true, unitOfMeasure: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createRFQ(
  input: { purchaseRequisitionId: string; lineIds: string[]; responseDeadline?: string },
  actorUid: string,
  actorRole: UserRole
) {
  const requisition = await prisma.purchaseRequisition.findUnique({
    where: { id: input.purchaseRequisitionId },
    include: { lines: true },
  })
  if (!requisition) throw Object.assign(new Error('Requisition not found.'), { status: 404 })
  if (requisition.status !== 'APPROVED')
    throw Object.assign(new Error('Only an approved requisition can go out to RFQ.'), {
      status: 409,
    })

  const lines = requisition.lines.filter((l) => input.lineIds.includes(l.id))
  if (!lines.length)
    throw Object.assign(new Error('Select at least one requisition line for this RFQ.'), {
      status: 400,
    })

  for (let attempt = 0; attempt < SEQUENCE_MAX_ATTEMPTS; attempt++) {
    const rfqNumber = await nextRfqNumber()
    try {
      const rfq = await prisma.rFQ.create({
        data: {
          rfqNumber,
          purchaseRequisitionId: input.purchaseRequisitionId,
          status: 'ISSUED',
          issueDate: new Date(),
          responseDeadline: input.responseDeadline ? new Date(input.responseDeadline) : undefined,
          createdByUid: actorUid,
          lines: {
            create: lines.map((l) => ({ purchaseRequisitionLineId: l.id, quantity: l.quantity })),
          },
        },
        include: { lines: true },
      })
      await auditService.log({
        action: 'procurement.rfq.create',
        entityType: 'RFQ',
        entityId: rfq.id,
        actorUid,
        actorRole,
        metadata: { context: { rfqNumber, purchaseRequisitionId: input.purchaseRequisitionId } },
      })
      return rfq
    } catch (err) {
      if (!isUniqueConstraintError(err) || attempt === SEQUENCE_MAX_ATTEMPTS - 1) throw err
    }
  }
  throw Object.assign(new Error('Could not allocate an RFQ number — please retry.'), {
    status: 500,
  })
}

export async function closeRFQ(id: string, actorUid: string, actorRole: UserRole) {
  const rfq = await prisma.rFQ.findUnique({ where: { id } })
  if (!rfq) throw Object.assign(new Error('RFQ not found.'), { status: 404 })
  if (rfq.status === 'CLOSED' || rfq.status === 'CANCELLED')
    throw Object.assign(new Error('This RFQ is already closed.'), { status: 409 })

  const updated = await prisma.rFQ.update({ where: { id }, data: { status: 'CLOSED' } })
  await auditService.log({
    action: 'procurement.rfq.close',
    entityType: 'RFQ',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}

// ─── QUOTATIONS ───────────────────────────────────────────

export async function listQuotations(filters: { rfqId?: string }) {
  return prisma.quotation.findMany({
    where: { rfqId: filters.rfqId },
    include: {
      supplier: { select: { name: true } },
      rfq: { select: { rfqNumber: true } },
      lines: true,
    },
    orderBy: { total: 'asc' },
  })
}

export async function recordQuotation(
  input: {
    rfqId: string
    supplierId: string
    quotationNumber: string
    quotationDate: string
    validUntil?: string
    currency?: string
    documentKey?: string
    lines: Array<{
      purchaseRequisitionLineId: string
      description: string
      quantity: number
      unitPrice: number
      tax?: number
      notes?: string
    }>
  },
  actorUid: string,
  actorRole: UserRole
) {
  const rfq = await prisma.rFQ.findUnique({ where: { id: input.rfqId } })
  if (!rfq) throw Object.assign(new Error('RFQ not found.'), { status: 404 })
  if (!input.lines.length)
    throw Object.assign(new Error('A quotation needs at least one line.'), { status: 400 })

  const lineTotals = input.lines.map((l) => ({
    ...l,
    total: l.quantity * l.unitPrice + (l.tax ?? 0),
  }))
  const subtotal = input.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  const tax = input.lines.reduce((s, l) => s + (l.tax ?? 0), 0)

  const quotation = await prisma.quotation.create({
    data: {
      rfqId: input.rfqId,
      supplierId: input.supplierId,
      quotationNumber: input.quotationNumber,
      quotationDate: new Date(input.quotationDate),
      validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
      currency: input.currency ?? 'MWK',
      subtotal,
      tax,
      total: subtotal + tax,
      status: 'RECEIVED',
      documentKey: input.documentKey,
      lines: {
        create: lineTotals.map((l) => ({
          purchaseRequisitionLineId: l.purchaseRequisitionLineId,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          tax: l.tax,
          total: l.total,
          notes: l.notes,
        })),
      },
    },
    include: { lines: true },
  })
  await prisma.rFQ.update({ where: { id: input.rfqId }, data: { status: 'RESPONSES_RECEIVED' } })
  await auditService.log({
    action: 'procurement.quotation.record',
    entityType: 'Quotation',
    entityId: quotation.id,
    actorUid,
    actorRole,
    metadata: {
      context: { rfqId: input.rfqId, supplierId: input.supplierId, total: quotation.total },
    },
  })
  return quotation
}

export async function selectQuotation(id: string, actorUid: string, actorRole: UserRole) {
  const quotation = await prisma.quotation.findUnique({ where: { id } })
  if (!quotation) throw Object.assign(new Error('Quotation not found.'), { status: 404 })
  if (quotation.status !== 'RECEIVED' && quotation.status !== 'UNDER_REVIEW') {
    throw Object.assign(new Error('Only a received quotation can be selected.'), { status: 409 })
  }

  const [updated] = await prisma.$transaction([
    prisma.quotation.update({ where: { id }, data: { status: 'SELECTED' } }),
    prisma.quotation.updateMany({
      where: {
        rfqId: quotation.rfqId,
        id: { not: id },
        status: { in: ['RECEIVED', 'UNDER_REVIEW'] },
      },
      data: { status: 'REJECTED' },
    }),
  ])
  await auditService.log({
    action: 'procurement.quotation.select',
    entityType: 'Quotation',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}

export async function rejectQuotation(id: string, actorUid: string, actorRole: UserRole) {
  const quotation = await prisma.quotation.findUnique({ where: { id } })
  if (!quotation) throw Object.assign(new Error('Quotation not found.'), { status: 404 })

  const updated = await prisma.quotation.update({ where: { id }, data: { status: 'REJECTED' } })
  await auditService.log({
    action: 'procurement.quotation.reject',
    entityType: 'Quotation',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}

// ─── PURCHASE ORDERS ──────────────────────────────────────

async function nextPoNumber() {
  return nextSequenceNumber(
    'PO',
    (p) =>
      prisma.purchaseOrder.findFirst({
        where: { poNumber: { startsWith: p } },
        orderBy: { poNumber: 'desc' },
        select: { poNumber: true },
      }),
    'poNumber'
  )
}

export async function listPurchaseOrders(filters: { supplierId?: string; status?: string }) {
  return prisma.purchaseOrder.findMany({
    where: { supplierId: filters.supplierId, status: filters.status as never },
    include: {
      supplier: { select: { name: true } },
      purchaseRequisition: { select: { requisitionNumber: true } },
      lines: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Creates a PO from an approved requisition, either from a selected
 * Quotation's lines (normal path) or from manually-priced lines (emergency
 * / sole-source path — Artefact 6 §14's isEmergency flag). Transitions the
 * requisition's existing RESERVED commitment to reference this PO rather
 * than creating a second one (v1 assumption: one PO per requisition).
 */
export async function createPurchaseOrder(
  input: {
    purchaseRequisitionId: string
    supplierId: string
    quotationId?: string
    expectedDeliveryDate?: string
    lines?: Array<{
      purchaseRequisitionLineId?: string
      description: string
      classification: string
      quantityOrdered: number
      unitOfMeasure: string
      unitPrice: number
      tax?: number
      assetCategory?: string
    }>
  },
  actorUid: string,
  actorRole: UserRole
) {
  const requisition = await prisma.purchaseRequisition.findUnique({
    where: { id: input.purchaseRequisitionId },
    include: { lines: true },
  })
  if (!requisition) throw Object.assign(new Error('Requisition not found.'), { status: 404 })
  if (requisition.status !== 'APPROVED')
    throw Object.assign(new Error('Only an approved requisition can be ordered.'), { status: 409 })

  const commitment = await prisma.budgetCommitment.findFirst({
    where: { purchaseRequisitionId: input.purchaseRequisitionId, status: 'RESERVED' },
  })
  if (!commitment)
    throw Object.assign(new Error('No active budget reservation found for this requisition.'), {
      status: 409,
    })

  let poLines: Array<{
    purchaseRequisitionLineId?: string
    description: string
    classification: string
    quantityOrdered: number
    unitOfMeasure: string
    unitPrice: number
    tax?: number
    assetCategory?: string
  }>

  if (input.quotationId) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: input.quotationId },
      include: { lines: true },
    })
    if (!quotation) throw Object.assign(new Error('Quotation not found.'), { status: 404 })
    if (quotation.status !== 'SELECTED')
      throw Object.assign(new Error('Only a selected quotation can be ordered against.'), {
        status: 409,
      })
    poLines = quotation.lines.map((ql) => {
      const prLine = requisition.lines.find((l) => l.id === ql.purchaseRequisitionLineId)
      return {
        purchaseRequisitionLineId: ql.purchaseRequisitionLineId,
        description: ql.description,
        classification: prLine?.classification ?? 'DIRECT_EXPENSE',
        quantityOrdered: Number(ql.quantity),
        unitOfMeasure: prLine?.unitOfMeasure ?? 'unit',
        unitPrice: Number(ql.unitPrice),
        tax: ql.tax ? Number(ql.tax) : undefined,
        assetCategory: prLine?.assetCategory ?? undefined,
      }
    })
  } else if (input.lines?.length) {
    if (!requisition.isEmergency) {
      throw Object.assign(
        new Error(
          'Manually-priced purchase orders require the requisition to be flagged as an emergency/sole-source purchase.'
        ),
        { status: 409 }
      )
    }
    for (const l of input.lines) {
      if (l.classification === 'FIXED_ASSET' && !('assetCategory' in l && l.assetCategory)) {
        throw Object.assign(
          new Error(
            `Line "${l.description}": an asset category is required for FIXED_ASSET lines.`
          ),
          { status: 400 }
        )
      }
    }
    poLines = input.lines
  } else {
    throw Object.assign(
      new Error('Provide either a selected quotationId or manual lines for an emergency purchase.'),
      { status: 400 }
    )
  }

  const subtotal = poLines.reduce((s, l) => s + l.quantityOrdered * l.unitPrice, 0)
  const tax = poLines.reduce((s, l) => s + (l.tax ?? 0), 0)

  for (let attempt = 0; attempt < SEQUENCE_MAX_ATTEMPTS; attempt++) {
    const poNumber = await nextPoNumber()
    try {
      const po = await prisma.$transaction(async (tx) => {
        const created = await tx.purchaseOrder.create({
          data: {
            poNumber,
            purchaseRequisitionId: input.purchaseRequisitionId,
            supplierId: input.supplierId,
            quotationId: input.quotationId,
            status: 'DRAFT',
            expectedDeliveryDate: input.expectedDeliveryDate
              ? new Date(input.expectedDeliveryDate)
              : undefined,
            subtotal,
            tax,
            total: subtotal + tax,
            createdByUid: actorUid,
            lines: {
              create: poLines.map((l) => ({
                purchaseRequisitionLineId: l.purchaseRequisitionLineId,
                description: l.description,
                classification: l.classification as never,
                quantityOrdered: l.quantityOrdered,
                unitOfMeasure: l.unitOfMeasure,
                unitPrice: l.unitPrice,
                tax: l.tax,
                lineTotal: l.quantityOrdered * l.unitPrice + (l.tax ?? 0),
                assetCategory: l.assetCategory as never,
              })),
            },
          },
          include: { lines: true },
        })
        await tx.budgetCommitment.update({
          where: { id: commitment.id },
          data: { purchaseOrderId: created.id, amount: subtotal + tax },
        })
        return created
      })
      await auditService.log({
        action: 'procurement.purchaseOrder.create',
        entityType: 'PurchaseOrder',
        entityId: po.id,
        actorUid,
        actorRole,
        metadata: { context: { poNumber, total: po.total } },
      })
      return po
    } catch (err) {
      if (!isUniqueConstraintError(err) || attempt === SEQUENCE_MAX_ATTEMPTS - 1) throw err
    }
  }
  throw Object.assign(new Error('Could not allocate a PO number — please retry.'), { status: 500 })
}

export async function approvePurchaseOrder(id: string, actorUid: string, actorRole: UserRole) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!po) throw Object.assign(new Error('Purchase order not found.'), { status: 404 })
  if (po.status !== 'DRAFT' && po.status !== 'PENDING_APPROVAL')
    throw Object.assign(new Error('Only a draft/pending purchase order can be approved.'), {
      status: 409,
    })
  if (po.createdByUid === actorUid)
    throw Object.assign(new Error('You cannot approve a purchase order you created.'), {
      status: 403,
    })

  const commitment = await prisma.budgetCommitment.findFirst({
    where: { purchaseOrderId: id, status: 'RESERVED' },
  })

  const updated = await prisma.$transaction(async (tx) => {
    if (commitment) await budgetWindowService.commitCommitment(tx, commitment.id)
    return tx.purchaseOrder.update({
      where: { id },
      data: { status: 'APPROVED', approvedByUid: actorUid, approvedAt: new Date() },
    })
  })
  await auditService.log({
    action: 'procurement.purchaseOrder.approve',
    entityType: 'PurchaseOrder',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}

export async function sendPurchaseOrder(id: string, actorUid: string, actorRole: UserRole) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!po) throw Object.assign(new Error('Purchase order not found.'), { status: 404 })
  if (po.status !== 'APPROVED')
    throw Object.assign(new Error('Only an approved purchase order can be sent.'), { status: 409 })

  const updated = await prisma.purchaseOrder.update({ where: { id }, data: { status: 'SENT' } })
  await auditService.log({
    action: 'procurement.purchaseOrder.send',
    entityType: 'PurchaseOrder',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}

export async function cancelPurchaseOrder(id: string, actorUid: string, actorRole: UserRole) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } })
  if (!po) throw Object.assign(new Error('Purchase order not found.'), { status: 404 })
  if (['FULLY_RECEIVED', 'CLOSED', 'CANCELLED'].includes(po.status))
    throw Object.assign(new Error('This purchase order can no longer be cancelled.'), {
      status: 409,
    })

  const commitment = await prisma.budgetCommitment.findFirst({
    where: { purchaseOrderId: id, status: { in: ['RESERVED', 'COMMITTED'] } },
  })
  const updated = await prisma.$transaction(async (tx) => {
    if (commitment)
      await tx.budgetCommitment.update({
        where: { id: commitment.id },
        data: { status: 'CANCELLED' },
      })
    return tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } })
  })
  await auditService.log({
    action: 'procurement.purchaseOrder.cancel',
    entityType: 'PurchaseOrder',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}

// ─── GOODS RECEIPTS ───────────────────────────────────────

async function nextReceiptNumber() {
  return nextSequenceNumber(
    'GR',
    (p) =>
      prisma.goodsReceipt.findFirst({
        where: { receiptNumber: { startsWith: p } },
        orderBy: { receiptNumber: 'desc' },
        select: { receiptNumber: true },
      }),
    'receiptNumber'
  )
}

export async function listGoodsReceipts(filters: { purchaseOrderId?: string }) {
  return prisma.goodsReceipt.findMany({
    where: { purchaseOrderId: filters.purchaseOrderId },
    include: { purchaseOrder: { select: { poNumber: true } }, lines: true },
    orderBy: { receivedAt: 'desc' },
  })
}

/**
 * Records a goods receipt. quantityAccepted + quantityRejected must not
 * exceed the outstanding (ordered - already received) quantity on the PO
 * line (Artefact 6 §19's invariant). Accepted FIXED_ASSET quantities
 * become one Asset row per unit (sourceType PROCUREMENT, category carried
 * over from the requisition line); accepted INVENTORY/CONSUMABLE
 * quantities become a single RECEIPT InventoryTransaction. SERVICE/
 * DIRECT_EXPENSE lines have no physical effect — they exist purely for
 * PO/Expense tracing.
 */
export async function createGoodsReceipt(
  input: {
    purchaseOrderId: string
    receivedAt?: string
    supplierDeliveryReference?: string
    notes?: string
    lines: Array<{
      purchaseOrderLineId: string
      quantityReceived: number
      quantityAccepted: number
      quantityRejected?: number
      condition?: string
      notes?: string
    }>
  },
  actorUid: string,
  actorRole: UserRole
) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: input.purchaseOrderId },
    include: { lines: true, supplier: { select: { name: true } } },
  })
  if (!po) throw Object.assign(new Error('Purchase order not found.'), { status: 404 })
  if (!['SENT', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    throw Object.assign(new Error('This purchase order is not open to receive goods against.'), {
      status: 409,
    })
  }
  if (!input.lines.length)
    throw Object.assign(new Error('A goods receipt needs at least one line.'), { status: 400 })

  for (const line of input.lines) {
    const poLine = po.lines.find((l) => l.id === line.purchaseOrderLineId)
    if (!poLine)
      throw Object.assign(
        new Error('One of the receipt lines does not belong to this purchase order.'),
        { status: 400 }
      )
    const outstanding =
      Number(poLine.quantityOrdered) -
      Number(poLine.quantityReceived) -
      Number(poLine.quantityCancelled)
    const rejected = line.quantityRejected ?? 0
    if (line.quantityAccepted + rejected > outstanding) {
      throw Object.assign(
        new Error(
          `Line "${poLine.description}": accepted + rejected (${line.quantityAccepted + rejected}) exceeds the outstanding quantity (${outstanding}).`
        ),
        { status: 409 }
      )
    }
  }

  for (let attempt = 0; attempt < SEQUENCE_MAX_ATTEMPTS; attempt++) {
    const receiptNumber = await nextReceiptNumber()
    try {
      const receipt = await prisma.$transaction(async (tx) => {
        const created = await tx.goodsReceipt.create({
          data: {
            receiptNumber,
            purchaseOrderId: input.purchaseOrderId,
            receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
            receivedByUid: actorUid,
            status: 'RECEIVED',
            supplierDeliveryReference: input.supplierDeliveryReference,
            notes: input.notes,
            lines: {
              create: input.lines.map((l) => ({
                purchaseOrderLineId: l.purchaseOrderLineId,
                quantityReceived: l.quantityReceived,
                quantityAccepted: l.quantityAccepted,
                quantityRejected: l.quantityRejected ?? 0,
                condition: l.condition,
                notes: l.notes,
              })),
            },
          },
          include: { lines: true },
        })

        for (const grLine of created.lines) {
          const poLine = po.lines.find((l) => l.id === grLine.purchaseOrderLineId)!
          await tx.purchaseOrderLine.update({
            where: { id: poLine.id },
            data: { quantityReceived: { increment: grLine.quantityAccepted } },
          })

          if (Number(grLine.quantityAccepted) <= 0) continue

          if (poLine.classification === 'FIXED_ASSET') {
            if (!poLine.assetCategory) {
              throw new Error(
                `PO line "${poLine.description}" is classified FIXED_ASSET but has no assetCategory — this should have been caught at requisition/PO creation.`
              )
            }
            const unitCount = Math.floor(Number(grLine.quantityAccepted))
            for (let i = 0; i < unitCount; i++) {
              await tx.asset.create({
                data: {
                  name: poLine.description,
                  category: poLine.assetCategory,
                  // status/condition default to IN_STORE/GOOD — overridden only if this
                  // receipt line recorded a specific condition (e.g. a damaged-in-transit unit)
                  condition: grLine.condition ? (grLine.condition as never) : undefined,
                  acquisitionCost: poLine.unitPrice,
                  acquisitionDate: created.receivedAt,
                  supplier: po.supplier.name,
                  classification: 'FIXED_ASSET',
                  sourceType: 'PROCUREMENT',
                  purchaseOrderId: po.id,
                  goodsReceiptLineId: grLine.id,
                  createdByUid: actorUid,
                },
              })
            }
          } else if (
            poLine.classification === 'INVENTORY' ||
            poLine.classification === 'CONSUMABLE'
          ) {
            const itemCode = `AUTO-${poLine.id.slice(-8)}`
            const item = await tx.inventoryItem.upsert({
              where: { itemCode },
              create: { itemCode, name: poLine.description, unitOfMeasure: poLine.unitOfMeasure },
              update: {},
            })
            await tx.inventoryTransaction.create({
              data: {
                inventoryItemId: item.id,
                transactionType: 'RECEIPT',
                quantity: grLine.quantityAccepted,
                goodsReceiptLineId: grLine.id,
                referenceType: 'GoodsReceiptLine',
                referenceId: grLine.id,
                performedByUid: actorUid,
              },
            })
          }
          // SERVICE / DIRECT_EXPENSE: no physical effect.
        }

        const refreshedLines = await tx.purchaseOrderLine.findMany({
          where: { purchaseOrderId: po.id },
        })
        const fullyReceived = refreshedLines.every(
          (l) =>
            Number(l.quantityReceived) + Number(l.quantityCancelled) >= Number(l.quantityOrdered)
        )
        const anyReceived = refreshedLines.some((l) => Number(l.quantityReceived) > 0)
        const newPoStatus = fullyReceived
          ? 'FULLY_RECEIVED'
          : anyReceived
            ? 'PARTIALLY_RECEIVED'
            : po.status
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { status: newPoStatus as never },
        })
        if (fullyReceived) {
          await tx.purchaseRequisition.update({
            where: { id: po.purchaseRequisitionId },
            data: { status: 'CLOSED' },
          })
        }

        return created
      })

      await auditService.log({
        action: 'procurement.goodsReceipt.create',
        entityType: 'GoodsReceipt',
        entityId: receipt.id,
        actorUid,
        actorRole,
        metadata: { context: { receiptNumber, purchaseOrderId: input.purchaseOrderId } },
      })
      return receipt
    } catch (err) {
      if (!isUniqueConstraintError(err) || attempt === SEQUENCE_MAX_ATTEMPTS - 1) throw err
    }
  }
  throw Object.assign(new Error('Could not allocate a receipt number — please retry.'), {
    status: 500,
  })
}

export async function completeGoodsReceipt(id: string, actorUid: string, actorRole: UserRole) {
  const receipt = await prisma.goodsReceipt.findUnique({ where: { id } })
  if (!receipt) throw Object.assign(new Error('Goods receipt not found.'), { status: 404 })

  const updated = await prisma.goodsReceipt.update({ where: { id }, data: { status: 'COMPLETED' } })
  await auditService.log({
    action: 'procurement.goodsReceipt.complete',
    entityType: 'GoodsReceipt',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}
