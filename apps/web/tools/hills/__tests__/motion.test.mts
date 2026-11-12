/**
 * apps/web/tools/hills/__tests__/motion.test.mts
 *
 * Phase 4b: the scroll-reveal rules (src/lib/hills/motion.ts).
 * Run with: pnpm hills:test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { REVEAL_FOLD, STAGGER_MAX_ITEMS, STAGGER_STEP_MS, revealPlan, staggerDelay } from '../../../src/lib/hills/motion.js'

const on = { motionEnabled: true, prefersReducedMotion: false, viewportHeight: 800 }

test('an element on screen is never hidden', () => {
  assert.equal(revealPlan({ ...on, top: 100 }), 'skip')
  assert.equal(revealPlan({ ...on, top: 800 * REVEAL_FOLD - 1 }), 'skip')
})

test('an element below the fold is held back', () => {
  assert.equal(revealPlan({ ...on, top: 800 * REVEAL_FOLD }), 'hide')
  assert.equal(revealPlan({ ...on, top: 2400 }), 'hide')
})

test('an element scrolled past the top is left visible', () => {
  assert.equal(revealPlan({ ...on, top: -300 }), 'skip')
})

test('reduced motion hides nothing', () => {
  assert.equal(revealPlan({ ...on, top: 2400, prefersReducedMotion: true }), 'skip')
})

test('the app motion setting off hides nothing', () => {
  assert.equal(revealPlan({ ...on, top: 2400, motionEnabled: false }), 'skip')
})

test('stagger steps by 70ms and stops at 6 items', () => {
  assert.equal(staggerDelay(0), 0)
  assert.equal(staggerDelay(1), STAGGER_STEP_MS)
  assert.equal(staggerDelay(STAGGER_MAX_ITEMS - 1), (STAGGER_MAX_ITEMS - 1) * STAGGER_STEP_MS)
  assert.equal(staggerDelay(STAGGER_MAX_ITEMS + 10), (STAGGER_MAX_ITEMS - 1) * STAGGER_STEP_MS)
})

test('stagger ignores bad indexes', () => {
  assert.equal(staggerDelay(-3), 0)
  assert.equal(staggerDelay(1.9), STAGGER_STEP_MS)
})
