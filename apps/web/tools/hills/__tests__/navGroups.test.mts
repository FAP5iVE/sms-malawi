/**
 * apps/web/tools/hills/__tests__/navGroups.test.mts
 *
 * Phase 8d: sidebar grouping (src/lib/hills/navGroups.ts).
 * Run with: pnpm hills:test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { NAV_FALLBACK_LABEL, NAV_GROUPS, allGroupedHrefs, groupNavItems } from '../../../src/lib/hills/navGroups.js'

const item = (href: string) => ({ href, label: href })

test('same items in, same items out: nothing added, dropped or re-linked', () => {
  const input = ['/settings', '/dashboard', '/exams', '/students', '/finances', '/approvals', '/library'].map(item)
  const out = groupNavItems(input).flatMap((g) => g.items)
  assert.equal(out.length, input.length)
  assert.deepEqual([...out.map((i) => i.href)].sort(), [...input.map((i) => i.href)].sort())
  for (const o of out) assert.ok(input.includes(o), 'the very same object, so its link is untouched')
})

test('Dashboard is first with no heading', () => {
  const g = groupNavItems(['/exams', '/dashboard'].map(item))
  assert.equal(g[0]!.label, null)
  assert.deepEqual(g[0]!.items.map((i) => i.href), ['/dashboard'])
})

test('items keep their relative order inside a group', () => {
  const g = groupNavItems(['/timetable', '/classes', '/exams'].map(item))
  assert.deepEqual(g[0]!.items.map((i) => i.href), ['/timetable', '/classes', '/exams'])
})

test('empty groups are dropped', () => {
  const g = groupNavItems(['/dashboard', '/settings'].map(item))
  assert.deepEqual(g.map((x) => x.label), [null, 'Admin'])
})

test('a page no group knows goes to a last "More" group, never lost', () => {
  const g = groupNavItems(['/dashboard', '/exams', '/brand-new-page'].map(item))
  const last = g[g.length - 1]!
  assert.equal(last.label, NAV_FALLBACK_LABEL)
  assert.deepEqual(last.items.map((i) => i.href), ['/brand-new-page'])
})

test('no href appears in two groups', () => {
  const all = allGroupedHrefs()
  assert.equal(new Set(all).size, all.length)
})

test('every group has a short heading (12 characters or fewer, no dashes)', () => {
  for (const grp of NAV_GROUPS) {
    assert.ok(grp.label.length <= 12)
    assert.ok(!/[–—]/.test(grp.label))
  }
})

test('empty input gives no groups', () => {
  assert.deepEqual(groupNavItems([]), [])
})

test('every page in config/navigation.ts has a group (so "More" stays empty today)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../../../src/config/navigation.ts', import.meta.url), 'utf8')
  const hrefs = [...src.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]!)
  assert.ok(hrefs.length >= 15)
  const known = new Set(allGroupedHrefs())
  assert.deepEqual(hrefs.filter((h) => !known.has(h)), [])
})
