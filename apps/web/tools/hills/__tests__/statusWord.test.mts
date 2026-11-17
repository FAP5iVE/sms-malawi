/**
 * apps/web/tools/hills/__tests__/statusWord.test.mts
 *
 * Phase 8b-3: the status display helper (src/lib/hills/statusWord.ts), RULEBOOK R2 and R4.
 * Run with: pnpm hills:test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { statusTone, statusWord } from '../../../src/lib/hills/statusWord.js'

test('codes become sentence case words', () => {
  assert.equal(statusWord('PENDING_APPROVAL'), 'Pending approval')
  assert.equal(statusWord('AWAITING_MANEB_RESULTS'), 'Awaiting MANEB results')
  assert.equal(statusWord('ok'), 'Ok')
  assert.equal(statusWord(undefined), '')
  assert.equal(statusWord('CA'), 'CA')
  assert.equal(statusWord('END_OF_TERM'), 'End of term')
})

test('common codes pick a tone and unknown codes stay neutral', () => {
  assert.equal(statusTone('PAID'), 'success')
  assert.equal(statusTone('pending'), 'warning')
  assert.equal(statusTone('OVERDUE'), 'danger')
  assert.equal(statusTone('PARTIAL'), 'info')
  assert.equal(statusTone('SOMETHING_ELSE'), 'neutral')
})
