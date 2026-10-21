import { describe, it, expect } from 'vitest'
import { roomCoverage, summariseStocktakes, type StocktakeInput } from '../stocktakeLogic'

const NOW = new Date('2026-03-31T00:00:00Z')
const ago = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

const st = (over: Partial<StocktakeInput> & { id: string; roomId: string | null; status: string }): StocktakeInput => ({
  stocktakeNumber: `ST-${over.id}`,
  term: 1,
  building: 'Main',
  room: `Room ${over.id}`,
  department: null,
  responsible: 'Mr Banda',
  startedAt: ago(3),
  completedAt: null,
  createdAt: ago(4),
  lines: [],
  variances: [],
  ...over,
})

const rooms = [
  { id: 'r1', label: 'Main · Lab' },
  { id: 'r2', label: 'Main · Library' },
  { id: 'r3', label: 'Main · Store' },
  { id: 'r4', label: 'Annex · Hall' },
]

const stocktakes: StocktakeInput[] = [
  // r1: completed, 10 lines: expected 100, counted 96 (one shortage of 4, unresolved) + a surplus of 1 resolved
  st({
    id: '1', roomId: 'r1', status: 'COMPLETED', completedAt: ago(1),
    lines: [{ expected: 60, actual: 56 }, { expected: 30, actual: 31 }, { expected: 10, actual: 10 }],
    variances: [{ status: 'OPEN', type: 'SHORTAGE', quantity: -4 }, { status: 'RESOLVED', type: 'SURPLUS', quantity: 1 }],
  }),
  // r2: in progress for 20 days → stale
  st({ id: '2', roomId: 'r2', status: 'IN_PROGRESS', startedAt: ago(20), lines: [{ expected: 5, actual: 5 }] }),
  // r3: cancelled → does not count as started
  st({ id: '3', roomId: 'r3', status: 'CANCELLED', lines: [{ expected: 7, actual: 0 }], variances: [{ status: 'OPEN', type: 'SHORTAGE', quantity: -7 }] }),
  // department-wide count with no room
  st({ id: '4', roomId: null, status: 'DRAFT', room: null, startedAt: null, createdAt: ago(5) }),
]

describe('stocktake report', () => {
  it('computes expected, counted and variance from the recorded lines, excluding cancelled counts', () => {
    const r = summariseStocktakes(stocktakes, rooms, NOW)
    expect(r.totals).toMatchObject({ stocktakes: 4, lines: 4, expected: 105, counted: 102, netVariance: -3, varianceLines: 2 })
    expect(r.totals.varianceRate).toBe(50)
    expect(r.totals.unresolvedVariances).toBe(1) // the cancelled stocktake's variance is not counted
    expect(r.totals.shortageQty).toBe(4)
    expect(r.totals.surplusQty).toBe(1)
  })

  it('flags an uncompleted stocktake open longer than the stale threshold, but not a young one', () => {
    const r = summariseStocktakes(stocktakes, rooms, NOW)
    expect(r.rows.find((x) => x.id === '2')).toMatchObject({ openDays: 20, stale: true })
    expect(r.rows.find((x) => x.id === '4')).toMatchObject({ openDays: 5, stale: false })
    expect(r.rows.find((x) => x.id === '1')).toMatchObject({ openDays: null, stale: false })
    expect(r.totals.incomplete).toBe(2)
    expect(r.totals.stale).toBe(1)
    expect(r.rows[0]?.id).toBe('2') // stale work comes first
  })

  it('lists every status, with zero counts', () => {
    const r = summariseStocktakes(stocktakes, rooms, NOW)
    expect(r.totals.byStatus.map((s) => s.status)).toEqual(['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'COMPLETED', 'CANCELLED'])
    expect(r.totals.byStatus.find((s) => s.status === 'REVIEWED')?.count).toBe(0)
    expect(r.totals.byStatus.reduce((t, s) => t + s.count, 0)).toBe(r.totals.stocktakes)
  })

  it('room coverage: counted, in progress and not started add up to the active rooms', () => {
    const c = roomCoverage(rooms, stocktakes)
    expect(c).toMatchObject({ activeRooms: 4, counted: 1, inProgress: 1, notStarted: 2 })
    expect(c.counted + c.inProgress + c.notStarted).toBe(c.activeRooms)
    expect(c.coverageRate).toBe(25)
    expect(c.notStartedRooms.map((r) => r.label)).toEqual(['Annex · Hall', 'Main · Store']) // r3's only stocktake was cancelled
  })

  it('coverage rate is null — not 0% — when there are no rooms', () => {
    expect(roomCoverage([], stocktakes).coverageRate).toBeNull()
  })

  it('a room with a completed and an unfinished stocktake counts as counted', () => {
    const c = roomCoverage([{ id: 'r1', label: 'Lab' }], [st({ id: 'a', roomId: 'r1', status: 'COMPLETED' }), st({ id: 'b', roomId: 'r1', status: 'IN_PROGRESS' })])
    expect(c).toMatchObject({ counted: 1, inProgress: 0 })
  })

  it('variance rate is null when no lines were counted', () => {
    expect(summariseStocktakes([], rooms, NOW).totals.varianceRate).toBeNull()
  })
})
