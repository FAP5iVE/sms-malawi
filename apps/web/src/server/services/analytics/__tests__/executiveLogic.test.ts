import { describe, it, expect } from 'vitest'
import {
  CLASS_PASS_FLOOR,
  isLowPassClass,
  selectLowPassClasses,
  selectWeakestClass,
  type ClassPassStat,
} from '../executiveLogic'

const cls = (over: Partial<ClassPassStat> & { className: string }): ClassPassStat => ({
  studentCount: 30,
  assessed: 30,
  passRate: 80,
  average: 70,
  ...over,
})

describe('class pass-rate selection — zero is a real result, missing is not', () => {
  it('flags a class with students and a genuine 0% pass rate (the regression)', () => {
    const zero = cls({ className: '4A', passRate: 0, average: 31.2 })
    expect(isLowPassClass(zero)).toBe(true)
    expect(selectLowPassClasses([zero]).map((c) => c.className)).toEqual(['4A'])
  })

  it('flags a low but non-zero pass rate', () => {
    expect(isLowPassClass(cls({ className: '3B', passRate: 12.5 }))).toBe(true)
  })

  it('treats the floor as exclusive: exactly at the threshold is not flagged', () => {
    expect(isLowPassClass(cls({ className: '2A', passRate: CLASS_PASS_FLOOR }))).toBe(false)
    expect(isLowPassClass(cls({ className: '2A', passRate: CLASS_PASS_FLOOR - 0.1 }))).toBe(true)
  })

  it('does not flag classes above the threshold', () => {
    expect(isLowPassClass(cls({ className: '1A', passRate: CLASS_PASS_FLOOR + 0.1 }))).toBe(false)
    expect(isLowPassClass(cls({ className: '1B', passRate: 100 }))).toBe(false)
  })

  it('does not flag a class with no students, even if its rate is 0', () => {
    expect(isLowPassClass(cls({ className: 'EMPTY', studentCount: 0, assessed: 0, passRate: 0 }))).toBe(false)
    expect(isLowPassClass(cls({ className: 'EMPTY2', studentCount: 0, passRate: 0 }))).toBe(false)
  })

  it('never turns missing results into a 0% failure', () => {
    const uncomputed = cls({ className: 'NORESULTS', assessed: 0, passRate: null, average: null })
    expect(isLowPassClass(uncomputed)).toBe(false)
    expect(selectLowPassClasses([uncomputed])).toEqual([])
    expect(selectWeakestClass([uncomputed])).toBeUndefined()
  })

  it('ignores a rate that is null even when the roster is non-empty', () => {
    expect(isLowPassClass(cls({ className: 'X', passRate: null }))).toBe(false)
  })

  it('selectLowPassClasses keeps only eligible classes and preserves order', () => {
    const list = [
      cls({ className: 'A', passRate: 0 }),
      cls({ className: 'B', passRate: 90 }),
      cls({ className: 'C', passRate: null, assessed: 0, average: null }),
      cls({ className: 'D', passRate: 45 }),
      cls({ className: 'E', passRate: 0, studentCount: 0, assessed: 0 }),
    ]
    expect(selectLowPassClasses(list).map((c) => c.className)).toEqual(['A', 'D'])
  })
})

describe('weakest class', () => {
  it('picks a genuine 0% class as the weakest', () => {
    const list = [cls({ className: 'A', passRate: 40 }), cls({ className: 'B', passRate: 0 }), cls({ className: 'C', passRate: 75 })]
    expect(selectWeakestClass(list)?.className).toBe('B')
  })

  it('skips classes with no computed rate or no students', () => {
    const list = [
      cls({ className: 'NONE', passRate: null, assessed: 0, average: null }),
      cls({ className: 'EMPTY', studentCount: 0, assessed: 0, passRate: 0 }),
      cls({ className: 'REAL', passRate: 55 }),
    ]
    expect(selectWeakestClass(list)?.className).toBe('REAL')
  })

  it('breaks ties by the lower average, then by name, so the result is deterministic', () => {
    const list = [
      cls({ className: 'B', passRate: 20, average: 40 }),
      cls({ className: 'A', passRate: 20, average: 35 }),
      cls({ className: 'C', passRate: 20, average: 35 }),
    ]
    expect(selectWeakestClass(list)?.className).toBe('A')
  })

  it('returns undefined for an empty list', () => {
    expect(selectWeakestClass([])).toBeUndefined()
  })

  it('does not mutate its input', () => {
    const list = [cls({ className: 'A', passRate: 90 }), cls({ className: 'B', passRate: 10 })]
    selectWeakestClass(list)
    expect(list.map((c) => c.className)).toEqual(['A', 'B'])
  })
})

import { ATTENTION_ROUTING, PRIMARY_KPI_KEYS, enrichAttention, rankAttention, selectPrimaryKpis } from '../executiveLogic'

describe('selectPrimaryKpis', () => {
  const groups = [
    { kpis: [{ key: 'schoolPassRate' }, { key: 'schoolAverage' }] },
    { kpis: [{ key: 'attendanceRate' }, { key: 'active' }, { key: 'pending' }] },
    { kpis: [{ key: 'collectionRate' }, { key: 'outstanding' }] },
  ]
  it('returns the four headline KPIs in reading order, whichever group holds them', () => {
    expect(selectPrimaryKpis(groups).map((k) => k.key)).toEqual(['active', 'attendanceRate', 'schoolPassRate', 'collectionRate'])
    expect([...PRIMARY_KPI_KEYS]).toHaveLength(4)
  })
  it('leaves out a headline the viewer has no data for instead of inventing one', () => {
    const noFinance = groups.slice(0, 2)
    expect(selectPrimaryKpis(noFinance).map((k) => k.key)).toEqual(['active', 'attendanceRate', 'schoolPassRate'])
    expect(selectPrimaryKpis([])).toEqual([])
  })
})

describe('attention ranking and routing', () => {
  const item = (key: string, severity: 'critical' | 'watch' | 'info', count: number | null, ageDays?: number | null) =>
    ({ key, severity, count, ...(ageDays !== undefined ? { ageDays } : {}) })

  it('orders by severity, then the oldest item, then the bigger group', () => {
    const out = rankAttention([
      item('a', 'watch', 50),
      item('b', 'critical', 2, 3),
      item('c', 'critical', 9, 20),
      item('d', 'watch', 5, 40),
      item('e', 'critical', 4),
      item('f', 'info', 99, 90),
    ])
    expect(out.map((i) => i.key)).toEqual(['c', 'b', 'e', 'd', 'a', 'f'])
  })
  it('drops empty groups but keeps a real count', () => {
    expect(rankAttention([item('a', 'critical', 0), item('b', 'watch', null), item('c', 'info', 1)]).map((i) => i.key)).toEqual(['c'])
  })
  it('adds owner and action from the routing table and keeps ones already set', () => {
    const [a, b, c] = enrichAttention([
      item('expenses-pending', 'watch', 2),
      { ...item('arrears-severe', 'critical', 3), owner: 'Bursar' },
      item('something-new', 'info', 1),
    ])
    expect(a).toMatchObject({ owner: 'Headteacher', action: 'Approve or decline expenses' })
    expect(b).toMatchObject({ owner: 'Bursar', action: 'Collect overdue fees' })
    expect(c?.owner).toBeUndefined()
  })
  it('every routing entry has an owner and an action', () => {
    for (const [k, v] of Object.entries(ATTENTION_ROUTING)) {
      expect(v.owner.length, k).toBeGreaterThan(0)
      expect(v.action.length, k).toBeGreaterThan(0)
    }
  })
})
