/*
 * apps/web/src/server/services/inventoryService.ts
 *
 * [CHANGE TYPE]: REWRITE (R22) — the partner's delivered draft had
 *   getStockBalance/receiveStock/issueStock only. The UI (useAssetsInventory.ts)
 *   is wired to a "Transfer" action and item/transaction list views that had
 *   no backend at all — added here.
 *
 * [PRINCIPLE]: Inventory quantity is never a stored, mutable number — it's
 *   always derived by summing InventoryTransaction rows (Artefact 6 §21 /
 *   §20's "no parallel mutable balance" rule). Every function here that
 *   changes stock does so by inserting a transaction row, never by writing
 *   to a balance field.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (InventoryItem,
 *   InventoryTransaction — R22)
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'
import type { UserRole } from '@shared/types/roles'

const INBOUND: string[] = ['OPENING_BALANCE', 'RECEIPT', 'RETURN', 'ADJUSTMENT']
const OUTBOUND: string[] = ['ISSUE', 'TRANSFER', 'DAMAGE', 'LOSS', 'DISPOSAL']
// Note: TRANSFER is modelled as one outbound leg from sourceRoomId and one inbound
// leg (also transactionType TRANSFER) into destinationRoomId — see transferStock().
// A transfer's *net* effect on total quantity is zero; it only moves the
// room-level distribution, so it's excluded from the plain outbound sum below
// and instead handled by summing per-room in getStockBalance's `byRoom`.

function signedQuantity(transactionType: string, quantity: number, isDestinationLeg: boolean): number {
  if (transactionType === 'TRANSFER') return isDestinationLeg ? quantity : -quantity
  if (INBOUND.includes(transactionType)) return quantity
  if (OUTBOUND.includes(transactionType)) return -quantity
  return 0
}

// ─── ITEMS ────────────────────────────────────────────────

export async function listItems(filters: { category?: string; search?: string; lowStock?: boolean; includeInactive?: boolean }) {
  const items = await prisma.inventoryItem.findMany({
    where: {
      category: filters.category,
      isActive: filters.includeInactive ? undefined : true,
      ...(filters.search ? { OR: [{ name: { contains: filters.search, mode: 'insensitive' } }, { itemCode: { contains: filters.search, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { name: 'asc' },
  })
  const balances = await Promise.all(items.map(i => getStockBalance(i.id)))
  const enriched = items.map((item, idx) => ({ ...item, currentBalance: balances[idx]!.total, belowReorderLevel: item.reorderLevel != null && balances[idx]!.total <= Number(item.reorderLevel) }))
  return filters.lowStock ? enriched.filter(i => i.belowReorderLevel) : enriched
}

export async function createItem(
  input: { itemCode: string; name: string; category?: string; description?: string; unitOfMeasure: string; reorderLevel?: number; reorderQuantity?: number },
  actorUid: string, actorRole: UserRole,
) {
  const existing = await prisma.inventoryItem.findUnique({ where: { itemCode: input.itemCode } })
  if (existing) throw Object.assign(new Error('An inventory item with this code already exists.'), { status: 409 })

  const item = await prisma.inventoryItem.create({ data: { ...input } })
  await auditService.log({ action: 'inventory.item.create', entityType: 'InventoryItem', entityId: item.id, actorUid, actorRole, metadata: { context: { itemCode: item.itemCode } } })
  return item
}

export async function updateItem(
  id: string, input: { name?: string; category?: string; description?: string; reorderLevel?: number; reorderQuantity?: number; isActive?: boolean },
  actorUid: string, actorRole: UserRole,
) {
  const existing = await prisma.inventoryItem.findUnique({ where: { id } })
  if (!existing) throw Object.assign(new Error('Inventory item not found.'), { status: 404 })

  const item = await prisma.inventoryItem.update({ where: { id }, data: input })
  await auditService.log({ action: 'inventory.item.update', entityType: 'InventoryItem', entityId: id, actorUid, actorRole, metadata: { before: existing, after: input } })
  return item
}

// ─── BALANCE ──────────────────────────────────────────────

export async function getStockBalance(inventoryItemId: string) {
  const transactions = await prisma.inventoryTransaction.findMany({ where: { inventoryItemId } })

  const byRoom = new Map<string, number>()
  let total = 0

  for (const t of transactions) {
    const qty = Number(t.quantity)
    if (t.transactionType === 'TRANSFER') {
      if (t.sourceRoomId) byRoom.set(t.sourceRoomId, (byRoom.get(t.sourceRoomId) ?? 0) - qty)
      if (t.destinationRoomId) byRoom.set(t.destinationRoomId, (byRoom.get(t.destinationRoomId) ?? 0) + qty)
      continue // net zero on total — a transfer never changes how much exists, only where
    }
    const delta = INBOUND.includes(t.transactionType) ? qty : OUTBOUND.includes(t.transactionType) ? -qty : 0
    total += delta
    const room = t.destinationRoomId ?? t.sourceRoomId
    if (room) byRoom.set(room, (byRoom.get(room) ?? 0) + delta)
  }

  return { inventoryItemId, total, byRoom: Object.fromEntries(byRoom) }
}

export async function listTransactions(filters: { inventoryItemId?: string; departmentId?: string; roomId?: string; limit?: number }) {
  return prisma.inventoryTransaction.findMany({
    where: {
      inventoryItemId: filters.inventoryItemId,
      departmentId: filters.departmentId,
      OR: filters.roomId ? [{ sourceRoomId: filters.roomId }, { destinationRoomId: filters.roomId }] : undefined,
    },
    include: { inventoryItem: { select: { name: true, itemCode: true, unitOfMeasure: true } } },
    orderBy: { createdAt: 'desc' },
    take: filters.limit ?? 100,
  })
}

// ─── MOVEMENTS ────────────────────────────────────────────

export async function receiveStock(
  input: { inventoryItemId: string; quantity: number; destinationRoomId?: string; departmentId?: string; reason?: string },
  actorUid: string, actorRole: UserRole,
) {
  if (input.quantity <= 0) throw Object.assign(new Error('Quantity must be positive.'), { status: 400 })
  const item = await prisma.inventoryItem.findUnique({ where: { id: input.inventoryItemId } })
  if (!item) throw Object.assign(new Error('Inventory item not found.'), { status: 404 })

  const transaction = await prisma.inventoryTransaction.create({
    data: {
      inventoryItemId: input.inventoryItemId,
      transactionType: 'RECEIPT',
      quantity: input.quantity,
      destinationRoomId: input.destinationRoomId,
      departmentId: input.departmentId,
      reason: input.reason,
      performedByUid: actorUid,
    },
  })
  await auditService.log({ action: 'inventory.receive', entityType: 'InventoryTransaction', entityId: transaction.id, actorUid, actorRole, metadata: { context: { inventoryItemId: input.inventoryItemId, quantity: input.quantity } } })
  return transaction
}

export async function issueStock(
  input: { inventoryItemId: string; quantity: number; sourceRoomId?: string; departmentId?: string; reason?: string },
  actorUid: string, actorRole: UserRole,
) {
  if (input.quantity <= 0) throw Object.assign(new Error('Quantity must be positive.'), { status: 400 })

  const balance = await getStockBalance(input.inventoryItemId)
  if (input.quantity > balance.total) {
    throw Object.assign(new Error(`Cannot issue ${input.quantity} — only ${balance.total} in stock.`), { status: 409 })
  }
  if (input.sourceRoomId) {
    const roomBalance = balance.byRoom[input.sourceRoomId] ?? 0
    if (input.quantity > roomBalance) {
      throw Object.assign(new Error(`Cannot issue ${input.quantity} from this room — only ${roomBalance} recorded there.`), { status: 409 })
    }
  }

  const transaction = await prisma.inventoryTransaction.create({
    data: {
      inventoryItemId: input.inventoryItemId,
      transactionType: 'ISSUE',
      quantity: input.quantity,
      sourceRoomId: input.sourceRoomId,
      departmentId: input.departmentId,
      reason: input.reason,
      performedByUid: actorUid,
    },
  })
  await auditService.log({ action: 'inventory.issue', entityType: 'InventoryTransaction', entityId: transaction.id, actorUid, actorRole, metadata: { context: { inventoryItemId: input.inventoryItemId, quantity: input.quantity } } })
  return transaction
}

export async function transferStock(
  input: { inventoryItemId: string; quantity: number; sourceRoomId: string; destinationRoomId: string; reason?: string },
  actorUid: string, actorRole: UserRole,
) {
  if (input.quantity <= 0) throw Object.assign(new Error('Quantity must be positive.'), { status: 400 })
  if (input.sourceRoomId === input.destinationRoomId) {
    throw Object.assign(new Error('Source and destination rooms must be different.'), { status: 400 })
  }

  const balance = await getStockBalance(input.inventoryItemId)
  const sourceBalance = balance.byRoom[input.sourceRoomId] ?? 0
  if (input.quantity > sourceBalance) {
    throw Object.assign(new Error(`Cannot transfer ${input.quantity} — only ${sourceBalance} recorded in the source room.`), { status: 409 })
  }

  // A single TRANSFER row carries both sourceRoomId and destinationRoomId;
  // getStockBalance()/listTransactions() read it as one movement, not two.
  const transaction = await prisma.inventoryTransaction.create({
    data: {
      inventoryItemId: input.inventoryItemId,
      transactionType: 'TRANSFER',
      quantity: input.quantity,
      sourceRoomId: input.sourceRoomId,
      destinationRoomId: input.destinationRoomId,
      reason: input.reason,
      performedByUid: actorUid,
    },
  })
  await auditService.log({ action: 'inventory.transfer', entityType: 'InventoryTransaction', entityId: transaction.id, actorUid, actorRole, metadata: { context: { inventoryItemId: input.inventoryItemId, quantity: input.quantity, from: input.sourceRoomId, to: input.destinationRoomId } } })
  return transaction
}

export async function adjustStock(
  input: { inventoryItemId: string; quantity: number; direction: 'INCREASE' | 'DECREASE'; reason: string },
  actorUid: string, actorRole: UserRole,
) {
  if (input.quantity <= 0) throw Object.assign(new Error('Quantity must be positive.'), { status: 400 })
  if (!input.reason?.trim()) throw Object.assign(new Error('A reason is required for a stock adjustment.'), { status: 400 })

  const transactionType = input.direction === 'INCREASE' ? 'ADJUSTMENT' : 'LOSS'
  if (input.direction === 'DECREASE') {
    const balance = await getStockBalance(input.inventoryItemId)
    if (input.quantity > balance.total) throw Object.assign(new Error(`Cannot reduce by ${input.quantity} — only ${balance.total} in stock.`), { status: 409 })
  }

  const transaction = await prisma.inventoryTransaction.create({
    data: { inventoryItemId: input.inventoryItemId, transactionType, quantity: input.quantity, reason: input.reason, performedByUid: actorUid },
  })
  await auditService.log({ action: 'inventory.adjust', entityType: 'InventoryTransaction', entityId: transaction.id, actorUid, actorRole, metadata: { context: { direction: input.direction, quantity: input.quantity, reason: input.reason } } })
  return transaction
}
