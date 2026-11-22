import { describe, it, expect } from 'vitest'
import { ageLabel, splitKpis, statusHeadline } from '../dashboardTiers'

const k = (...keys: string[]) => keys.map((key) => ({ key }))

describe('splitKpis', () => {
  it('leads with the preferred KPIs in the preferred order and keeps the rest', () => {
    const { primary, secondary } = splitKpis(k('a', 'b', 'c', 'd', 'e', 'f'), ['d', 'a', 'f', 'b'])
    expect(primary.map((x) => x.key)).toEqual(['d', 'a', 'f', 'b'])
    expect(secondary.map((x) => x.key)).toEqual(['c', 'e'])
  })
  it('skips a preferred KPI the server did not return and promotes the next preference', () => {
    const { primary } = splitKpis(k('a', 'b', 'c', 'd'), ['x', 'a', 'y', 'b', 'c'], 3)
    expect(primary.map((x) => x.key)).toEqual(['a', 'b', 'c'])
  })
  it('never invents a KPI: fewer available than max means fewer headlines', () => {
    const { primary, secondary } = splitKpis(k('a', 'b'), ['a', 'b', 'c', 'd'])
    expect(primary.map((x) => x.key)).toEqual(['a', 'b'])
    expect(secondary).toEqual([])
  })
  it('falls back to the first KPIs when none of the preferences exist', () => {
    const { primary, secondary } = splitKpis(k('p', 'q', 'r', 's', 't'), ['zz'])
    expect(primary.map((x) => x.key)).toEqual(['p', 'q', 'r', 's'])
    expect(secondary.map((x) => x.key)).toEqual(['t'])
  })
  it('handles empty and undefined input and a repeated preference', () => {
    expect(splitKpis(undefined, ['a'])).toEqual({ primary: [], secondary: [] })
    expect(splitKpis([], ['a'])).toEqual({ primary: [], secondary: [] })
    expect(splitKpis(k('a', 'b'), ['a', 'a', 'b']).primary.map((x) => x.key)).toEqual(['a', 'b'])
  })
  it('every KPI is in exactly one tier', () => {
    const input = k('a', 'b', 'c', 'd', 'e')
    const { primary, secondary } = splitKpis(input, ['c', 'a'], 2)
    expect([...primary, ...secondary].map((x) => x.key).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

describe('statusHeadline', () => {
  it('counts what needs watching, says all healthy only when every judged KPI is healthy, and stays quiet otherwise', () => {
    expect(statusHeadline([{ status: 'watch' }, { status: 'critical' }, { status: 'healthy' }])).toBe('2 need watching')
    expect(statusHeadline([{ status: 'watch' }])).toBe('1 needs watching')
    expect(statusHeadline([{ status: 'healthy' }, { status: 'neutral' }])).toBe('All healthy')
    expect(statusHeadline([{ status: 'neutral' }])).toBe('')
    expect(statusHeadline([])).toBe('')
  })
})

describe('ageLabel', () => {
  it('words the age and returns null — not "0 days" — when the age is not recorded', () => {
    expect(ageLabel(12)).toBe('Oldest 12 days')
    expect(ageLabel(1)).toBe('Oldest 1 day')
    expect(ageLabel(0)).toBe('Oldest today')
    expect(ageLabel(null)).toBeNull()
    expect(ageLabel(undefined)).toBeNull()
    expect(ageLabel(-3)).toBeNull()
    expect(ageLabel(Number.NaN)).toBeNull()
  })
})
