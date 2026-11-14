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

// ── Phase 5: /apply ─────────────────────────────────────────────────────────
// (a) The form surface is OPAQUE --card in the Light/Dark THEME (no sky behind
//     it), with the same accents as the sign-in card, read from
//     `.hills-apply__surface` / `.dark .hills-apply__surface`.
// (b) The left column is plain text on the sky: step labels, the title, the
//     required-field note (all checked above as ink / ink-2 / danger on sky)
//     plus the step circles, checked here: outline (graphic, 3:1) and the
//     "done" circle, ink on ink at 14% over the sky.
function applyTokens(dark: boolean): Record<string, string> {
  const scopes = [
    /\.hills-apply__surface\s*\{[^}]*--c-ink[^}]*\}/,
    ...(dark ? [/\.dark\s+\.hills-apply__surface\s*\{[^}]*\}/] : []),
  ]
  const out: Record<string, string> = {}
  for (const re of scopes) {
    const m = re.exec(css)
    if (!m) throw new Error(`apply surface block not found: ${re}`)
    for (const d of m[0].matchAll(/--c-(acc2|acc|danger|warn):\s*(#[0-9a-f]{6})/gi)) out[d[1] as string] = d[2] as string
  }
  return out
}
for (const dark of [false, true]) {
  const { card, fg } = cardVar(dark ? DARK_BLOCK : ROOT_BLOCK)
  const tok = applyTokens(dark)
  const theme = dark ? 'dark' : 'light'
  const at = `apply surface (${theme})`
  const add = (name: string, need: number, a: RGBA, b: RGBA) =>
    rows.push({ sky: 'surf', pair: `${name} on ${at}`, need, got: ratio(a, b) })
  const tint = (c: RGBA, a: number, base: RGBA = card) => over([c[0], c[1], c[2], a], base)
  const acc = parseColor(tok.acc as string)
  const acc2 = parseColor(tok.acc2 as string)
  const danger = parseColor(tok.danger as string)
  const warn = parseColor(tok.warn as string)
  add('text, labels, typed values', 4.5, fg, card)
  add('secondary text, hints (82%)', 4.5, tint(fg, 0.82), card)
  add('placeholder (62%)', 4.5, tint(fg, 0.62), card)
  add('typed text on focus tint (accent 7%)', 4.5, fg, tint(acc, 0.07))
  add('typed text on error tint (danger 6%)', 4.5, fg, tint(danger, 0.06))
  add('error message (danger)', 4.5, danger, card)
  add('required asterisk (danger)', 4.5, danger, card)
  add('review heading (accent)', 4.5, acc, card)
  add('step number on its badge (accent 14%)', 4.5, acc, tint(acc, 0.14))
  add('focus line and checkbox (accent)', 3, acc, card)
  add('field underline (ink)', 3, fg, card)
  add('section icon on its tint (ink 8%)', 3, fg, tint(fg, 0.08))
  add('warning text on its tint (9%)', 4.5, warn, tint(warn, 0.09))
  add('server error text on its tint (9%)', 4.5, danger, tint(danger, 0.09))
  add('Next label on ink button', 4.5, card, fg)
  add('Next arrow (graphic)', 3, acc2, fg)
  add('Submit label on accent button', 4.5, card, acc)
  add('Submit label under skeleton sweep', 4.5, card, mix(acc, card, 0.16))
  add('Next label under skeleton sweep', 4.5, card, mix(fg, card, 0.16))
}
for (const sky of SKIES) {
  const p = palette(sky)
  const tintC = parseColor(p.tint as string)
  const s1 = over(tintC, parseColor(p['sky-1'] as string))
  const s2 = over(tintC, parseColor(p['sky-2'] as string))
  const ink = parseColor(p.ink as string)
  for (const [where, bg] of [['top', s1], ['mid', mix(s1, s2, 0.5)], ['bottom', s2]] as [string, RGBA][]) {
    const ink2 = over([ink[0], ink[1], ink[2], 0.93], bg)
    rows.push({ sky, pair: `step circle outline (ink-2) on sky (${where})`, need: 3, got: ratio(ink2, bg) })
    const done = over([ink[0], ink[1], ink[2], 0.14], bg)
    rows.push({ sky, pair: `done circle icon on its fill (${where})`, need: 4.5, got: ratio(ink, done) })
    rows.push({ sky, pair: `submitted tick (ok) on sky (${where})`, need: 3, got: ratio(parseColor(p.ok as string), bg) })
  }
}

// ── Phase 6a: the public content pages (.hills-page) ────────────────────────
// (a) The content surface is OPAQUE --card in the Light/Dark THEME. Text is
//     --card-foreground, muted text is --muted-foreground (the existing
//     `.text-muted`), links and accents come from `.hills-page` /
//     `.dark .hills-page` (--c-acc). Brand icons keep their Tailwind colours and
//     are checked as graphics (3:1).
// (b) The "Ready to apply?" band is inverted: --card on --card-foreground.
// (c) Mobile "On this page" pills: --card-foreground on --card, and the active
//     pill reversed.
// (d) Title, intro and the desktop contents list are full-strength ink on the
//     sky (already checked above as `ink on sky`). The thin rule beside the
//     contents list is decoration only (the text carries the information).
function pageAccent(dark: boolean): { acc: string; acc2: string } {
  const m = (dark ? /\.dark\s+\.hills-page\s*\{[^}]*\}/ : /\.hills-page\s*\{[^}]*--c-acc[^}]*\}/).exec(css)
  if (!m) throw new Error('.hills-page accent block not found')
  const acc = /--c-acc:\s*(#[0-9a-f]{6})/i.exec(m[0])?.[1]
  const acc2 = /--c-acc2:\s*(#[0-9a-f]{6})/i.exec(m[0])?.[1]
  if (!acc || !acc2) throw new Error('.hills-page accent tokens missing')
  return { acc, acc2 }
}
function hslVar(block: RegExp, name: string): RGBA {
  return hslTriplet(block, name)
}
for (const dark of [false, true]) {
  const { card, fg } = cardVar(dark ? DARK_BLOCK : ROOT_BLOCK)
  const theme = dark ? 'dark' : 'light'
  const at = `page surface (${theme})`
  const add = (name: string, need: number, a: RGBA, b: RGBA) =>
    rows.push({ sky: 'page', pair: `${name} on ${at}`, need, got: ratio(a, b) })
  const block = dark ? DARK_BLOCK : ROOT_BLOCK
  const brand = (n: string): RGBA => hslVar(block, n)
  const muted = brand('muted-foreground')
  const { acc } = pageAccent(dark)
  const accC = parseColor(acc)
  add('body text', 4.5, fg, card)
  add('muted text (.text-muted)', 4.5, muted, card)
  add('link and accent text (--c-acc)', 4.5, accC, card)
  add('CTA band text (card on foreground)', 4.5, card, fg)
  // Phase 6b: events list date badge (brand-deep with white day number and
  // white 90% month text; brand-teal-light measured 4.15:1 in light and was replaced) and the inverted 404 / CTA button label.
  const deep = brand('brand-deep')
  add('event badge month (white 90% on brand-deep)', 4.5, over([255, 255, 255, 0.9], deep), deep)
  add('event badge day (white on brand-deep)', 4.5, [255, 255, 255, 1], deep)
  add('404 button label (card on foreground)', 4.5, card, fg)
  add('detail date/byline chip (foreground on card)', 4.5, fg, card)
  add('post blockquote (ink 82% on card)', 4.5, over([fg[0], fg[1], fg[2], 0.82], card), card)
  add('CTA band text, 90%', 4.5, over([card[0], card[1], card[2], 0.9], fg), fg)
  add('CTA button label (foreground on card)', 4.5, fg, card)
  add('mobile pill label (foreground on card)', 4.5, fg, card)
  add('active pill label (card on foreground)', 4.5, card, fg)
  for (const b of ['brand-teal', 'brand-purple', 'brand-amber', 'brand-coral']) {
    add(`icon ${b} (graphic)`, 3, brand(b), card)
  }
}

// ── Phase 7: forgot / reset / change password and the claim form ───────────
// Same card as the sign-in family (opaque --card here is the lightest case for
// the translucent card). New pieces: the success tick (--c-ok), the invalid
// field underline and field error text (--c-danger), the read-only field and
// back link (ink 82%), the hint text (ink 82%).
for (const dark of [false, true]) {
  const { card, fg } = cardVar(dark ? DARK_BLOCK : ROOT_BLOCK)
  const theme = dark ? 'dark' : 'light'
  const at = `auth card (${theme})`
  const add = (name: string, need: number, a: RGBA, b: RGBA) =>
    rows.push({ sky: 'auth7', pair: `${name} on ${at}`, need, got: ratio(a, b) })
  const ok = new RegExp(dark ? '\\.dark\\s+\\.hills-auth__card\\s*\\{[^}]*--c-ok:\\s*(#[0-9a-f]{6})' : '\\.hills-auth__card\\s*\\{\\s*--c-ok:\\s*(#[0-9a-f]{6})', 'i').exec(css)?.[1]
  if (!ok) throw new Error('--c-ok not found for .hills-auth__card')
  const danger = parseColor(cardTokens(dark).danger as string)
  add('success tick and ring (--c-ok, graphic)', 3, parseColor(ok), card)
  add('invalid field underline (--c-danger, graphic)', 3, danger, card)
  add('field error text (--c-danger)', 4.5, danger, card)
  add('hint, read-only value, back link (ink 82%)', 4.5, over([fg[0], fg[1], fg[2], 0.82], card), card)
  add('small label note (ink 82%)', 4.5, over([fg[0], fg[1], fg[2], 0.82], card), card)
}

// ── Phase 8a: the logged-in surface and its one tint ───────────────────────
// Tint tiles (stat tiles, welfare counts, quiet mobile rows, table header row)
// carry body text, muted text (.text-muted) and the navy/title text. The tint
// is chosen so muted text keeps 4.5:1 on it. The surface itself is --card.
for (const dark of [false, true]) {
  const theme = dark ? 'dark' : 'light'
  const block = dark ? DARK_BLOCK : ROOT_BLOCK
  const tint = hslTriplet(dark ? /\.dark\s*\{\s*--app-tint[^}]*\}/ : /:root\s*\{\s*--app-tint[^}]*\}/, 'app-tint')
  const g = (n: string): RGBA => hslTriplet(block, n)
  const add = (name: string, need: number, a: RGBA, b: RGBA) =>
    rows.push({ sky: 'app8', pair: `${name} on tint (${theme})`, need, got: ratio(a, b) })
  add('body text', 4.5, g('foreground'), tint)
  add('muted text (.text-muted)', 4.5, g('muted-foreground'), tint)
  add('title / value (brand-navy)', 4.5, g('brand-navy'), tint)
  add('brand-teal icon (graphic)', 3, g('brand-teal'), tint)
  // Text straight on the page sky: idle tab labels and the line under a title
  // (78% of the body ink, .app-sky-idle), the active tab label (brand-navy).
  const page = g('background'), fg = g('foreground')
  const idle = over([fg[0], fg[1], fg[2], 0.78], page)
  rows.push({ sky: 'app8', pair: `idle tab label / title line (.app-sky-idle) on page (${theme})`, need: 4.5, got: ratio(idle, page) })
  rows.push({ sky: 'app8', pair: `active tab label (brand-navy) on page (${theme})`, need: 4.5, got: ratio(g('brand-navy'), page) })
  rows.push({ sky: 'app8', pair: `active tab underline (brand-teal, graphic) on page (${theme})`, need: 3, got: ratio(g('brand-teal'), page) })
  const card = g('card')
  rows.push({ sky: 'app8', pair: `tint against surface, light divider (${theme})`, need: 1.0, got: ratio(tint, card) })
  rows.push({ sky: 'app8', pair: `surface border against page (${theme})`, need: 1.0, got: ratio(g('border'), g('background')) })
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
