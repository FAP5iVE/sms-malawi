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

// ─── Phase 8b-0: app motion tokens (RULEBOOK R9) must match globals.css ───────
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  DIALOG_IN_MS,
  DIALOG_OUT_MS,
  EASE_ENTER,
  EASE_LEAVE,
  EASE_STANDARD,
  HOVER_MS,
  PAGE_MS,
  WAIT_MIN_VISIBLE_MS,
  WAIT_SHOW_AFTER_MS,
} from '../../../src/lib/hills/motion.js'

const css = readFileSync(fileURLToPath(new URL('../../../src/app/globals.css', import.meta.url)), 'utf8')
const root = /:root\s*\{\s*--tone-teal[^}]*\}/.exec(css)?.[0] ?? ''
const cb = (v: readonly number[]) => `cubic-bezier(${v.join(', ')})`

test('the CSS easing and duration tokens equal the TypeScript constants', () => {
  assert.ok(root.includes(`--ease-enter:    ${cb(EASE_ENTER)}`), 'ease-enter')
  assert.ok(root.includes(`--ease-leave:    ${cb(EASE_LEAVE)}`), 'ease-leave')
  assert.ok(root.includes(`--ease-standard: ${cb(EASE_STANDARD)}`), 'ease-standard')
  assert.ok(root.includes(`--dur-hover:      ${HOVER_MS}ms`), 'dur-hover')
  assert.ok(root.includes(`--dur-dialog-in:  ${DIALOG_IN_MS}ms`), 'dur-dialog-in')
  assert.ok(root.includes(`--dur-dialog-out: ${DIALOG_OUT_MS}ms`), 'dur-dialog-out')
  assert.ok(root.includes(`--dur-page:       ${PAGE_MS}ms`), 'dur-page')
})

test('durations stay inside the rulebook limits', () => {
  assert.ok(HOVER_MS >= 100 && HOVER_MS <= 150)
  assert.equal(DIALOG_IN_MS, 250)
  assert.equal(DIALOG_OUT_MS, 200)
  assert.ok(PAGE_MS <= 400)
  assert.equal(WAIT_SHOW_AFTER_MS, 1000)
  assert.equal(WAIT_MIN_VISIBLE_MS, 500)
})

test('the delayed waiting indicator in CSS uses the same one second delay', () => {
  assert.match(css, new RegExp(`\\.app-wait \\{[^}]*${WAIT_SHOW_AFTER_MS}ms`))
})
