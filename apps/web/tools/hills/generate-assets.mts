/**
 * apps/web/tools/hills/generate-assets.mts
 *
 * [PURPOSE]: Writes the static artwork for the Hills sky background into
 *   public/hills/. Deterministic (seeded), so re-running it gives byte-identical
 *   files and the output is reviewable in a diff.
 *
 *   contours.svg   topographic rings around one peak, black on transparent.
 *                  Used ONLY as a CSS mask: the page paints the sky's ink colour
 *                  through it, so the lines recolour with dawn/day/dusk/night.
 *                  Minor rings are half strength, every 5th ring is full strength.
 *   stars-a.svg / stars-b.svg   two sets of white dots, used as backgrounds. The
 *                  two sets twinkle out of step, which looks like many stars
 *                  twinkling while only two layers animate.
 *
 *   All three are drawn on a 1200 x 800 canvas. The page sizes the box that
 *   holds them to "cover the screen at 3:2", so a position in this file is the
 *   same percentage position on screen at any window size.
 *
 *   pnpm hills:assets
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, '../../public/hills')
mkdirSync(out, { recursive: true })

const W = 1200
const H = 800

/** Peak position in canvas units. The sunlit glow in globals.css uses the same spot. */
export const PEAK = { x: 860, y: 290 }

function ring(cx: number, cy: number, k: number): string {
  const N = 96
  let d = ''
  for (let s = 0; s <= N; s++) {
    const a = (s / N) * Math.PI * 2
    const rr =
      k *
      (1 +
        0.16 * Math.sin(3 * a + 1.2) +
        0.1 * Math.sin(5 * a + 0.4) +
        0.07 * Math.sin(7 * a + 2.1) +
        0.05 * Math.sin(2 * a + k * 0.01))
    d += `${s ? 'L' : 'M'}${(cx + Math.cos(a) * rr * 1.35).toFixed(1)} ${(cy + Math.sin(a) * rr * 0.82).toFixed(1)}`
  }
  return `${d}Z`
}

function contours(): string {
  const count = 24
  const spacing = 26
  let minor = ''
  let major = ''
  for (let i = 1; i <= count; i++) {
    const p = `<path d="${ring(PEAK.x, PEAK.y, i * spacing)}"/>`
    if (i % 5 === 0) major += p
    else minor += p
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<g fill="none" stroke="#000" stroke-width="1" opacity=".5">${minor}</g>` +
    `<g fill="none" stroke="#000" stroke-width="1.4">${major}</g>` +
    `</svg>\n`
  )
}

/** Small seeded generator (Park-Miller), same family the mockup used. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

function stars(seed: number, n: number): string {
  const r = rng(seed)
  const maxY = H * 0.62
  let dots = ''
  for (let i = 0; i < n; i++) {
    const x = r() * W
    const y = r() * maxY
    const rad = r() < 0.15 ? 1.7 : 1.15
    const o = 0.45 + r() * 0.55
    dots += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rad}" opacity="${o.toFixed(2)}"/>`
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<g fill="#fff">${dots}</g></svg>\n`
  )
}

writeFileSync(path.join(out, 'contours.svg'), contours())
writeFileSync(path.join(out, 'stars-a.svg'), stars(7, 46))
writeFileSync(path.join(out, 'stars-b.svg'), stars(1013, 38))
console.log('Wrote public/hills/contours.svg, stars-a.svg, stars-b.svg')
