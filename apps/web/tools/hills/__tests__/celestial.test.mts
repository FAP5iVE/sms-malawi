/**
 * Sun and moon placement for the vivid and home backgrounds.
 * Run with `pnpm hills:test`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { arc, arcFractions, celestialVars, malawiTime } from '../../../src/lib/hills/celestial.js'

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 5, 15, h - 2, m)) // Malawi h:m

test('Malawi time is fractional hours at UTC+2', () => {
  assert.equal(malawiTime(at(12, 30)), 12.5)
  assert.equal(malawiTime(new Date(Date.UTC(2026, 5, 15, 22, 30))), 0.5)
})

test('sun is up 05:30 to 18:00, moon the rest of the day', () => {
  assert.equal(arcFractions(5.49).sun, null)
  assert.notEqual(arcFractions(5.5).sun, null)
  assert.notEqual(arcFractions(17.99).sun, null)
  assert.equal(arcFractions(18).sun, null)
  for (const t of [0, 3, 5.4, 18, 21, 23.9]) assert.notEqual(arcFractions(t).moon, null, `t=${t}`)
  for (const t of [6, 12, 17.9]) assert.equal(arcFractions(t).moon, null, `t=${t}`)
})

test('the sun peaks mid-way and sits lowest at the ends', () => {
  const noon = arc(0.5)!
  const early = arc(0.1)!
  assert.ok(noon.y < early.y)
  assert.equal(noon.elevation, 1)
  assert.ok(arc(0)!.opacity === 0 && arc(1)!.opacity === 0)
  assert.equal(arc(0.5)!.opacity, 1)
  assert.equal(arc(null), null)
})

test('Auto follows the clock', () => {
  const noon = celestialVars('system', at(11, 45))
  assert.equal(noon['--moon-o'], '0')
  assert.ok(Number(noon['--sun-o']) > 0.9)
  const midnight = celestialVars('system', at(0, 15))
  assert.equal(midnight['--sun-o'], '0')
  assert.ok(Number(midnight['--moon-o']) > 0.9)
  assert.deepEqual(celestialVars(undefined, at(11, 45)), noon)
})

test('Light is always a sun and Dark always a moon, whatever the hour', () => {
  for (let h = 0; h < 24; h++) {
    const l = celestialVars('light', at(h))
    const d = celestialVars('dark', at(h))
    assert.equal(l['--sun-o'], '1.000')
    assert.equal(l['--moon-o'], '0')
    assert.equal(d['--moon-o'], '1.000')
    assert.equal(d['--sun-o'], '0')
  }
})

test('every position stays on screen', () => {
  for (const theme of ['light', 'dark', 'system']) {
    for (let h = 0; h < 24; h += 0.25) {
      const v = celestialVars(theme, at(Math.floor(h), (h % 1) * 60))
      for (const k of ['--sun-x', '--moon-x', '--sun-y', '--moon-y']) {
        if (v[k] === undefined) continue
        const n = Number(v[k]!.replace('%', ''))
        assert.ok(n >= 5 && n <= 95, `${theme} h=${h} ${k}=${v[k]}`)
      }
    }
  }
})
