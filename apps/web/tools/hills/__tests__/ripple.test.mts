/**
 * apps/web/tools/hills/__tests__/ripple.test.mts
 *
 * Phase 3: the typing ripple's rules (src/lib/hills/ripple.ts).
 * Run with: pnpm hills:test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  LIT_RING_COUNT, PEAK, RIPPLE_CLEANUP_MS, RIPPLE_MAX_RINGS, RIPPLE_MIN_GAP_MS, RING_SPACING,
  glowAmount, litRingCount, ringPath, shouldAddRipple,
} from '../../../src/lib/hills/ripple.js'

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

test('a ring is cleaned up after its 1.9s animation, and the pile is capped', () => {
  assert.ok(RIPPLE_CLEANUP_MS > 1900)
  assert.ok(RIPPLE_MAX_RINGS >= 3 && RIPPLE_MAX_RINGS <= 8)
})

test('the lit rings are exactly the background contour lines', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const svg = readFileSync(path.join(here, '../../../public/hills/contours.svg'), 'utf8')
  const drawn = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1])
  assert.equal(drawn.length, 24)
  // The file lists the minor rings first and the major (every 5th) after, so look each one up.
  for (let i = 1; i <= LIT_RING_COUNT; i++) {
    assert.ok(drawn.includes(ringPath(PEAK.x, PEAK.y, i * RING_SPACING)), `ring ${i} is not in contours.svg`)
  }
})

test('the ring path is closed and centred where it is asked to be', () => {
  const d = ringPath(0, 0, 100)
  assert.ok(d.startsWith('M') && d.endsWith('Z'))
  const xs = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const)
  const cx = (Math.max(...xs.map((p) => p[0])) + Math.min(...xs.map((p) => p[0]))) / 2
  assert.ok(Math.abs(cx) < 40)
})

test('lit rings: nothing typed lights nothing; a valid email and a password light more', () => {
  assert.equal(litRingCount([]), 0)
  assert.equal(litRingCount([{ type: 'email', value: '' }, { type: 'password', value: '' }]), 0)
  assert.equal(litRingCount([{ type: 'email', value: 'name@school' }]), 0)
  assert.equal(litRingCount([{ type: 'email', value: 'name@school.edu.mw' }]), 3)
  assert.equal(litRingCount([{ type: 'email', value: 'name@school.edu.mw' }, { type: 'password', value: 'abc' }]), 6)
  assert.equal(litRingCount([{ type: 'email', value: 'name@school.edu.mw' }, { type: 'password', value: 'a-very-long-password' }]), LIT_RING_COUNT)
})

test('lit rings never exceed the rings that exist', () => {
  const many = Array.from({ length: 6 }, () => ({ type: 'password', value: 'xxxxxxxxxxxx' }))
  assert.equal(litRingCount(many), LIT_RING_COUNT)
})

test('glow follows the longest password, from 0 to 1', () => {
  assert.equal(glowAmount([]), 0)
  assert.equal(glowAmount([{ type: 'text', value: 'hello' }]), 0)
  assert.equal(glowAmount([{ type: 'password', value: 'abcdef' }]), 0.5)
  assert.equal(glowAmount([{ type: 'password', value: 'a'.repeat(40) }]), 1)
})
