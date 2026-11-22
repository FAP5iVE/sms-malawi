import { describe, it, expect } from 'vitest'
import { balanceFromTransactions, totalEffect } from '@/server/services/inventoryBalance'
import { summariseStock, type StockItem, type StockTransaction } from '../stockLevelLogic'

const FROM = new Date('2026-03-01T00:00:00Z')
const TO = new Date('2026-03-03T23:59:59Z')
const at = (s: string) => new Date(s)

const item = (id: string, reorder: number | null, extra: Partial<StockItem> = {}): StockItem => ({
  id, itemCode: `C-${id}`, name: `Item ${id}`, category: 'Stationery', unit: 'box', reorderLevel: reorder, reorderQuantity: reorder === null ? null : reorder * 2, ...extra,
})

const tx = (id: string, itemId: string, type: string, qty: number, when: string, extra: Partial<StockTransaction> = {}): StockTransaction => ({
  id, inventoryItemId: itemId, transactionType: type, quantity: qty, createdAt: at(when),
  sourceRoomId: null, destinationRoomId: null, sourceRoom: null, destinationRoom: null, department: null, reason: null, ...extra,
})

describe('inventoryBalance', () => {
  it('sums inbound and subtracts outbound; a transfer moves rooms but not the total', () => {
    const b = balanceFromTransactions([
      { transactionType: 'OPENING_BALANCE', quantity: 100, sourceRoomId: null, destinationRoomId: 'store' },
      { transactionType: 'ISSUE', quantity: 30, sourceRoomId: 'store', destinationRoomId: null },
      { transactionType: 'TRANSFER', quantity: 20, sourceRoomId: 'store', destinationRoomId: 'lab' },
      { transactionType: 'LOSS', quantity: 5, sourceRoomId: null, destinationRoomId: null },
    ])
    expect(b.total).toBe(65)
    expect(b.byRoom).toEqual({ store: 100 - 30 - 20, lab: 20 })
  })

  it('transfer has no effect on the total', () => {
    expect(totalEffect('TRANSFER', 10)).toBe(0)
    expect(totalEffect('RECEIPT', 10)).toBe(10)
    expect(totalEffect('DAMAGE', 10)).toBe(-10)
  })
})

describe('stock levels', () => {
  const items = [item('a', 20), item('b', 10), item('c', 10), item('d', null), item('e', 5), item('f', 10)]
  const all = [
    tx('1', 'a', 'OPENING_BALANCE', 50, '2026-01-10T00:00:00Z'),
    tx('2', 'a', 'ISSUE', 35, '2026-03-02T09:00:00Z', { department: 'Science', reason: 'Term 2 practicals' }),
    tx('3', 'b', 'OPENING_BALANCE', 10, '2026-01-10T00:00:00Z'),
    tx('4', 'b', 'ISSUE', 10, '2026-03-01T09:00:00Z'),
    tx('5', 'c', 'OPENING_BALANCE', 100, '2026-01-10T00:00:00Z'),
    tx('6', 'd', 'OPENING_BALANCE', 1, '2026-01-10T00:00:00Z'),
    tx('7', 'e', 'OPENING_BALANCE', 2, '2026-01-10T00:00:00Z'),
    tx('8', 'e', 'LOSS', 3, '2026-02-10T00:00:00Z'), // data error: balance −1
    // item f has no transactions at all
  ]
  const window = all.filter((t) => t.createdAt >= FROM && t.createdAt <= TO)
  const r = summariseStock(items, all, window, FROM, TO)

  it('counts items below their reorder level using the transaction-derived balance', () => {
    expect(r.totals).toMatchObject({ items: 6, belowReorder: 3, outOfStock: 2, negative: 1, withoutReorderLevel: 1, neverStocked: 1 })
  })

  it('lists negative, then out-of-stock, then low items, biggest shortfall first', () => {
    expect(r.low.map((l) => [l.itemId, l.state])).toEqual([['e', 'negative'], ['b', 'out'], ['a', 'low']])
    expect(r.low.find((l) => l.itemId === 'a')).toMatchObject({ balance: 15, reorderLevel: 20, shortfall: 5 })
  })

  it('explains each low item with the movements in the window', () => {
    expect(r.low.find((l) => l.itemId === 'a')).toMatchObject({ issuedInWindow: 35, receivedInWindow: 0, netChangeInWindow: -35 })
    expect(r.low.find((l) => l.itemId === 'b')).toMatchObject({ netChangeInWindow: -10, lastMovementAt: '2026-03-01T09:00:00.000Z' })
  })

  it('an item with no reorder level or no movements is never reported as low', () => {
    expect(r.low.map((l) => l.itemId)).not.toContain('d')
    expect(r.low.map((l) => l.itemId)).not.toContain('f')
  })

  it('summarises movements by type and by day, and lists them newest first', () => {
    expect(r.movementsByType).toEqual([{ type: 'ISSUE', count: 2, quantity: 45 }])
    expect(r.movementsByDay.map((d) => [d.date, d.outbound])).toEqual([['2026-03-01', 10], ['2026-03-02', 35], ['2026-03-03', 0]])
    expect(r.movements.map((m) => m.id)).toEqual(['2', '4'])
    expect(r.movements[0]).toMatchObject({ itemName: 'Item a', effect: -35, department: 'Science', reason: 'Term 2 practicals' })
  })

  it('a day with no movements is shown as zero, not skipped', () => {
    expect(r.movementsByDay).toHaveLength(3)
  })

  it('handles an empty catalogue', () => {
    const e = summariseStock([], [], [], FROM, TO)
    expect(e.totals).toEqual({ items: 0, belowReorder: 0, outOfStock: 0, negative: 0, withoutReorderLevel: 0, neverStocked: 0 })
    expect(e.low).toEqual([])
  })
})
