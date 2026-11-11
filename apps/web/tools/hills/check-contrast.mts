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

// ── Phase 3: the sign-in card ───────────────────────────────────────────────
// The card follows the Light/Dark THEME, not the sky: --card at 92% over the sky
// (worst of top, middle and bottom), text in --card-foreground, accents from
// `.hills-auth__card` (light) and `.dark .hills-auth__card` (dark). All four
// skies are tried under both themes, because Auto can show a dusk sky on a
// light-theme device.
function hslTriplet(block: RegExp, name: string): RGBA {
  const b = block.exec(css)
  if (!b) throw new Error(`Block for ${name} not found in globals.css`)
  const m = new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`).exec(b[0])
  if (!m) throw new Error(`--${name} not found`)
  const h = Number(m[1]), sat = Number(m[2]) / 100, l = Number(m[3]) / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0) * 255, f(8) * 255, f(4) * 255, 1]
}
const ROOT_BLOCK = /:root\s*\{[^}]*\}/
const DARK_BLOCK = /\.dark\s*\{[^}]*\}/
const cardVar = (block: RegExp) => ({
  card: hslTriplet(block, 'card'),
  fg: hslTriplet(block, 'card-foreground'),
})
function cardTokens(dark: boolean): Record<string, string> {
  const scopes = [/\.hills-auth__card\s*\{[^}]*--c-ink[^}]*\}/, ...(dark ? [/\.dark\s+\.hills-auth__card\s*\{[^}]*\}/] : [])]
  const out: Record<string, string> = {}
  for (const re of scopes) {
    const m = re.exec(css)
    if (!m) throw new Error(`card block not found: ${re}`)
    for (const d of m[0].matchAll(/--c-(acc2|acc|danger|warn):\s*(#[0-9a-f]{6})/gi)) out[d[1] as string] = d[2] as string
  }
  return out
}
for (const sky of SKIES) {
  const p = palette(sky)
  const tint = parseColor(p.tint as string)
  const s1 = over(tint, parseColor(p['sky-1'] as string))
  const s2 = over(tint, parseColor(p['sky-2'] as string))
  const spots: [string, RGBA][] = [['top', s1], ['mid', mix(s1, s2, 0.5)], ['bottom', s2]]
  for (const dark of [false, true]) {
    const { card: cardRaw, fg } = cardVar(dark ? DARK_BLOCK : ROOT_BLOCK)
    const tok = cardTokens(dark)
    const theme = dark ? 'dark' : 'light'
    for (const [where, skyBg] of spots) {
      const card = over([cardRaw[0], cardRaw[1], cardRaw[2], 0.92], skyBg)
      const at = `card (${theme} theme, ${where})`
      const add = (name: string, need: number, a: RGBA, b: RGBA) =>
        rows.push({ sky, pair: `${name} on ${at}`, need, got: ratio(a, b) })
      const acc = parseColor(tok.acc as string)
      const danger = parseColor(tok.danger as string)
      const warn = parseColor(tok.warn as string)
      add('text', 4.5, fg, card)
      add('secondary text/placeholder (82%)', 4.5, over([fg[0], fg[1], fg[2], 0.82], card), card)
      add('link and field focus line (accent)', 4.5, acc, card)
      for (const [n, c] of [['danger', danger], ['warn', warn]] as const) {
        const tinted = over([c[0], c[1], c[2], 0.09], card)
        add(`${n} alert text on its tint`, 4.5, c, tinted)
      }
      add('button label on button', 4.5, card, fg)
      add('button label under skeleton sweep', 4.5, card, mix(fg, card, 0.16))
      add('button arrow (graphic)', 3, parseColor(tok.acc2 as string), fg)
    }
  }
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
