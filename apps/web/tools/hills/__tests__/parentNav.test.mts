import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildParentNav, parentBarItems, parentPageTitle, childHref } from '../../../src/lib/hills/parentNav.js'

const kids = [
  { id: 'a1', firstName: 'Chikondi', lastName: 'Banda' },
  { id: 'b/2', firstName: 'Mphatso', lastName: 'Banda' },
  { id: 'c3', firstName: null, lastName: null },
]

test('Dashboard first, then one entry per child, nothing else', () => {
  const items = buildParentNav(kids, '/parent')
  assert.deepEqual(items.map((i) => i.kind), ['dashboard', 'child', 'child', 'child'])
  assert.deepEqual(items.map((i) => i.href), ['/parent', '/parent/a1', '/parent/b%2F2', '/parent/c3'])
  for (const i of items) assert.ok(i.href === '/parent' || i.href.startsWith('/parent/'), 'only guardian pages')
})

test('only the page you are on is active', () => {
  assert.deepEqual(buildParentNav(kids, '/parent').map((i) => i.active), [true, false, false, false])
  assert.deepEqual(buildParentNav(kids, '/parent/a1').map((i) => i.active), [false, true, false, false])
  assert.deepEqual(buildParentNav(kids, '/parent/b%2F2').map((i) => i.active), [false, false, true, false])
})

test('phone labels are short and a child without a name still has a label', () => {
  const items = buildParentNav(kids, '/parent')
  for (const i of items) assert.ok(i.mobileLabel.length <= 9, i.mobileLabel)
  assert.equal(items[3]!.label, 'Student')
  assert.equal(items[1]!.mobileLabel, 'Chikondi')
})

test('header title follows the page', () => {
  assert.equal(parentPageTitle(kids, '/parent'), 'Dashboard')
  assert.equal(parentPageTitle(kids, '/parent/a1'), 'Chikondi Banda')
  assert.equal(parentPageTitle(kids, '/parent/unknown'), 'Dashboard')
})

test('the phone bar holds Dashboard and at most four children', () => {
  const many = Array.from({ length: 7 }, (_, n) => ({ id: `k${n}`, firstName: `K${n}`, lastName: 'X' }))
  const bar = parentBarItems(buildParentNav(many, '/parent'))
  assert.equal(bar.length, 5)
  assert.equal(bar[0]!.kind, 'dashboard')
  assert.equal(childHref('x y'), '/parent/x%20y')
})
