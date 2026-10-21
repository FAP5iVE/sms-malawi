/**
 * Pure stock-balance maths shared by inventoryService (the stock screens) and
 * the inventory reports, so both always agree. Inventory is never a stored
 * number: a balance is the sum of its InventoryTransaction rows.
 */
export const INBOUND: readonly string[] = ['OPENING_BALANCE', 'RECEIPT', 'RETURN', 'ADJUSTMENT']
export const OUTBOUND: readonly string[] = ['ISSUE', 'TRANSFER', 'DAMAGE', 'LOSS', 'DISPOSAL']

export interface BalanceTransaction {
  transactionType: string
  quantity: number | string | { toString(): string }
  sourceRoomId: string | null
  destinationRoomId: string | null
}

export interface StockBalance {
  total: number
  byRoom: Record<string, number>
}

/**
 * Net quantity of one item. A transfer never changes how much exists, only
 * where, so it moves quantity between rooms without touching the total.
 */
export function balanceFromTransactions(transactions: readonly BalanceTransaction[]): StockBalance {
  const byRoom = new Map<string, number>()
  let total = 0

  for (const t of transactions) {
    const qty = Number(t.quantity)
    if (!Number.isFinite(qty)) continue
    if (t.transactionType === 'TRANSFER') {
      if (t.sourceRoomId) byRoom.set(t.sourceRoomId, (byRoom.get(t.sourceRoomId) ?? 0) - qty)
      if (t.destinationRoomId) byRoom.set(t.destinationRoomId, (byRoom.get(t.destinationRoomId) ?? 0) + qty)
      continue
    }
    const delta = INBOUND.includes(t.transactionType) ? qty : OUTBOUND.includes(t.transactionType) ? -qty : 0
    total += delta
    const room = t.destinationRoomId ?? t.sourceRoomId
    if (room) byRoom.set(room, (byRoom.get(room) ?? 0) + delta)
  }

  return { total, byRoom: Object.fromEntries(byRoom) }
}

/** Signed effect of one transaction on the total (0 for a transfer). */
export function totalEffect(transactionType: string, quantity: number): number {
  if (!Number.isFinite(quantity)) return 0
  if (INBOUND.includes(transactionType)) return quantity
  if (OUTBOUND.includes(transactionType) && transactionType !== 'TRANSFER') return -quantity
  return 0
}
