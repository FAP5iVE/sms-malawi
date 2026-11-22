/**
 * apps/web/tools/hills/__tests__/moreSheet.test.mts
 *
 * Phase 8d follow-up: the shared "More sheet is open" flag (src/lib/hills/moreSheet.ts).
 * Run with: pnpm hills:test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getMoreSheetOpen, setMoreSheetOpen, subscribeMoreSheet } from '../../../src/lib/hills/moreSheet.js'

test('starts closed', () => {
  assert.equal(getMoreSheetOpen(), false)
})

test('open and close are visible to every subscriber', () => {
  let a = 0
  let b = 0
  const offA = subscribeMoreSheet(() => a++)
  const offB = subscribeMoreSheet(() => b++)
  setMoreSheetOpen(true)
  assert.equal(getMoreSheetOpen(), true)
  setMoreSheetOpen(false)
  assert.equal(getMoreSheetOpen(), false)
  assert.deepEqual([a, b], [2, 2])
  offA()
  offB()
})

test('setting the same value again notifies nobody', () => {
  let calls = 0
  const off = subscribeMoreSheet(() => calls++)
  setMoreSheetOpen(false)
  setMoreSheetOpen(false)
  assert.equal(calls, 0)
  setMoreSheetOpen(true)
  setMoreSheetOpen(true)
  assert.equal(calls, 1)
  setMoreSheetOpen(false)
  off()
})

test('an unsubscribed listener is not called again', () => {
  let calls = 0
  const off = subscribeMoreSheet(() => calls++)
  off()
  setMoreSheetOpen(true)
  setMoreSheetOpen(false)
  assert.equal(calls, 0)
})
