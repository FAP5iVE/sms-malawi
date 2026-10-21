/**
 * Pure stock-level maths (no database access). Balances come from
 * inventoryBalance.ts — the same rule the stock screens use — so a figure here
 * always matches the item list.
 */
import type {
  ApiLowStockRow,
  ApiStockMovementRow,
  ApiStockReport,
} from '@shared/types/reporting-operations'
import { balanceFromTransactions, totalEffect } from '@/server/services/inventoryBalance'
import { round } from '@/server/services/reporting/kpi'

export const LOW_STOCK_CAP = 100
export const MOVEMENT_CAP = 100

const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const dayLabel = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })

export interface StockItem {
  id: string
  itemCode: string
  name: string
  category: string | null
  unit: string
  reorderLevel: number | null
  reorderQuantity: number | null
}

export interface StockTransaction {
  id: string
  inventoryItemId: string
  transactionType: string
  quantity: number
  createdAt: Date
  sourceRoomId: string | null
  destinationRoomId: string | null
  sourceRoom: string | null
  destinationRoom: string | null
  department: string | null
  reason: string | null
}

type Out = Pick<ApiStockReport, 'totals' | 'low' | 'movementsByType' | 'movementsByDay' | 'movements' | 'movementsTruncated'>

/**
 * @param allTransactions every transaction (balances are school-wide)
 * @param windowTransactions the transactions in the reporting window that match
 *   the department / room filters (movements, not balances)
 */
export function summariseStock(
  items: readonly StockItem[],
  allTransactions: readonly StockTransaction[],
  windowTransactions: readonly StockTransaction[],
  from: Date,
  to: Date,
  itemLookup: ReadonlyMap<string, StockItem> = new Map(items.map((i) => [i.id, i])),
): Out {
  const byItem = new Map<string, StockTransaction[]>()
  for (const t of allTransactions) byItem.set(t.inventoryItemId, [...(byItem.get(t.inventoryItemId) ?? []), t])

  const winByItem = new Map<string, StockTransaction[]>()
  for (const t of windowTransactions) winByItem.set(t.inventoryItemId, [...(winByItem.get(t.inventoryItemId) ?? []), t])

  let belowReorder = 0
  let outOfStock = 0
  let negative = 0
  let withoutReorderLevel = 0
  let neverStocked = 0
  const low: ApiLowStockRow[] = []

  for (const item of items) {
    const txs = byItem.get(item.id) ?? []
    if (txs.length === 0) neverStocked += 1
    const balance = balanceFromTransactions(txs).total
    if (txs.length > 0 && balance <= 0) outOfStock += 1
    if (balance < 0) negative += 1
    if (item.reorderLevel === null) {
      withoutReorderLevel += 1
      continue
    }
    if (txs.length === 0 || balance > item.reorderLevel) continue
    belowReorder += 1
    const win = winByItem.get(item.id) ?? []
    const effects = win.map((t) => totalEffect(t.transactionType, t.quantity))
    const last = txs.reduce<Date | null>((m, t) => (m === null || t.createdAt.getTime() > m.getTime() ? t.createdAt : m), null)
    low.push({
      itemId: item.id,
      itemCode: item.itemCode,
      name: item.name,
      category: item.category,
      unit: item.unit,
      balance: round(balance, 2),
      reorderLevel: item.reorderLevel,
      reorderQuantity: item.reorderQuantity,
      shortfall: round(Math.max(0, item.reorderLevel - balance), 2),
      state: balance < 0 ? 'negative' : balance === 0 ? 'out' : 'low',
      receivedInWindow: round(effects.filter((e) => e > 0).reduce((s, e) => s + e, 0), 2),
      issuedInWindow: round(Math.abs(effects.filter((e) => e < 0).reduce((s, e) => s + e, 0)), 2),
      netChangeInWindow: round(effects.reduce((s, e) => s + e, 0), 2),
      lastMovementAt: last ? last.toISOString() : null,
    })
  }

  low.sort((a, b) => ({ negative: 0, out: 1, low: 2 })[a.state] - ({ negative: 0, out: 1, low: 2 })[b.state] || b.shortfall - a.shortfall || a.name.localeCompare(b.name))

  const types = new Map<string, { count: number; quantity: number }>()
  const days = new Map<string, { inbound: number; outbound: number }>()
  for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t <= to.getTime(); t += 86_400_000) {
    days.set(dayKey(new Date(t)), { inbound: 0, outbound: 0 })
  }
  for (const t of windowTransactions) {
    const cur = types.get(t.transactionType) ?? { count: 0, quantity: 0 }
    cur.count += 1
    cur.quantity += t.quantity
    types.set(t.transactionType, cur)
    const eff = totalEffect(t.transactionType, t.quantity)
    const d = days.get(dayKey(t.createdAt))
    if (d) {
      if (eff > 0) d.inbound += eff
      else if (eff < 0) d.outbound += -eff
    }
  }

  const movements: ApiStockMovementRow[] = [...windowTransactions]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, MOVEMENT_CAP)
    .map((t) => {
      const item = itemLookup.get(t.inventoryItemId)
      return {
        id: t.id,
        at: t.createdAt.toISOString(),
        itemId: t.inventoryItemId,
        itemCode: item?.itemCode ?? '—',
        itemName: item?.name ?? 'Unknown item',
        type: t.transactionType,
        quantity: t.quantity,
        effect: totalEffect(t.transactionType, t.quantity),
        from: t.sourceRoom,
        to: t.destinationRoom,
        department: t.department,
        reason: t.reason,
      }
    })

  return {
    totals: { items: items.length, belowReorder, outOfStock, negative, withoutReorderLevel, neverStocked },
    low: low.slice(0, LOW_STOCK_CAP),
    movementsByType: Array.from(types, ([type, v]) => ({ type, count: v.count, quantity: round(v.quantity, 2) })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    movementsByDay: Array.from(days, ([date, v]) => ({ date, label: dayLabel(date), inbound: round(v.inbound, 2), outbound: round(v.outbound, 2) })),
    movements,
    movementsTruncated: windowTransactions.length > MOVEMENT_CAP,
  }
}
