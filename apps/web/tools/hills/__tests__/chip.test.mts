/**
 * apps/web/tools/hills/__tests__/chip.test.mts
 *
 * Phase 8b-1 follow-up: the filter chip look (src/lib/hills/chip.ts), RULEBOOK R2.7.
 * Run with: pnpm hills:test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CHIP, CHIP_OFF, CHIP_ON, chipClass } from '../../../src/lib/hills/chip.js'

test('a chip is never a full pill', () => {
  for (const c of [CHIP, CHIP_ON, CHIP_OFF, chipClass(true), chipClass(false)]) assert.ok(!c.includes('rounded-full'))
  assert.ok(CHIP.includes('rounded-xl'))
})

test('a chip is a 44px tap target', () => {
  assert.ok(CHIP.includes('min-h-11'))
})

test('selected and not selected differ by fill, and share the base', () => {
  assert.ok(chipClass(true).includes('bg-btn-brand'))
  assert.ok(!chipClass(false).includes('bg-btn-brand'))
  assert.ok(chipClass(true).startsWith(CHIP) && chipClass(false).startsWith(CHIP))
})
