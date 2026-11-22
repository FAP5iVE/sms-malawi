/**
 * Issue 6 — request COST limits: oversized ranges / pages / terms are rejected
 * before any query runs.
 */
import { describe, expect, it } from 'vitest'

import {
  REQUEST_LIMITS,
  RequestCostError,
  assertMaxItems,
  boundedInt,
  parseDateRange,
  parsePageParams,
  parseSearchTerm,
} from '../requestLimits'

describe('boundedInt', () => {
  it('returns the fallback for missing or malformed input', () => {
    expect(boundedInt(undefined, 30, 730)).toBe(30)
    expect(boundedInt('', 30, 730)).toBe(30)
    expect(boundedInt('abc', 30, 730)).toBe(30)
    expect(boundedInt('-5', 30, 730)).toBe(30)
    expect(boundedInt('1.5', 30, 730)).toBe(30)
  })

  it('accepts values up to and including the max', () => {
    expect(boundedInt('730', 30, 730)).toBe(730)
    expect(boundedInt('7', 30, 730)).toBe(7)
  })

  it('REJECTS (does not clamp) values above the max', () => {
    expect(() => boundedInt('731', 30, 730, 'days')).toThrow(RequestCostError)
    expect(() => boundedInt('99999999', 30, 730, 'days')).toThrow('"days" must be 730 or less.')
  })

  it('takes the first value of a repeated query parameter', () => {
    expect(boundedInt(['5', '9999'], 30, 730)).toBe(5)
  })
})

describe('parsePageParams', () => {
  it('applies defaults', () => {
    expect(parsePageParams({}, { defaultSize: 50 })).toEqual({ page: 1, pageSize: 50, skip: 0 })
  })

  it('computes skip', () => {
    expect(parsePageParams({ page: '3', pageSize: '25' }, { defaultSize: 50 })).toEqual({ page: 3, pageSize: 25, skip: 50 })
  })

  it('rejects an oversized page size before any query runs', () => {
    expect(() => parsePageParams({ pageSize: '201' }, { defaultSize: 50, maxSize: 200 })).toThrow(RequestCostError)
    expect(() => parsePageParams({ pageSize: '100000' }, { defaultSize: 20 })).toThrow(RequestCostError)
  })

  it('honours a per-endpoint maximum', () => {
    expect(() => parsePageParams({ pageSize: '101' }, { defaultSize: 20, maxSize: 100 })).toThrow()
    expect(parsePageParams({ pageSize: '100' }, { defaultSize: 20, maxSize: 100 }).pageSize).toBe(100)
  })
})

describe('parseDateRange', () => {
  it('parses a valid range inclusively', () => {
    const r = parseDateRange({ from: '2026-01-01', to: '2026-01-31' })!
    expect(r.days).toBe(31)
    expect(r.from.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('rejects an oversized date range', () => {
    expect(() => parseDateRange({ from: '2000-01-01', to: '2026-01-01' })).toThrow('may not exceed')
    const max = REQUEST_LIMITS.maxRangeDays
    expect(() => parseDateRange({ from: '2025-01-01', to: '2026-12-31' }, { maxDays: max })).toThrow(RequestCostError)
  })

  it('accepts exactly the maximum span', () => {
    expect(parseDateRange({ from: '2026-01-01', to: '2026-01-10' }, { maxDays: 10 })!.days).toBe(10)
    expect(() => parseDateRange({ from: '2026-01-01', to: '2026-01-11' }, { maxDays: 10 })).toThrow()
  })

  it('rejects reversed, malformed, impossible and half-specified ranges', () => {
    expect(() => parseDateRange({ from: '2026-02-01', to: '2026-01-01' })).toThrow('must not be after')
    expect(() => parseDateRange({ from: 'yesterday', to: '2026-01-01' })).toThrow('YYYY-MM-DD')
    expect(() => parseDateRange({ from: '2026-02-30', to: '2026-03-01' }, { maxDays: 400 })).toThrow()
    expect(() => parseDateRange({ from: '2026-01-01' })).toThrow('together')
    expect(() => parseDateRange({ to: '2026-01-01' }, { optional: true })).toThrow('together')
  })

  it('required by default; optional returns undefined only when BOTH are absent', () => {
    expect(() => parseDateRange({})).toThrow('required')
    expect(parseDateRange({}, { optional: true })).toBeUndefined()
  })
})

describe('parseSearchTerm', () => {
  it('trims and returns empty for missing input', () => {
    expect(parseSearchTerm('  jane  ')).toBe('jane')
    expect(parseSearchTerm(undefined)).toBe('')
  })

  it('rejects an over-long term', () => {
    expect(() => parseSearchTerm('x'.repeat(REQUEST_LIMITS.maxSearchChars + 1))).toThrow(RequestCostError)
    expect(parseSearchTerm('x'.repeat(REQUEST_LIMITS.maxSearchChars))).toHaveLength(REQUEST_LIMITS.maxSearchChars)
  })
})

describe('assertMaxItems', () => {
  it('rejects oversized lists', () => {
    expect(() => assertMaxItems(Array(11).fill(1), 10, 'ids')).toThrow('at most 10')
    expect(() => assertMaxItems(Array(10).fill(1), 10, 'ids')).not.toThrow()
    expect(() => assertMaxItems(undefined, 10, 'ids')).not.toThrow()
  })
})

describe('RequestCostError', () => {
  it('carries HTTP 400 so error handlers render it as a client error', () => {
    const e = new RequestCostError('nope')
    expect(e.status).toBe(400)
    expect(e.expose).toBe(true)
    expect(e.name).toBe('RequestCostError')
  })
})
