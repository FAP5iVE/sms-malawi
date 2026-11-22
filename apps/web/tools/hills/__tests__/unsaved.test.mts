/**
 * apps/web/tools/hills/__tests__/unsaved.test.mts
 *
 * Phase 8b-0 follow-up: unsaved-changes rule (src/lib/hills/unsaved.ts), R8.4.
 * Run with: pnpm hills:test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  UNSAVED_DISCARD,
  UNSAVED_KEEP,
  UNSAVED_TITLE,
  decideClose,
  isGuardedDialog,
  isUserEdit,
} from '../../../src/lib/hills/unsaved.js'

test('only the three Hills sizes with a form and chrome are guarded', () => {
  for (const s of ['s', 'm', 'l']) assert.equal(isGuardedDialog(s, true, false), true)
  for (const s of ['sm', 'md', 'lg', 'xl', '2xl', 'screen']) assert.equal(isGuardedDialog(s, true, false), false)
  assert.equal(isGuardedDialog('m', false, false), false, 'no form: nothing to lose')
  assert.equal(isGuardedDialog('m', true, true), false, 'bare dialogs are custom')
})

test('an untouched dialog closes at once', () => {
  assert.equal(decideClose({ busy: false, guarded: true, dirty: false, asking: false }), 'close')
})

test('a typed-in guarded dialog asks first', () => {
  assert.equal(decideClose({ busy: false, guarded: true, dirty: true, asking: false }), 'ask')
})

test('an unguarded dialog never asks, even if dirty', () => {
  assert.equal(decideClose({ busy: false, guarded: false, dirty: true, asking: false }), 'close')
})

test('busy always ignores the request (as before)', () => {
  for (const guarded of [true, false])
    for (const dirty of [true, false])
      for (const asking of [true, false]) assert.equal(decideClose({ busy: true, guarded, dirty, asking }), 'ignore')
})

test('a second request while the question is showing means keep editing', () => {
  assert.equal(decideClose({ busy: false, guarded: true, dirty: true, asking: true }), 'keep-editing')
})

test('programmatic events do not count as edits; person events do', () => {
  assert.equal(isUserEdit({ isTrusted: true }), true)
  assert.equal(isUserEdit({ isTrusted: false }), false)
  assert.equal(isUserEdit({}), true)
})

test('wording: consequence headline, repeated choice, no dashes', () => {
  assert.match(UNSAVED_TITLE, /Discard/)
  assert.equal(UNSAVED_KEEP, 'Keep editing')
  assert.equal(UNSAVED_DISCARD, 'Discard changes')
  for (const t of [UNSAVED_TITLE, UNSAVED_KEEP, UNSAVED_DISCARD]) assert.ok(!/[–—]/.test(t))
})
