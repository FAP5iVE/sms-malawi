/**
 * Proves that the hand-written inline script (runs before any bundle loads)
 * gives exactly the same sky as resolveSky() for every hour and every theme
 * value, including blocked localStorage. Run with `pnpm hills:test`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'

import {
  HILLS_SKY_SCRIPT,
  HILLS_THEME_STORAGE_KEY,
  malawiHour,
  modeForSky,
  normalizeChoice,
  resolveMode,
  resolveSky,
  skyForHour,
} from '../../../src/lib/hills/sky.js'

function runScript(stored: string | null | 'throws', utc: Date): string | null {
  return runScriptFull(stored, utc).sky
}

function runScriptFull(stored: string | null | 'throws', utc: Date): { sky: string | null; dark: boolean; scheme: string | null } {
  let sky: string | null = null
  let dark = false
  let scheme: string | null = null
  const RealDate = Date
  const sandbox = {
    localStorage: {
      getItem(key: string) {
        if (stored === 'throws') throw new Error('blocked')
        return key === HILLS_THEME_STORAGE_KEY ? stored : null
      },
    },
    document: {
      documentElement: {
        setAttribute(name: string, value: string) {
          if (name === 'data-sky') sky = value
        },
        classList: {
          add(name: string) {
            if (name === 'dark') dark = true
          },
          remove(name: string) {
            if (name === 'dark') dark = false
          },
        },
        style: {
          set colorScheme(v: string) {
            scheme = v
          },
        },
      },
    },
    Date: class extends RealDate {
      constructor() {
        super(utc.getTime())
      }
    },
  }
  vm.runInNewContext(HILLS_SKY_SCRIPT, sandbox)
  return { sky, dark, scheme }
}

test('skyForHour boundaries follow the plan (05, 08, 16, 19)', () => {
  const expected: Record<number, string> = {
    0: 'night', 4: 'night', 5: 'dawn', 7: 'dawn', 8: 'day', 15: 'day',
    16: 'dusk', 18: 'dusk', 19: 'night', 23: 'night',
  }
  for (const [h, sky] of Object.entries(expected)) assert.equal(skyForHour(Number(h)), sky, `hour ${h}`)
})

test('Malawi hour is UTC+2 with wrap-around', () => {
  assert.equal(malawiHour(new Date('2026-03-02T10:00:00Z')), 12)
  assert.equal(malawiHour(new Date('2026-03-02T22:30:00Z')), 0)
  assert.equal(malawiHour(new Date('2026-03-02T21:59:59Z')), 23)
})

test('Light is always day and Dark is always night, at every hour', () => {
  for (let h = 0; h < 24; h++) {
    const now = new Date(Date.UTC(2026, 2, 2, h, 30))
    assert.equal(resolveSky('light', now), 'day')
    assert.equal(resolveSky('dark', now), 'night')
  }
})

test('inline script equals resolveSky for every hour and every stored value', () => {
  for (const stored of ['light', 'dark', 'system', null, 'something-else', 'throws'] as const) {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30, 59]) {
        const now = new Date(Date.UTC(2026, 5, 15, h, m))
        const expected = resolveSky(stored === 'throws' ? null : stored, now)
        assert.equal(runScript(stored, now), expected, `stored=${String(stored)} utc=${h}:${m}`)
      }
    }
  }
})

test('script never throws when the document is unusable', () => {
  assert.doesNotThrow(() => vm.runInNewContext(HILLS_SKY_SCRIPT, {}))
})

test('only the night sky is dark', () => {
  assert.equal(modeForSky('night'), 'dark')
  for (const sky of ['dawn', 'day', 'dusk'] as const) assert.equal(modeForSky(sky), 'light')
})

test('Light is always light, Dark is always dark, Auto follows the clock, at every hour', () => {
  for (let h = 0; h < 24; h++) {
    const now = new Date(Date.UTC(2026, 2, 2, h, 15))
    assert.equal(resolveMode('light', now), 'light')
    assert.equal(resolveMode('dark', now), 'dark')
    const local = malawiHour(now)
    const night = local >= 19 || local < 5
    assert.equal(resolveMode('system', now), night ? 'dark' : 'light', `auto at Malawi hour ${local}`)
  }
})

test('an unknown stored value behaves as Auto', () => {
  assert.equal(normalizeChoice('weird'), 'system')
  assert.equal(normalizeChoice(null), 'system')
  assert.equal(normalizeChoice(undefined), 'system')
  assert.equal(normalizeChoice('light'), 'light')
  assert.equal(normalizeChoice('dark'), 'dark')
})

test('the inline script sets the dark class and colour scheme exactly as resolveMode says', () => {
  for (const stored of ['light', 'dark', 'system', null, 'something-else', 'throws'] as const) {
    for (let h = 0; h < 24; h++) {
      const now = new Date(Date.UTC(2026, 5, 15, h, 20))
      const expected = resolveMode(stored === 'throws' ? null : stored, now)
      const got = runScriptFull(stored, now)
      assert.equal(got.dark, expected === 'dark', `class: stored=${String(stored)} utc hour ${h}`)
      assert.equal(got.scheme, expected, `color-scheme: stored=${String(stored)} utc hour ${h}`)
    }
  }
})
