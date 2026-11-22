/*
 * apps/web/src/server/services/stocktakeService.ts
 *
 * [CHANGE TYPE]: REWRITE (R22) — the partner's delivered draft used field
 *   names (expectedQty/foundQty) and status values (OPEN/VARIANCE_REVIEW)
 *   that don't exist anywhere in the schema (schema has expectedQuantity/
 *   actualQuantity and DRAFT/IN_PROGRESS/SUBMITTED/REVIEWED/COMPLETED/
 *   CANCELLED) — this version matches the schema. It also had no list,
 *   getById, or resolveVariance functions, despite the UI having wired
 *   buttons for all three.
 *
 * [STATE MACHINE]: DRAFT (created) -> IN_PROGRESS (opened — expected
 *   lines snapshotted from current Asset/Inventory state, "a real physical
 *   baseline, not fabricated historical evidence", Artefact 6 §22) ->
 *   complete() -> COMPLETED directly if every line matched, or REVIEWED if
 *   any variance needs resolving first -> auto-promotes REVIEWED ->
 *   COMPLETED once its last open variance is resolved.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (Stocktake, StocktakeLine,
 *   InventoryVariance — R22), inventoryService.ts, sequenceNumbers.ts
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'
import * as inventoryService from '@/server/services/inventoryService'
import { nextSequenceNumber, isUniqueConstraintError, SEQUENCE_MAX_ATTEMPTS } from '@/server/lib/sequenceNumbers'
import type { UserRole } from '@shared/types/roles'

async function nextStocktakeNumber() {
  return nextSequenceNumber('ST', (p) => prisma.stocktake.findFirst({
    where: { stocktakeNumber: { startsWith: p } }, orderBy: { stocktakeNumber: 'desc' }, select: { stocktakeNumber: true },
  }), 'stocktakeNumber')
}

export async function listStocktakes(filters: { academicYear?: string; term?: number; departmentId?: string; roomId?: string; status?: string }) {
  return prisma.stocktake.findMany({
    where: { academicYear: filters.academicYear, term: filters.term, departmentId: filters.departmentId, roomId: filters.roomId, status: filters.status as never },
    include: { room: { select: { name: true, code: true } }, department: { select: { name: true } }, _count: { select: { lines: true, variances: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getStocktake(id: string) {
  const stocktake = await prisma.stocktake.findUnique({
    where: { id },
    include: {
      room: { select: { name: true, code: true } },
      department: { select: { name: true } },
      lines: { include: { asset: { select: { name: true, assetTag: true } }, inventoryItem: { select: { name: true, itemCode: true } }, variance: true } },
      variances: true,
    },
  })
  if (!stocktake) throw Object.assign(new Error('Stocktake not found.'), { status: 404 })
  return stocktake
}

export async function createStocktake(
  input: { academicYear: string; term?: number; departmentId?: string; roomId?: string; notes?: string },
  actorUid: string, actorRole: UserRole,
) {
  if (!input.departmentId && !input.roomId) {
    throw Object.assign(new Error('A stocktake needs either a department or a room scope.'), { status: 400 })
  }
  if (input.roomId) {
    const existing = await prisma.stocktake.findUnique({ where: { academicYear_term_roomId: { academicYear: input.academicYear, term: input.term ?? null as never, roomId: input.roomId } } })
    if (existing) throw Object.assign(new Error('A stocktake already exists for this room this term.'), { status: 409 })
  }

  let custodianUid: string | undefined
  if (input.roomId) {
    const room = await prisma.room.findUnique({ where: { id: input.roomId } })
    custodianUid = room?.custodianUid ?? undefined
  }

  for (let attempt = 0; attempt < SEQUENCE_MAX_ATTEMPTS; attempt++) {
    const stocktakeNumber = await nextStocktakeNumber()
    try {
      const stocktake = await prisma.stocktake.create({
        data: {
          stocktakeNumber,
          academicYear: input.academicYear,
          term: input.term,
          departmentId: input.departmentId,
          roomId: input.roomId,
          custodianUid,
          notes: input.notes,
          status: 'DRAFT',
        },
      })
      await auditService.log({ action: 'inventory.stocktake.create', entityType: 'Stocktake', entityId: stocktake.id, actorUid, actorRole, metadata: { context: { stocktakeNumber, roomId: input.roomId, departmentId: input.departmentId } } })
      return stocktake
    } catch (err) {
      if (!isUniqueConstraintError(err) || attempt === SEQUENCE_MAX_ATTEMPTS - 1) throw err
    }
  }
  throw Object.assign(new Error('Could not allocate a stocktake number — please retry.'), { status: 500 })
}

/**
 * Opens the count: snapshots expected quantities from the current system
 * state (one StocktakeLine per Asset physically located here, one per
 * InventoryItem with a nonzero room balance here) so the physical count
 * has something concrete to compare against — never fabricated.
 */
export async function startStocktake(id: string, actorUid: string, actorRole: UserRole) {
  const stocktake = await prisma.stocktake.findUnique({ where: { id } })
  if (!stocktake) throw Object.assign(new Error('Stocktake not found.'), { status: 404 })
  if (stocktake.status !== 'DRAFT') throw Object.assign(new Error('Only a draft stocktake can be started.'), { status: 409 })

  const assets = stocktake.roomId
    ? await prisma.asset.findMany({ where: { roomId: stocktake.roomId } })
    : stocktake.departmentId
      ? await prisma.asset.findMany({ where: { departmentId: stocktake.departmentId } })
      : []

  const items = await prisma.inventoryItem.findMany({ where: { isActive: true } })
  const inventoryLines: Array<{ inventoryItemId: string; expectedQuantity: number }> = []
  for (const item of items) {
    const balance = await inventoryService.getStockBalance(item.id)
    const expected = stocktake.roomId ? (balance.byRoom[stocktake.roomId] ?? 0) : balance.total
    if (expected > 0) inventoryLines.push({ inventoryItemId: item.id, expectedQuantity: expected })
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.stocktakeLine.createMany({
      data: [
        ...assets.map(a => ({ stocktakeId: id, assetId: a.id, expectedQuantity: 1, actualQuantity: 0 })),
        ...inventoryLines.map(l => ({ stocktakeId: id, inventoryItemId: l.inventoryItemId, expectedQuantity: l.expectedQuantity, actualQuantity: 0 })),
      ],
    })
    return tx.stocktake.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date(), startedByUid: actorUid } })
  })
  await auditService.log({ action: 'inventory.stocktake.start', entityType: 'Stocktake', entityId: id, actorUid, actorRole, metadata: { context: { assetLines: assets.length, inventoryLines: inventoryLines.length } } })
  return updated
}

/** Records the physical count for one line (an asset seen, or an item's counted quantity in this room). */
export async function recordLine(
  input: { stocktakeId: string; lineId: string; actualQuantity: number; condition?: string; notes?: string },
  actorUid: string, actorRole: UserRole,
) {
  const stocktake = await prisma.stocktake.findUnique({ where: { id: input.stocktakeId } })
  if (!stocktake) throw Object.assign(new Error('Stocktake not found.'), { status: 404 })
  if (stocktake.status !== 'IN_PROGRESS') throw Object.assign(new Error('This stocktake is not open for counting.'), { status: 409 })

  const line = await prisma.stocktakeLine.findUnique({ where: { id: input.lineId } })
  if (!line || line.stocktakeId !== input.stocktakeId) throw Object.assign(new Error('Stocktake line not found.'), { status: 404 })

  const updated = await prisma.stocktakeLine.update({
    where: { id: input.lineId },
    data: { actualQuantity: input.actualQuantity, condition: input.condition as never, notes: input.notes },
  })
  await auditService.log({ action: 'inventory.stocktake.recordLine', entityType: 'StocktakeLine', entityId: input.lineId, actorUid, actorRole, metadata: { context: { stocktakeId: input.stocktakeId, actualQuantity: input.actualQuantity } } })
  return updated
}

/**
 * Closes counting. Every line whose actual differs from expected gets an
 * OPEN InventoryVariance (Artefact 6 §23: "variance resolution is
 * separately audited" — resolving it is a distinct, later action, never
 * automatic here). REVIEWED if any variance is open, otherwise COMPLETED.
 */
export async function completeStocktake(id: string, actorUid: string, actorRole: UserRole) {
  const stocktake = await prisma.stocktake.findUnique({ where: { id }, include: { lines: true } })
  if (!stocktake) throw Object.assign(new Error('Stocktake not found.'), { status: 404 })
  if (stocktake.status !== 'IN_PROGRESS') throw Object.assign(new Error('Only an in-progress stocktake can be completed.'), { status: 409 })

  const variances = stocktake.lines
    .filter(l => Number(l.actualQuantity) !== Number(l.expectedQuantity))
    .map(l => ({
      stocktakeId: id,
      stocktakeLineId: l.id,
      varianceQuantity: Number(l.actualQuantity) - Number(l.expectedQuantity),
      varianceType: (Number(l.actualQuantity) < Number(l.expectedQuantity) ? 'SHORTAGE' : 'SURPLUS') as never,
      status: 'OPEN' as never,
    }))

  const updated = await prisma.$transaction(async (tx) => {
    if (variances.length) await tx.inventoryVariance.createMany({ data: variances })
    return tx.stocktake.update({
      where: { id },
      data: { status: variances.length ? 'REVIEWED' : 'COMPLETED', completedAt: new Date(), completedByUid: actorUid },
    })
  })
  await auditService.log({ action: 'inventory.stocktake.complete', entityType: 'Stocktake', entityId: id, actorUid, actorRole, metadata: { context: { varianceCount: variances.length } } })
  return updated
}

export async function resolveVariance(
  stocktakeId: string, varianceId: string,
  input: { resolution: 'RESOLVED' | 'WRITTEN_OFF'; resolutionNote?: string },
  actorUid: string, actorRole: UserRole,
) {
  const variance = await prisma.inventoryVariance.findUnique({ where: { id: varianceId } })
  if (!variance || variance.stocktakeId !== stocktakeId) throw Object.assign(new Error('Variance not found.'), { status: 404 })
  if (variance.status === 'RESOLVED' || variance.status === 'WRITTEN_OFF') {
    throw Object.assign(new Error('This variance has already been resolved.'), { status: 409 })
  }

  const updated = await prisma.$transaction(async (tx) => {
    const resolved = await tx.inventoryVariance.update({
      where: { id: varianceId },
      data: { status: input.resolution, resolvedByUid: actorUid, resolvedAt: new Date(), resolutionNote: input.resolutionNote },
    })

    const remainingOpen = await tx.inventoryVariance.count({ where: { stocktakeId, status: { in: ['OPEN', 'INVESTIGATING'] } } })
    if (remainingOpen === 0) {
      await tx.stocktake.update({ where: { id: stocktakeId }, data: { status: 'COMPLETED' } })
    }
    return resolved
  })
  await auditService.log({ action: 'inventory.stocktake.resolveVariance', entityType: 'InventoryVariance', entityId: varianceId, actorUid, actorRole, metadata: { context: { resolution: input.resolution } } })
  return updated
}
