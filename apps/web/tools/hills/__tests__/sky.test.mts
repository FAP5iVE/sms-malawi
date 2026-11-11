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
  resolveSky,
  skyForHour,
} from '../../../src/lib/hills/sky.js'

function runScript(stored: string | null | 'throws', utc: Date): string | null {
  let sky: string | null = null
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
      },
    },
    Date: class extends RealDate {
      constructor() {
        super(utc.getTime())
      }
    },
  }
  vm.runInNewContext(HILLS_SKY_SCRIPT, sandbox)
  return sky
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
