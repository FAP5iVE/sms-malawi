/**
 * apps/web/tools/hills/__tests__/ripple.test.mts
 *
 * Phase 3: the typing ripple's rules (src/lib/hills/ripple.ts).
 * Run with: pnpm hills:test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { RIPPLE_CLEANUP_MS, RIPPLE_MAX_RINGS, RIPPLE_MIN_GAP_MS, shouldAddRipple } from '../../../src/lib/hills/ripple.js'

const on = { motionEnabled: true, prefersReducedMotion: false }

test('first keystroke always draws a ring', () => {
  assert.equal(shouldAddRipple({ ...on, now: 5000, last: 0 }), true)
})

test('keystrokes closer than the gap are skipped', () => {
  assert.equal(shouldAddRipple({ ...on, now: 1000 + RIPPLE_MIN_GAP_MS - 1, last: 1000 }), false)
  assert.equal(shouldAddRipple({ ...on, now: 1001, last: 1000 }), false)
})

test('a keystroke exactly one gap later draws a ring', () => {
  assert.equal(shouldAddRipple({ ...on, now: 1000 + RIPPLE_MIN_GAP_MS, last: 1000 }), true)
})

test('fast typing makes at most one ring per gap', () => {
  let last = 0
  let rings = 0
  for (let t = 1000; t < 2000; t += 25) {
    if (shouldAddRipple({ ...on, now: t, last })) {
      rings++
      last = t
    }
  }
  assert.ok(rings <= Math.ceil(1000 / RIPPLE_MIN_GAP_MS), `drew ${rings} rings`)
  assert.ok(rings >= 8)
})

test('nothing is drawn under prefers-reduced-motion', () => {
  assert.equal(shouldAddRipple({ now: 5000, last: 0, motionEnabled: true, prefersReducedMotion: true }), false)
})

test('nothing is drawn when the app motion setting is off', () => {
  assert.equal(shouldAddRipple({ now: 5000, last: 0, motionEnabled: false, prefersReducedMotion: false }), false)
})

test('a ring is cleaned up after its 2.6s animation, and the pile is capped', () => {
  assert.ok(RIPPLE_CLEANUP_MS > 2600)
  assert.ok(RIPPLE_MAX_RINGS >= 3 && RIPPLE_MAX_RINGS <= 8)
})
