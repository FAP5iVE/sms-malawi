/**
 * diversify.test.ts
 * [CHANGE TYPE]: NEW FILE
 */
import { describe, it, expect } from 'vitest'
import { diversify, MAX_PROGRAMMES_PER_UNIVERSITY } from '../diversify'

interface Fixture { id: string; universityId: string; score: number }

function make(id: string, universityId: string, score: number): Fixture {
  return { id, universityId, score }
}

describe('diversify', () => {
  it('REGRESSION: one university dominating raw scores no longer dominates the output', () => {
    // Exactly the reported bug: 8 of the top-scoring programmes all come
    // from one university (MUST), with only weaker programmes from two
    // other universities further down the raw ranking.
    const ranked: Fixture[] = [
      make('m1', 'must', 100), make('m2', 'must', 99), make('m3', 'must', 98),
      make('m4', 'must', 97), make('m5', 'must', 96), make('m6', 'must', 95),
      make('m7', 'must', 94), make('m8', 'must', 93),
      make('u1', 'unima', 80), make('u2', 'unima', 75),
      make('k1', 'kuhes', 70),
    ]

    const out = diversify(ranked, { limit: 10 })

    const mustCount = out.filter((x) => x.universityId === 'must').length
    expect(mustCount).toBeLessThanOrEqual(MAX_PROGRAMMES_PER_UNIVERSITY)

    // Other universities must actually appear now — the whole point of the
    // fix — not just "MUST capped, list padded with nothing".
    expect(out.some((x) => x.universityId === 'unima')).toBe(true)
    expect(out.some((x) => x.universityId === 'kuhes')).toBe(true)
  })

  it('respects a configurable cap, not a hard-coded 2', () => {
    const ranked = [make('a', 'x', 10), make('b', 'x', 9), make('c', 'x', 8), make('d', 'y', 5)]
    const out = diversify(ranked, { cap: 1, limit: 10 })
    expect(out.filter((r) => r.universityId === 'x').length).toBe(1)
  })

  it('within a university, the strongest programmes are the ones kept up to the cap', () => {
    const ranked = [make('weak', 'x', 1), make('strong', 'x', 99), make('mid', 'x', 50)]
    const out = diversify(ranked, { cap: 2, limit: 10 })
    const ids = out.map((r) => r.id)
    expect(ids).toContain('strong')
    expect(ids).toContain('mid')
    expect(ids).not.toContain('weak')
  })

  it('is stable and fair across universities with equal strength (round-robin, not first-university-wins)', () => {
    const ranked = [
      make('a1', 'a', 90), make('b1', 'b', 90), make('c1', 'c', 90),
      make('a2', 'a', 80), make('b2', 'b', 80), make('c2', 'c', 80),
    ]
    const out = diversify(ranked, { cap: 2, limit: 4 })
    // Each of a/b/c should get a fair shot at the first pass before any
    // university gets its second pick — not a/a/b/b.
    expect(out.slice(0, 3).map((r) => r.universityId)).toEqual(['a', 'b', 'c'])
  })

  it('never exceeds `limit` even with many eligible universities', () => {
    const ranked = Array.from({ length: 20 }, (_, i) => make(`p${i}`, `uni${i % 5}`, 100 - i))
    const out = diversify(ranked, { cap: 2, limit: 6 })
    expect(out.length).toBe(6)
  })

  it('gracefully exhausts when fewer eligible programmes exist than the requested limit', () => {
    const ranked = [make('a', 'x', 10), make('b', 'y', 9)]
    const out = diversify(ranked, { cap: 2, limit: 10 })
    expect(out.length).toBe(2)
  })

  it('defaults to MAX_PROGRAMMES_PER_UNIVERSITY when no cap is given', () => {
    const ranked = Array.from({ length: 5 }, (_, i) => make(`p${i}`, 'x', 10 - i))
    const out = diversify(ranked, { limit: 10 })
    expect(out.length).toBe(MAX_PROGRAMMES_PER_UNIVERSITY)
  })
})
