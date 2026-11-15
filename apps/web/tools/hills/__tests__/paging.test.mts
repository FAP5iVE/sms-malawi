/**
 * apps/web/tools/hills/__tests__/paging.test.mts
 *
 * Phase 8b-0: client side paging rules (src/lib/hills/paging.ts), RULEBOOK section 7.
 * Run with: pnpm hills:test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  PHONE_STEP,
  clampPage,
  firstRows,
  needsPaging,
  normalizePageSize,
  pageCount,
  rangeText,
  showMorePlan,
  sliceForPage,
} from '../../../src/lib/hills/paging.js'

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

test('the choices are 10, 25 and 50 and the default is 25', () => {
  assert.deepEqual([...PAGE_SIZES], [10, 25, 50])
  assert.equal(DEFAULT_PAGE_SIZE, 25)
  assert.equal(PHONE_STEP, 20)
})

test('a stored size is accepted only when it is one of the three', () => {
  assert.equal(normalizePageSize('50'), 50)
  assert.equal(normalizePageSize(10), 10)
  for (const bad of ['7', 100, 0, null, undefined, 'abc', NaN]) assert.equal(normalizePageSize(bad), 25, String(bad))
})

test('page count and clamping', () => {
  assert.equal(pageCount(0, 25), 1)
  assert.equal(pageCount(25, 25), 1)
  assert.equal(pageCount(26, 25), 2)
  assert.equal(pageCount(130, 25), 6)
  assert.equal(clampPage(0, 130, 25), 1)
  assert.equal(clampPage(99, 130, 25), 6)
  assert.equal(clampPage(2.9, 130, 25), 2)
  assert.equal(clampPage(Number.NaN, 130, 25), 1)
})

test('a page holds its own rows and the last page holds the rest', () => {
  assert.deepEqual(sliceForPage(rows(60), 1, 25), rows(25))
  assert.deepEqual(sliceForPage(rows(60), 3, 25), [51, 52, 53, 54, 55, 56, 57, 58, 59, 60])
  assert.deepEqual(sliceForPage(rows(60), 9, 25), [51, 52, 53, 54, 55, 56, 57, 58, 59, 60])
  assert.deepEqual(sliceForPage([], 1, 25), [])
})

test('the range text uses plain words and no dashes', () => {
  assert.equal(rangeText(130, 1, 25), '1 to 25 of 130')
  assert.equal(rangeText(130, 6, 25), '126 to 130 of 130')
  assert.equal(rangeText(51, 3, 25), '51 of 51')
  assert.equal(rangeText(0, 1, 25), 'No results')
  assert.doesNotMatch(rangeText(130, 2, 25), /[–—-]/)
})

test('show more adds 20, then the last few, then goes away (phones)', () => {
  assert.deepEqual(showMorePlan(20, 130), { done: false, add: 20, next: 40, label: 'Show 20 more' })
  assert.deepEqual(showMorePlan(120, 130), { done: false, add: 10, next: 130, label: 'Show 10 more' })
  assert.equal(showMorePlan(130, 130).done, true)
  assert.equal(showMorePlan(200, 130).done, true)
  assert.deepEqual(firstRows(rows(50), 20), rows(20))
})

test('a list of 10 rows or fewer needs no controls', () => {
  assert.equal(needsPaging(10), false)
  assert.equal(needsPaging(0), false)
  assert.equal(needsPaging(11), true)
  assert.equal(needsPaging(Number.NaN), false)
})
