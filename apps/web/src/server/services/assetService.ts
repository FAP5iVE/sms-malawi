/*
 * apps/web/src/server/services/assetService.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R20 — Assets & Inventory Management
 * [PURPOSE]: Business logic for the assets domain (prisma/schema.prisma
 *   Asset/AssetAssignment/AssetRequest models, same phase). Structure
 *   mirrors libraryService.ts (catalog CRUD + issue/return lifecycle) and
 *   the requisition half mirrors libraryWorkflowService.ts's
 *   recommendation flow (submit → approve/reject, optionally fulfil).
 *
 *   Deliberately out of scope this phase (see permissions.ts's assets.*
 *   doc comment): posting acquisition cost / depreciation to the general
 *   ledger via accountingService.ts. acquisitionCost is stored on Asset
 *   for reporting only — it does not create AccountEntry rows. Wiring
 *   that up is a real, separate accounting-correctness piece of work and
 *   isn't done silently half-right here.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (Asset/AssetAssignment/
 *   AssetRequest — same phase), packages/shared/schemas/assets.ts (same
 *   phase)
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import type { UserRole } from '@shared/types/roles'
import type { Decimal } from '@prisma/client/runtime/library'
import type {
  CreateAssetInput, UpdateAssetInput, MarkAssetConditionInput, DisposeAssetInput,
  AllocateAssetInput, ReturnAssetInput, CreateAssetRequestInput,
  ReviewAssetRequestInput, RejectAssetRequestInput,
  RecordAdvanceInput, ReconcileAdvanceInput, WriteOffAdvanceInput,
} from '@shared/schemas/assets'

// [PRODUCTION NOTE] Prisma's Decimal serializes to a STRING via its own
// toJSON(), not a number — matches the exact toNumber() precedent in
// examService.ts. Without this, acquisitionCost silently becomes a string
// on the wire despite the ApiAsset type declaring it a number.
function toNumber(v: Decimal | number | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined
  return typeof v === 'number' ? v : Number(v)
}

function serializeAsset<T extends { acquisitionCost: Decimal | number | null }>(asset: T) {
  return { ...asset, acquisitionCost: toNumber(asset.acquisitionCost) }
}

// ─── REGISTER (catalog) ─────────────────────────────────

export async function listAssets(filters: {
  category?: string; status?: string; search?: string
  sortBy?: 'name' | 'category' | 'acquisitionDate' | 'acquisitionCost'
  sortDir?: 'asc' | 'desc'
} = {}) {
  return prisma.asset.findMany({
    where: {
      ...(filters.category ? { category: filters.category as never } : {}),
      ...(filters.status   ? { status: filters.status as never } : {}),
      ...(filters.search   ? {
        OR: [
          { name:         { contains: filters.search, mode: 'insensitive' } },
          { serialNumber: { contains: filters.search, mode: 'insensitive' } },
          { location:     { contains: filters.search, mode: 'insensitive' } },
        ]
      } : {}),
    },
    orderBy: { [filters.sortBy ?? 'name']: filters.sortDir ?? 'asc' },
  }).then(rows => rows.map(serializeAsset))
}

export async function getAssetById(id: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      assignments: { orderBy: { assignedAt: 'desc' }, take: 20 },
    },
  })
  return asset ? serializeAsset(asset) : null
}

export async function createAsset(data: CreateAssetInput, actorUid: string, actorRole: UserRole) {
  const asset = await prisma.asset.create({
    data: {
      name:            data.name,
      category:        data.category,
      description:     data.description ?? null,
      serialNumber:    data.serialNumber ? data.serialNumber : null,
      quantity:        data.quantity,
      condition:       data.condition,
      location:        data.location ?? null,
      acquisitionDate: data.acquisitionDate ? new Date(data.acquisitionDate) : null,
      acquisitionCost: data.acquisitionCost ?? null,
      supplier:        data.supplier ?? null,
      warrantyExpiry:  data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
      notes:           data.notes ?? null,
      createdByUid:    actorUid,
    },
  })
  await auditService.log({
    action: 'asset.create', entityType: 'Asset', entityId: asset.id,
    actorUid, actorRole, metadata: { after: { name: asset.name, category: asset.category, quantity: asset.quantity } },
  })
  logger.info({ event: 'asset.create', assetId: asset.id, actorUid })
  return serializeAsset(asset)
}

export async function updateAsset(id: string, data: UpdateAssetInput, actorUid: string, actorRole: UserRole) {
  const existing = await prisma.asset.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw Object.assign(new Error('Asset not found.'), { status: 404 })

  const asset = await prisma.asset.update({
    where: { id },
    data: {
      ...(data.name            !== undefined ? { name: data.name } : {}),
      ...(data.category        !== undefined ? { category: data.category } : {}),
      ...(data.description     !== undefined ? { description: data.description } : {}),
      ...(data.serialNumber    !== undefined ? { serialNumber: data.serialNumber ? data.serialNumber : null } : {}),
      ...(data.quantity        !== undefined ? { quantity: data.quantity } : {}),
      ...(data.condition       !== undefined ? { condition: data.condition } : {}),
      ...(data.location        !== undefined ? { location: data.location } : {}),
      ...(data.acquisitionDate !== undefined ? { acquisitionDate: data.acquisitionDate ? new Date(data.acquisitionDate) : null } : {}),
      ...(data.acquisitionCost !== undefined ? { acquisitionCost: data.acquisitionCost } : {}),
      ...(data.supplier        !== undefined ? { supplier: data.supplier } : {}),
      ...(data.warrantyExpiry  !== undefined ? { warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null } : {}),
      ...(data.notes           !== undefined ? { notes: data.notes } : {}),
    },
  })
  await auditService.log({
    action: 'asset.update', entityType: 'Asset', entityId: asset.id,
    actorUid, actorRole, metadata: { after: data as Record<string, unknown> },
  })
  return serializeAsset(asset)
}

export async function markCondition(id: string, data: MarkAssetConditionInput, actorUid: string, actorRole: UserRole) {
  const existing = await prisma.asset.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw Object.assign(new Error('Asset not found.'), { status: 404 })

  const asset = await prisma.asset.update({
    where: { id },
    data: { condition: data.condition, notes: data.notes ?? undefined },
  })
  await auditService.log({
    action: 'asset.markCondition', entityType: 'Asset', entityId: asset.id,
    actorUid, actorRole, metadata: { after: { condition: data.condition, notes: data.notes } },
  })
  return serializeAsset(asset)
}

export async function disposeAsset(id: string, data: DisposeAssetInput, actorUid: string, actorRole: UserRole) {
  const existing = await prisma.asset.findUnique({
    where: { id },
    select: { id: true, status: true },
  })
  if (!existing) throw Object.assign(new Error('Asset not found.'), { status: 404 })
  if (existing.status === 'ALLOCATED') {
    throw Object.assign(
      new Error('This asset is currently allocated — return it before marking it disposed.'),
      { status: 409 },
    )
  }

  const asset = await prisma.asset.update({
    where: { id },
    data: { status: 'DISPOSED', notes: data.notes ?? undefined },
  })
  await auditService.log({
    action: 'asset.dispose', entityType: 'Asset', entityId: asset.id,
    actorUid, actorRole, metadata: { after: { notes: data.notes } },
  })
  logger.info({ event: 'asset.dispose', assetId: asset.id, actorUid })
  return serializeAsset(asset)
}

// ─── ALLOCATION / CUSTODY ────────────────────────────────

export async function allocateAsset(assetId: string, data: AllocateAssetInput, actorUid: string, actorRole: UserRole) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, status: true, quantity: true } })
  if (!asset) throw Object.assign(new Error('Asset not found.'), { status: 404 })
  if (asset.status === 'DISPOSED') {
    throw Object.assign(new Error('This asset has been disposed and cannot be allocated.'), { status: 409 })
  }
  if (asset.status === 'ALLOCATED') {
    throw Object.assign(new Error('This asset is already allocated — return it first before reassigning.'), { status: 409 })
  }

  if (data.assignedToType === 'STAFF' && data.staffId) {
    const staff = await prisma.staffProfile.findUnique({ where: { id: data.staffId }, select: { id: true } })
    if (!staff) throw Object.assign(new Error('Staff member not found.'), { status: 400 })
  }

  const [assignment] = await prisma.$transaction([
    prisma.assetAssignment.create({
      data: {
        assetId,
        assignedToType:   data.assignedToType,
        staffId:          data.assignedToType === 'STAFF' ? data.staffId : null,
        departmentOrRoom: data.assignedToType !== 'STAFF' ? data.departmentOrRoom : null,
        quantity:         data.quantity,
        assignedByUid:    actorUid,
        notes:            data.notes ?? null,
      },
    }),
    prisma.asset.update({ where: { id: assetId }, data: { status: 'ALLOCATED' } }),
  ])

  await auditService.log({
    action: 'asset.allocate', entityType: 'AssetAssignment', entityId: assignment.id,
    actorUid, actorRole,
    metadata: { after: { assetId, assignedToType: data.assignedToType, staffId: data.staffId, departmentOrRoom: data.departmentOrRoom } },
  })
  logger.info({ event: 'asset.allocate', assetId, assignmentId: assignment.id, actorUid })
  return assignment
}

export async function returnAsset(assignmentId: string, data: ReturnAssetInput, actorUid: string, actorRole: UserRole) {
  const assignment = await prisma.assetAssignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, assetId: true, status: true },
  })
  if (!assignment) throw Object.assign(new Error('Assignment not found.'), { status: 404 })
  if (assignment.status !== 'ACTIVE') {
    throw Object.assign(new Error('This assignment has already been returned.'), { status: 409 })
  }

  const newAssetStatus = data.conditionOnReturn === 'DAMAGED' ? 'UNDER_REPAIR' : 'IN_STORE'

  const [updated] = await prisma.$transaction([
    prisma.assetAssignment.update({
      where: { id: assignmentId },
      data: {
        status:            'RETURNED',
        returnedAt:        new Date(),
        conditionOnReturn: data.conditionOnReturn ?? null,
        notes:             data.notes ?? undefined,
      },
    }),
    prisma.asset.update({
      where: { id: assignment.assetId },
      data: {
        status:    newAssetStatus,
        ...(data.conditionOnReturn ? { condition: data.conditionOnReturn } : {}),
      },
    }),
  ])

  await auditService.log({
    action: 'asset.return', entityType: 'AssetAssignment', entityId: updated.id,
    actorUid, actorRole, metadata: { after: { conditionOnReturn: data.conditionOnReturn } },
  })
  return updated
}

export async function listAssignments(filters: { assetId?: string; staffId?: string; status?: string; departmentOrRoom?: string } = {}) {
  const rows = await prisma.assetAssignment.findMany({
    where: {
      ...(filters.assetId         ? { assetId: filters.assetId } : {}),
      ...(filters.staffId         ? { staffId: filters.staffId } : {}),
      ...(filters.status          ? { status: filters.status as never } : {}),
      ...(filters.departmentOrRoom ? { departmentOrRoom: { contains: filters.departmentOrRoom, mode: 'insensitive' } } : {}),
    },
    include: { asset: true },
    orderBy: { assignedAt: 'desc' },
  })
  return rows.map(r => ({ ...r, asset: serializeAsset(r.asset) }))
}

/**
 * Every room/department with at least one currently-active assignment,
 * and what's in each — the "what's in Room X" / "what does the Science
 * Department hold" view. Grouped in JS rather than a Prisma groupBy since
 * we need the full asset list per group, not just counts.
 */
export async function listRoomInventory() {
  const active = await prisma.assetAssignment.findMany({
    where: { status: 'ACTIVE', assignedToType: { in: ['ROOM', 'DEPARTMENT'] } },
    include: { asset: true },
    orderBy: { departmentOrRoom: 'asc' },
  })
  const grouped = new Map<string, { departmentOrRoom: string; assignedToType: string; items: ReturnType<typeof serializeAsset>[] }>()
  for (const a of active) {
    const key = `${a.assignedToType}:${a.departmentOrRoom ?? 'Unspecified'}`
    if (!grouped.has(key)) {
      grouped.set(key, { departmentOrRoom: a.departmentOrRoom ?? 'Unspecified', assignedToType: a.assignedToType, items: [] })
    }
    grouped.get(key)!.items.push(serializeAsset(a.asset))
  }
  return Array.from(grouped.values())
}

/** Everything currently (and previously) assigned to one staff member — self-service "my assigned items". */
export async function listMyAssignments(staffId: string) {
  const rows = await prisma.assetAssignment.findMany({
    where: { staffId },
    include: { asset: true },
    orderBy: { assignedAt: 'desc' },
  })
  return rows.map(r => ({ ...r, asset: serializeAsset(r.asset) }))
}

// ─── REQUISITION WORKFLOW ────────────────────────────────

export async function createAssetRequest(data: CreateAssetRequestInput, actorUid: string, actorRole: UserRole) {
  const request = await prisma.assetRequest.create({
    data: {
      requestedByUid: actorUid,
      title:          data.title,
      category:       data.category,
      quantity:       data.quantity,
      department:     data.department ?? null,
      justification:  data.justification ?? null,
    },
  })
  await auditService.log({
    action: 'assetRequest.create', entityType: 'AssetRequest', entityId: request.id,
    actorUid, actorRole, metadata: { after: { title: request.title, category: request.category, quantity: request.quantity } },
  })
  return request
}

export async function listAssetRequests(filters: { status?: string; requestedByUid?: string; department?: string } = {}) {
  const rows = await prisma.assetRequest.findMany({
    where: {
      ...(filters.status         ? { status: filters.status as never } : {}),
      ...(filters.requestedByUid ? { requestedByUid: filters.requestedByUid } : {}),
      ...(filters.department     ? { department: { contains: filters.department, mode: 'insensitive' } } : {}),
    },
    include: { fulfilledAsset: true },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(r => ({ ...r, fulfilledAsset: r.fulfilledAsset ? serializeAsset(r.fulfilledAsset) : null }))
}

/** Pending-request counts grouped by department — the finance/high_rank "queue by department" view. */
export async function getRequestsByDepartment() {
  const rows = await prisma.assetRequest.groupBy({
    by: ['department', 'status'],
    _count: { _all: true },
  })
  return rows.map(r => ({ department: r.department ?? 'Unspecified', status: r.status, count: r._count._all }))
}

export async function approveAssetRequest(id: string, data: ReviewAssetRequestInput, actorUid: string, actorRole: UserRole) {
  const existing = await prisma.assetRequest.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!existing) throw Object.assign(new Error('Request not found.'), { status: 404 })
  if (existing.status !== 'PENDING') {
    throw Object.assign(new Error('This request has already been reviewed.'), { status: 409 })
  }

  const request = await prisma.assetRequest.update({
    where: { id },
    data: {
      status:           data.fulfilledAssetId ? 'FULFILLED' : 'APPROVED',
      reviewedByUid:    actorUid,
      reviewedAt:       new Date(),
      reviewNotes:      data.reviewNotes ?? undefined,
      fulfilledAssetId: data.fulfilledAssetId ?? undefined,
    },
  })
  await auditService.log({
    action: 'assetRequest.approve', entityType: 'AssetRequest', entityId: request.id,
    actorUid, actorRole, metadata: { after: { status: request.status, fulfilledAssetId: data.fulfilledAssetId } },
  })
  return request
}

export async function rejectAssetRequest(id: string, data: RejectAssetRequestInput, actorUid: string, actorRole: UserRole) {
  const existing = await prisma.assetRequest.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!existing) throw Object.assign(new Error('Request not found.'), { status: 404 })
  if (existing.status !== 'PENDING') {
    throw Object.assign(new Error('This request has already been reviewed.'), { status: 409 })
  }

  const request = await prisma.assetRequest.update({
    where: { id },
    data: { status: 'REJECTED', reviewedByUid: actorUid, reviewedAt: new Date(), reviewNotes: data.reviewNotes ?? undefined },
  })
  await auditService.log({
    action: 'assetRequest.reject', entityType: 'AssetRequest', entityId: request.id,
    actorUid, actorRole, metadata: { after: { reviewNotes: data.reviewNotes } },
  })
  return request
}

// ─── PROCUREMENT ADVANCES (R21) ───────────────────────────
// Cash finance advances to a supplier against an APPROVED/FULFILLED
// request, tracked until reconciled or written off. See prisma/schema
// .prisma's AssetAdvance model comment for the deliberate GL-posting
// boundary — these are tracking records, not ledger entries.

function serializeAdvance<T extends { amount: Decimal | number }>(advance: T) {
  return { ...advance, amount: toNumber(advance.amount) as number }
}

export async function recordAdvance(assetRequestId: string, data: RecordAdvanceInput, actorUid: string, actorRole: UserRole) {
  const request = await prisma.assetRequest.findUnique({ where: { id: assetRequestId }, select: { id: true, status: true } })
  if (!request) throw Object.assign(new Error('Request not found.'), { status: 404 })
  if (request.status === 'PENDING' || request.status === 'REJECTED') {
    throw Object.assign(new Error('This request has not been approved yet — approve it before recording an advance against it.'), { status: 409 })
  }

  const advance = await prisma.assetAdvance.create({
    data: {
      assetRequestId,
      supplier:      data.supplier,
      amount:        data.amount,
      advancedByUid: actorUid,
      notes:         data.notes ?? null,
    },
  })
  await auditService.log({
    action: 'assetAdvance.record', entityType: 'AssetAdvance', entityId: advance.id,
    actorUid, actorRole, metadata: { after: { assetRequestId, supplier: data.supplier, amount: data.amount } },
  })
  logger.info({ event: 'assetAdvance.record', advanceId: advance.id, assetRequestId, actorUid })
  return serializeAdvance(advance)
}

export async function reconcileAdvance(id: string, data: ReconcileAdvanceInput, actorUid: string, actorRole: UserRole) {
  const existing = await prisma.assetAdvance.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!existing) throw Object.assign(new Error('Advance not found.'), { status: 404 })
  if (existing.status !== 'PENDING') {
    throw Object.assign(new Error('This advance has already been resolved.'), { status: 409 })
  }

  const advance = await prisma.assetAdvance.update({
    where: { id },
    data: { status: 'RECONCILED', reconciledByUid: actorUid, reconciledAt: new Date(), notes: data.notes ?? undefined },
  })
  await auditService.log({
    action: 'assetAdvance.reconcile', entityType: 'AssetAdvance', entityId: advance.id,
    actorUid, actorRole, metadata: { after: { notes: data.notes } },
  })
  return serializeAdvance(advance)
}

export async function writeOffAdvance(id: string, data: WriteOffAdvanceInput, actorUid: string, actorRole: UserRole) {
  const existing = await prisma.assetAdvance.findUnique({ where: { id }, select: { id: true, status: true } })
  if (!existing) throw Object.assign(new Error('Advance not found.'), { status: 404 })
  if (existing.status !== 'PENDING') {
    throw Object.assign(new Error('This advance has already been resolved.'), { status: 409 })
  }

  const advance = await prisma.assetAdvance.update({
    where: { id },
    data: { status: 'WRITTEN_OFF', reconciledByUid: actorUid, reconciledAt: new Date(), notes: data.notes ?? undefined },
  })
  await auditService.log({
    action: 'assetAdvance.writeOff', entityType: 'AssetAdvance', entityId: advance.id,
    actorUid, actorRole, metadata: { after: { notes: data.notes } },
  })
  logger.info({ event: 'assetAdvance.writeOff', advanceId: advance.id, actorUid })
  return serializeAdvance(advance)
}

export async function listAdvances(filters: { assetRequestId?: string; status?: string } = {}) {
  const rows = await prisma.assetAdvance.findMany({
    where: {
      ...(filters.assetRequestId ? { assetRequestId: filters.assetRequestId } : {}),
      ...(filters.status         ? { status: filters.status as never } : {}),
    },
    include: { assetRequest: { select: { title: true, department: true } } },
    orderBy: { advancedAt: 'desc' },
  })
  return rows.map(serializeAdvance)
}

// ─── REPORTS ──────────────────────────────────────────────

export async function getInventoryStats() {
  const [byCategory, byStatus, valuation, pendingRequests, outstandingAdvances] = await Promise.all([
    prisma.asset.groupBy({ by: ['category'], _count: { _all: true }, _sum: { quantity: true } }),
    prisma.asset.groupBy({ by: ['status'],   _count: { _all: true } }),
    prisma.asset.aggregate({ _sum: { acquisitionCost: true }, where: { status: { not: 'DISPOSED' } } }),
    prisma.assetRequest.count({ where: { status: 'PENDING' } }),
    prisma.assetAdvance.aggregate({ _sum: { amount: true }, where: { status: 'PENDING' } }),
  ])

  return {
    byCategory: byCategory.map(c => ({ category: c.category, count: c._count._all, totalQuantity: c._sum.quantity ?? 0 })),
    byStatus:   byStatus.map(s => ({ status: s.status, count: s._count._all })),
    totalValuationMWK: Number(valuation._sum.acquisitionCost ?? 0),
    pendingRequests,
    outstandingAdvancesMWK: Number(outstandingAdvances._sum.amount ?? 0),
  }
}