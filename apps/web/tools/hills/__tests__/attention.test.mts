/**
 * apps/web/tools/hills/__tests__/attention.test.mts
 *
 * Phase 8b-0: attention badge rules (src/lib/hills/attention.ts), RULEBOOK section 6.
 * Run with: pnpm hills:test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ATTENTION_SOURCES,
  BADGE_BUDGET_PER_SCREEN,
  INFORMATIONAL_TAB_COUNTS,
  countBadgePlan,
  dotBadgePlan,
  formatBadgeCount,
  isUsableCount,
  mayShowBadge,
  type AttentionKey,
} from '../../../src/lib/hills/attention.js'

test('a count shows as is up to 99 and as 99+ above', () => {
  assert.equal(formatBadgeCount(1), '1')
  assert.equal(formatBadgeCount(99), '99')
  assert.equal(formatBadgeCount(100), '99+')
  assert.equal(formatBadgeCount(12345), '99+')
})

test('only a whole number above zero is usable (a wrong badge is worse than none)', () => {
  for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, '5', {}, true]) {
    assert.equal(isUsableCount(bad), false, String(bad))
    assert.equal(countBadgePlan(bad, 'waiting').show, false, String(bad))
  }
  assert.equal(isUsableCount(1), true)
})

test('the screen reader hears a sentence, not a bare number', () => {
  assert.deepEqual(countBadgePlan(5, 'waiting for your review'), {
    show: true,
    text: '5',
    label: '5 waiting for your review',
  })
  assert.equal(countBadgePlan(250, 'unread').label, 'More than 99 unread')
  assert.equal(countBadgePlan(250, 'unread').text, '99+')
})

test('a dot needs an explicit true and a sentence', () => {
  assert.deepEqual(dotBadgePlan(true, 'new notices'), { show: true, text: '', label: 'new notices' })
  for (const off of [false, undefined, null, 1, 'true']) assert.equal(dotBadgePlan(off, 'x').show, false)
})

test('a source that would need a new request may not draw a badge (R6.3)', () => {
  const keys = Object.keys(ATTENTION_SOURCES) as AttentionKey[]
  for (const key of keys) {
    assert.equal(mayShowBadge(key), ATTENTION_SOURCES[key].status === 'loaded', key)
  }
  assert.equal(mayShowBadge('approvalsAwaitingMe'), true)
  assert.equal(mayShowBadge('feesUnpaid'), false)
  assert.equal(mayShowBadge('libraryOverdue'), false)
  assert.equal(mayShowBadge('attendanceNotMarked'), false)
})

test('every source has a noun, a surface and a place where its number already lives', () => {
  for (const [key, src] of Object.entries(ATTENTION_SOURCES)) {
    assert.ok(src.noun.length > 0 && src.noun.length <= 40, `${key} noun`)
    assert.ok(src.surfaces.length > 0, `${key} surfaces`)
    assert.ok(src.source.length > 0, `${key} source`)
  }
})

test('nav badges that can show at once stay within the budget of three (R6.4)', () => {
  // The shell (sidebar and bottom bar) is on every screen: count the loaded ones that live there.
  const shell = Object.values(ATTENTION_SOURCES).filter(
    (s) => s.status === 'loaded' && s.surfaces.some((x) => x === 'sidebar' || x === 'bottom-bar'),
  )
  assert.ok(shell.length <= BADGE_BUDGET_PER_SCREEN, `shell badges: ${shell.length}`)
})

test('words are plain: no abbreviations, slashes or exclamation marks in badge sentences (R4.7)', () => {
  for (const [key, src] of Object.entries(ATTENTION_SOURCES)) {
    assert.doesNotMatch(src.noun, /[\/!]|\b(e\.g\.|i\.e\.|etc)\b/, key)
  }
})

test('the informational tab count list names a file and a reason for each entry', () => {
  assert.ok(INFORMATIONAL_TAB_COUNTS.length > 0)
  for (const e of INFORMATIONAL_TAB_COUNTS) {
    assert.ok(e.file && e.tab && e.reason)
  }
})
