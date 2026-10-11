import { describe, it, expect } from 'vitest'
import { distributeLeaveDays, contractWindow, daysToExpiry, tenureBand, countBy, scoreBand } from '../hrLogic'

describe('distributeLeaveDays', () => {
  it('books a single-month request to that month', () => {
    const r = distributeLeaveDays(new Date('2026-03-02'), new Date('2026-03-06'), 5, 2026)
    expect(r[2]).toBe(5)
    expect(r.reduce((a, b) => a + b, 0)).toBe(5)
  })

  it('splits a request across month boundaries proportionally', () => {
    // 4 calendar days: 2 in Jan, 2 in Feb; 4 leave days -> 2 + 2
    const r = distributeLeaveDays(new Date('2026-01-30'), new Date('2026-02-02'), 4, 2026)
    expect(r[0]).toBe(2)
    expect(r[1]).toBe(2)
  })

  it('only counts the portion inside the requested year', () => {
    const r = distributeLeaveDays(new Date('2025-12-30'), new Date('2026-01-02'), 4, 2026)
    expect(r.reduce((a, b) => a + b, 0)).toBe(2)
    expect(r[0]).toBe(2)
  })

  it('handles a bad span and zero days', () => {
    expect(distributeLeaveDays(new Date('2026-05-10'), new Date('2026-05-01'), 1, 2026)[4]).toBe(1)
    expect(distributeLeaveDays(new Date('2026-05-10'), new Date('2026-05-12'), 0, 2026).every((v) => v === 0)).toBe(true)
  })
})

describe('contracts & tenure', () => {
  it('classifies expiry windows', () => {
    expect(contractWindow(-1)).toBe('expired')
    expect(contractWindow(0)).toBe('d30')
    expect(contractWindow(30)).toBe('d30')
    expect(contractWindow(31)).toBe('d60')
    expect(contractWindow(61)).toBe('d90')
    expect(contractWindow(91)).toBeNull()
    expect(daysToExpiry(new Date('2026-10-10'), new Date('2026-10-01'))).toBe(9)
  })

  it('bands tenure', () => {
    const now = new Date('2026-10-10')
    expect(tenureBand(new Date('2026-06-01'), now)).toBe('Under 1 year')
    expect(tenureBand(new Date('2024-01-01'), now)).toBe('1–3 years')
    expect(tenureBand(new Date('2010-01-01'), now)).toBe('10+ years')
  })
})

describe('countBy / scoreBand', () => {
  it('keeps ordered empty labels', () => {
    const r = countBy(['a', 'b', 'a'], (x) => x, ['a', 'b', 'c'])
    expect(r).toEqual([{ label: 'a', count: 2 }, { label: 'b', count: 1 }, { label: 'c', count: 0 }])
  })
  it('bands scores', () => {
    expect(scoreBand(4.6)).toBe('Outstanding (4.5–5)')
    expect(scoreBand(3.5)).toBe('Strong (3.5–4.4)')
    expect(scoreBand(1)).toBe('Unsatisfactory (<1.5)')
  })
})
