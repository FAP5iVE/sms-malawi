/**
 * apps/web/tools/hills/check-contrast.mts
 *
 * [PURPOSE]: Chikangawa Hills theme guardrail (Phase 1 "done when"). Reads the
 *   four sky palettes straight out of globals.css and checks WCAG contrast:
 *     body text   ink and ink-2 (93% ink) on the sky       >= 4.5:1
 *     status text danger / warn / ok on the sky              >= 4.5:1
 *     button      on (label) over ink (fill)                 >= 4.5:1
 *     large text  accent (big words, underlines, icons)      >= 3:1
 *   "On the sky" means the worst of the top colour, the bottom colour and the
 *   50% blend of the two (with the tint overlay composited on each), because
 *   text can sit anywhere on the gradient.
 *
 *   pnpm hills:contrast            exit 1 if any pair fails
 *   pnpm hills:contrast --table    also print every ratio
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const css = readFileSync(path.join(here, '../../src/app/globals.css'), 'utf8')

type RGBA = [number, number, number, number]

function parseColor(raw: string): RGBA {
  const v = raw.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v)
  if (hex) {
    let h = hex[1] as string
    if (h.length === 3) h = h.replace(/./g, (c) => c + c)
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])]
  throw new Error(`Cannot parse colour: ${raw}`)
}

const over = (top: RGBA, bottom: RGBA): RGBA => {
  const a = top[3]
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ]
}
const mix = (a: RGBA, b: RGBA, t: number): RGBA => [
  a[0] * (1 - t) + b[0] * t,
  a[1] * (1 - t) + b[1] * t,
  a[2] * (1 - t) + b[2] * t,
  1,
]
const lum = (c: RGBA): number => {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a: RGBA, b: RGBA): number => {
  const [hi, lo] = lum(a) >= lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]
  return (hi + 0.05) / (lo + 0.05)
}

const SKIES = ['dawn', 'day', 'dusk', 'night'] as const

function palette(sky: (typeof SKIES)[number]): Record<string, string> {
  // The local-override selector carries the same declarations as the page-wide one.
  const re = new RegExp(`\\.hills\\[data-sky='${sky}'\\]\\s*\\{([^}]*)\\}`)
  const m = re.exec(css)
  if (!m) throw new Error(`Palette for ${sky} not found in globals.css`)
  const out: Record<string, string> = {}
  for (const d of (m[1] as string).matchAll(/--hills-([a-z0-9-]+):\s*([^;]+);/g)) {
    out[d[1] as string] = (d[2] as string).trim()
  }
  return out
}

interface Row {
  sky: string
  pair: string
  need: number
  got: number
}
const rows: Row[] = []

for (const sky of SKIES) {
  const p = palette(sky)
  const get = (k: string): RGBA => {
    const v = p[k]
    if (v === undefined) throw new Error(`--hills-${k} missing for ${sky}`)
    return parseColor(v)
  }
  const tint = get('tint')
  const s1 = over(tint, get('sky-1'))
  const s2 = over(tint, get('sky-2'))
  const spots: [string, RGBA][] = [
    ['top', s1],
    ['mid', mix(s1, s2, 0.5)],
    ['bottom', s2],
  ]
  const ink = get('ink')
  const worst = (fg: RGBA, label: string, need: number, name: string) => {
    for (const [where, bg] of spots) {
      rows.push({ sky, pair: `${name} on ${label} (${where})`, need, got: ratio(fg, bg) })
    }
  }
  worst(ink, 'sky', 4.5, 'ink')
  worst(over([ink[0], ink[1], ink[2], 0.93], mix(s1, s2, 0.5)), 'sky', 4.5, 'ink-2 (93%)')
  for (const k of ['danger', 'warn', 'ok']) worst(get(k), 'sky', 4.5, k)
  worst(get('accent'), 'sky', 3, 'accent (large)')
  rows.push({ sky, pair: 'on over ink (button label)', need: 4.5, got: ratio(get('on'), ink) })
}

const fails = rows.filter((r) => r.got < r.need)
if (process.argv.includes('--table') || fails.length > 0) {
  for (const r of rows) {
    const flag = r.got < r.need ? 'FAIL' : 'ok  '
    if (process.argv.includes('--table') || r.got < r.need) {
      console.log(`${flag} ${r.sky.padEnd(5)} ${r.pair.padEnd(38)} ${r.got.toFixed(2)}:1 (needs ${r.need}:1)`)
    }
  }
}
const min = (sky: string) =>
  Math.min(...rows.filter((r) => r.sky === sky && r.need === 4.5).map((r) => r.got)).toFixed(2)
console.log(
  `\n${rows.length} pairs checked across ${SKIES.length} skies; ` +
    `lowest 4.5:1-class ratio per sky: ${SKIES.map((s) => `${s} ${min(s)}`).join(', ')}.`,
)
console.log(fails.length === 0 ? 'RESULT: all pairs pass.' : `RESULT: ${fails.length} pair(s) fail.`)
process.exit(fails.length === 0 ? 0 : 1)
