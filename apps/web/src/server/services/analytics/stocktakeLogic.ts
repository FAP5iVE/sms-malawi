/**
 * Pure stocktake-report maths (no database access).
 *
 * No due date is recorded for a stocktake, so "overdue" is expressed with the
 * two facts the system does hold:
 *   • Age     — an uncompleted stocktake open longer than STOCKTAKE_STALE_DAYS
 *     (counted from when it started, or was created if it never started).
 *   • Coverage — active rooms with no completed stocktake in the period.
 */
import type { ApiStocktakeCoverage, ApiStocktakeReport, ApiStocktakeRow } from '@shared/types/reporting-operations'
import { daysBetween, ratioPct, round } from '@/server/services/reporting/kpi'
import { isResolved } from './operationsLogic'

export const STOCKTAKE_STALE_DAYS = 14
export const STOCKTAKE_STATUSES = ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'COMPLETED', 'CANCELLED'] as const

/** Statuses that mean the exercise is finished one way or the other. */
const FINISHED = new Set(['COMPLETED', 'CANCELLED'])

export interface StocktakeInput {
  id: string
  stocktakeNumber: string
  term: number | null
  status: string
  roomId: string | null
  building: string | null
  room: string | null
  department: string | null
  responsible: string | null
  startedAt: Date | null
  completedAt: Date | null
  createdAt: Date
  lines: { expected: number; actual: number }[]
  variances: { status: string; type: 'SHORTAGE' | 'SURPLUS'; quantity: number }[]
}

export interface RoomInput {
  id: string
  label: string
}

const num = (n: number) => (Number.isFinite(n) ? n : 0)

export function stocktakeRow(s: StocktakeInput, now: Date, staleAfterDays = STOCKTAKE_STALE_DAYS): ApiStocktakeRow {
  const finished = FINISHED.has(s.status)
  const since = s.startedAt ?? s.createdAt
  const openDays = finished ? null : Math.max(0, daysBetween(since, now))
  const expected = s.lines.reduce((t, l) => t + num(l.expected), 0)
  const counted = s.lines.reduce((t, l) => t + num(l.actual), 0)
  return {
    id: s.id,
    stocktakeNumber: s.stocktakeNumber,
    building: s.building,
    room: s.room,
    department: s.department,
    term: s.term,
    status: s.status,
    responsible: s.responsible,
    startedAt: s.startedAt ? s.startedAt.toISOString() : null,
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
    openDays,
    stale: openDays !== null && openDays > staleAfterDays,
    lines: s.lines.length,
    expected: round(expected, 2),
    counted: round(counted, 2),
    netVariance: round(counted - expected, 2),
    varianceLines: s.variances.length,
    unresolved: s.variances.filter((v) => !isResolved(v.status)).length,
  }
}

/**
 * Room coverage for the period. A room counts as counted when it has a
 * COMPLETED stocktake; "in progress" when it has only unfinished ones; and
 * "not started" when it has none (cancelled stocktakes do not count).
 */
export function roomCoverage(rooms: readonly RoomInput[], stocktakes: readonly StocktakeInput[]): ApiStocktakeCoverage {
  const byRoom = new Map<string, string[]>()
  for (const s of stocktakes) {
    if (!s.roomId || s.status === 'CANCELLED') continue
    byRoom.set(s.roomId, [...(byRoom.get(s.roomId) ?? []), s.status])
  }
  let counted = 0
  let inProgress = 0
  const notStartedRooms: { id: string; label: string }[] = []
  for (const room of rooms) {
    const statuses = byRoom.get(room.id)
    if (!statuses) notStartedRooms.push(room)
    else if (statuses.includes('COMPLETED')) counted += 1
    else inProgress += 1
  }
  return {
    activeRooms: rooms.length,
    counted,
    inProgress,
    notStarted: notStartedRooms.length,
    coverageRate: ratioPct(counted, rooms.length),
    notStartedRooms: notStartedRooms.sort((a, b) => a.label.localeCompare(b.label)),
  }
}

export function summariseStocktakes(
  stocktakes: readonly StocktakeInput[],
  rooms: readonly RoomInput[],
  now: Date,
  staleAfterDays = STOCKTAKE_STALE_DAYS,
): Pick<ApiStocktakeReport, 'totals' | 'coverage' | 'rows'> {
  const rows = stocktakes
    .map((s) => stocktakeRow(s, now, staleAfterDays))
    // Unfinished and stale first, then the most recent.
    .sort((a, b) => Number(b.stale) - Number(a.stale) || Number(a.openDays === null) - Number(b.openDays === null) || (b.openDays ?? 0) - (a.openDays ?? 0) || a.stocktakeNumber.localeCompare(b.stocktakeNumber))

  const live = stocktakes.filter((s) => s.status !== 'CANCELLED')
  const allVariances = live.flatMap((s) => s.variances)
  const lines = live.reduce((t, s) => t + s.lines.length, 0)
  const liveRows = rows.filter((r) => r.status !== 'CANCELLED')
  const expected = liveRows.reduce((t, r) => t + r.expected, 0)
  const counted = liveRows.reduce((t, r) => t + r.counted, 0)

  return {
    totals: {
      stocktakes: stocktakes.length,
      byStatus: STOCKTAKE_STATUSES.map((status) => ({ status, count: stocktakes.filter((s) => s.status === status).length })),
      incomplete: rows.filter((r) => r.openDays !== null).length,
      stale: rows.filter((r) => r.stale).length,
      lines,
      expected: round(expected, 2),
      counted: round(counted, 2),
      netVariance: round(counted - expected, 2),
      varianceLines: allVariances.length,
      varianceRate: ratioPct(allVariances.length, lines),
      unresolvedVariances: allVariances.filter((v) => !isResolved(v.status)).length,
      shortageQty: round(allVariances.filter((v) => v.type === 'SHORTAGE').reduce((t, v) => t + Math.abs(num(v.quantity)), 0), 2),
      surplusQty: round(allVariances.filter((v) => v.type === 'SURPLUS').reduce((t, v) => t + Math.abs(num(v.quantity)), 0), 2),
    },
    coverage: roomCoverage(rooms, stocktakes),
    rows,
  }
}
