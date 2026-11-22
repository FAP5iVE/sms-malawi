/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/lib/chartUtils.ts
 * [R-PHASE]: R17 — Unified Charting Architecture (Phase 10C Plan)
 * [PURPOSE]: A fixed-pixel-dimension, non-responsive SVG-STRING chart renderer
 *   for contexts that have no real browser viewport and cannot mount a React
 *   chart: the server-side report-card HTML builder (`examService.ts`'s
 *   `buildReportCardHtml()` path) and the print/PDF pipeline. Both the React
 *   screen-preview path (`PrintableReportCard.tsx`) and the server string-build
 *   path can call the SAME function here, so if either ever gains a chart the
 *   two report-card renderers produce visually identical output rather than
 *   drifting apart — consistent with R8's consolidation of report-card
 *   generation onto one canonical pipeline.
 *
 *   Returns a complete, standalone `<svg>…</svg>` markup string (with `xmlns`)
 *   that can be inlined into server-built HTML or embedded as an image. Series
 *   colours come from the R16 `CHART_PALETTE` by index — the same palette the
 *   live Recharts/ApexCharts renderers use — so a static report-card chart
 *   matches its on-screen equivalent. Series keys are derived from the data
 *   itself (every key on a point except `x`), so the roadmap's positional
 *   `(data, type, width, height)` signature stays self-sufficient with no
 *   separate series argument.
 *
 *   This is intentionally a small, dependency-free string builder — no browser
 *   APIs, no React — so it is safe to call from a Vercel serverless function
 *   during PDF generation.
 *
 *   LABELLING: like the live renderers, every chart drawn here labels itself —
 *   a key naming each series/slice (with its value for pies), the value on
 *   every bar and line point, and name + share beside every pie slice — so a
 *   printed report card is readable without hovering. Series names default to
 *   their data key; pass `seriesLabels` for human-readable ones.
 * [DEPENDS ON]:
 *   - @/lib/chartPalette (R16 CHART_PALETTE / chartColorAt)
 *   - @/components/shared/chart/types (R17 ChartType/ChartDataPoint contract)
 */

import { chartColorAt } from '@/lib/chartPalette'
import type { ChartDataPoint, ChartType } from '@/components/shared/chart/types'

const PADDING = { right: 16, bottom: 28, left: 40 } as const
/** Gap between the key and the plot, leaving room for the top bar's value label. */
const LABEL_HEADROOM = 18
const LEGEND_ROW_HEIGHT = 16
const TEXT_COLOR = '#374151'

/** Compact on-chart number: 1200 → "1.2K", 3400000 → "3.4M", 7.5 → "7.5". */
function fmtValue(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${+(n / 1_000).toFixed(1)}K`
  return String(+n.toFixed(abs < 100 ? 1 : 0))
}

interface KeyItem {
  color: string
  text: string
}

/**
 * The key: a swatch + name per entry, wrapped onto as many rows as the width
 * needs. Returns the markup and the height it occupies so the plot can start
 * below it.
 */
function renderKey(items: KeyItem[], width: number): { svg: string; height: number } {
  if (items.length === 0) return { svg: '', height: 0 }
  const parts: string[] = []
  let x = 12
  let row = 0
  for (const item of items) {
    const itemWidth = 18 + item.text.length * 5.6 + 14
    if (x + itemWidth > width - 8 && x > 12) {
      x = 12
      row += 1
    }
    const y = 4 + row * LEGEND_ROW_HEIGHT
    parts.push(
      `<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${item.color}" />` +
        `<text x="${x + 15}" y="${y + 9}" font-size="10" fill="${TEXT_COLOR}">${esc(item.text)}</text>`,
    )
    x += itemWidth
  }
  return { svg: parts.join(''), height: (row + 1) * LEGEND_ROW_HEIGHT + 4 }
}

/** A value label centred at (x, y). */
function valueText(x: number, y: number, text: string, fill = TEXT_COLOR): string {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-size="9" fill="${fill}">${esc(text)}</text>`
}

/** Escape a value for safe inclusion in SVG text/attributes. */
function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Series keys are every key on the first point except the `x` axis key. */
function deriveSeriesKeys(data: ChartDataPoint[]): string[] {
  const first = data[0]
  if (!first) return []
  return Object.keys(first).filter((k) => k !== 'x')
}

function numValue(point: ChartDataPoint | undefined, key: string): number {
  if (!point) return 0
  const raw = point[key]
  return typeof raw === 'number' ? raw : Number(raw ?? 0)
}

function maxAcross(data: ChartDataPoint[], keys: string[]): number {
  let max = 0
  for (const point of data) {
    for (const key of keys) {
      const v = numValue(point, key)
      if (v > max) max = v
    }
  }
  return max === 0 ? 1 : max
}

function svgWrap(width: number, height: number, inner: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" font-family="sans-serif">${inner}</svg>`
  )
}

function emptySvg(width: number, height: number): string {
  const label =
    `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" ` +
    `font-size="12" fill="#6b7280">No data to display.</text>`
  return svgWrap(width, height, label)
}

function renderBars(
  data: ChartDataPoint[],
  keys: string[],
  width: number,
  height: number,
  stacked: boolean,
  top: number,
): string {
  const plotW = width - PADDING.left - PADDING.right
  const plotH = height - top - PADDING.bottom
  const groupCount = data.length
  const groupWidth = plotW / Math.max(groupCount, 1)
  const max = stacked
    ? Math.max(
        ...data.map((p) => keys.reduce((sum, k) => sum + numValue(p, k), 0)),
        1,
      )
    : maxAcross(data, keys)

  const bars: string[] = []
  data.forEach((point, gi) => {
    const groupX = PADDING.left + gi * groupWidth
    if (stacked) {
      let cursorY = top + plotH
      keys.forEach((key, si) => {
        const v = numValue(point, key)
        const barH = (v / max) * plotH
        cursorY -= barH
        bars.push(
          `<rect x="${groupX + groupWidth * 0.15}" y="${cursorY}" ` +
            `width="${groupWidth * 0.7}" height="${barH}" fill="${chartColorAt(si)}" />`,
        )
        // Each segment carries its value (skipped only when too thin to hold text).
        if (v > 0 && barH >= 11) {
          bars.push(valueText(groupX + groupWidth / 2, cursorY + barH / 2 + 3, fmtValue(v), '#ffffff'))
        }
      })
    } else {
      const barSlot = (groupWidth * 0.7) / Math.max(keys.length, 1)
      keys.forEach((key, si) => {
        const v = numValue(point, key)
        const barH = (v / max) * plotH
        const x = groupX + groupWidth * 0.15 + si * barSlot
        bars.push(
          `<rect x="${x}" y="${top + plotH - barH}" ` +
            `width="${barSlot * 0.9}" height="${barH}" fill="${chartColorAt(si)}" />`,
        )
        // The bar's value, just above it.
        bars.push(valueText(x + (barSlot * 0.9) / 2, top + plotH - barH - 4, fmtValue(v)))
      })
    }
    bars.push(
      `<text x="${groupX + groupWidth / 2}" y="${height - 10}" text-anchor="middle" ` +
        `font-size="10" fill="#6b7280">${esc(point.x)}</text>`,
    )
  })
  return bars.join('')
}

function renderLinesOrArea(
  data: ChartDataPoint[],
  keys: string[],
  width: number,
  height: number,
  area: boolean,
  top: number,
): string {
  const plotW = width - PADDING.left - PADDING.right
  const plotH = height - top - PADDING.bottom
  const max = maxAcross(data, keys)
  const stepX = data.length > 1 ? plotW / (data.length - 1) : plotW

  const parts: string[] = []
  keys.forEach((key, si) => {
    const color = chartColorAt(si)
    const points = data.map((point, i) => {
      const x = PADDING.left + i * stepX
      const y = top + plotH - (numValue(point, key) / max) * plotH
      return `${x},${y}`
    })
    if (area && points.length > 0) {
      const first = points[0] ?? ''
      const last = points[points.length - 1] ?? ''
      const firstX = first.split(',')[0] ?? String(PADDING.left)
      const lastX = last.split(',')[0] ?? String(PADDING.left + plotW)
      const baseY = top + plotH
      parts.push(
        `<polygon points="${firstX},${baseY} ${points.join(' ')} ${lastX},${baseY}" ` +
          `fill="${color}" fill-opacity="0.15" />`,
      )
    }
    parts.push(
      `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2" />`,
    )
    // Every point is marked and carries its value.
    data.forEach((point, i) => {
      const x = PADDING.left + i * stepX
      const y = top + plotH - (numValue(point, key) / max) * plotH
      parts.push(`<circle cx="${x}" cy="${y}" r="2.5" fill="${color}" />`)
      parts.push(valueText(x, y - 6, fmtValue(numValue(point, key))))
    })
  })
  data.forEach((point, i) => {
    const x = PADDING.left + i * stepX
    parts.push(
      `<text x="${x}" y="${height - 10}" text-anchor="middle" font-size="10" ` +
        `fill="#6b7280">${esc(point.x)}</text>`,
    )
  })
  return parts.join('')
}

function renderPie(
  data: ChartDataPoint[],
  keys: string[],
  width: number,
  height: number,
  donut: boolean,
  top: number,
): string {
  const key = keys[0]
  if (!key) return ''
  const cx = width / 2
  // Centre the pie in the space below the key; leave a margin for slice labels.
  const cy = top + (height - top) / 2
  const radius = Math.max(8, Math.min(width / 2, (height - top) / 2) - 34)
  const inner = donut ? radius * 0.6 : 0
  const total = data.reduce((sum, p) => sum + numValue(p, key), 0) || 1

  let angle = -Math.PI / 2
  const slices: string[] = []
  const labels: string[] = []
  data.forEach((point, i) => {
    const value = numValue(point, key)
    const fraction = value / total
    const next = angle + fraction * Math.PI * 2
    const x1 = cx + radius * Math.cos(angle)
    const y1 = cy + radius * Math.sin(angle)
    const x2 = cx + radius * Math.cos(next)
    const y2 = cy + radius * Math.sin(next)
    const large = fraction > 0.5 ? 1 : 0
    if (donut) {
      const ix1 = cx + inner * Math.cos(next)
      const iy1 = cy + inner * Math.sin(next)
      const ix2 = cx + inner * Math.cos(angle)
      const iy2 = cy + inner * Math.sin(angle)
      slices.push(
        `<path d="M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} ` +
          `L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z" ` +
          `fill="${chartColorAt(i)}" />`,
      )
    } else {
      slices.push(
        `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z" ` +
          `fill="${chartColorAt(i)}" />`,
      )
    }
    // Every slice is named, with its share, just outside it.
    if (value > 0) {
      const mid = angle + (next - angle) / 2
      const lx = cx + (radius + 8) * Math.cos(mid)
      const ly = cy + (radius + 8) * Math.sin(mid)
      const anchor = Math.cos(mid) >= 0 ? 'start' : 'end'
      const name = String(point.x)
      const shown = name.length > 14 ? `${name.slice(0, 13)}…` : name
      labels.push(
        `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle" ` +
          `font-size="10" fill="${TEXT_COLOR}">${esc(`${shown} ${Math.round(fraction * 100)}%`)}</text>`,
      )
    }
    angle = next
  })
  const centre = donut
    ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="16" font-weight="600" ` +
      `fill="#111827">${esc(fmtValue(total))}</text>` +
      `<text x="${cx}" y="${cy + 12}" text-anchor="middle" font-size="10" fill="#6b7280">Total</text>`
    : ''
  return slices.join('') + labels.join('') + centre
}

function renderRadial(
  data: ChartDataPoint[],
  keys: string[],
  width: number,
  height: number,
  label: string,
): string {
  const key = keys[0]
  const point = data[0]
  if (!key || !point) return ''
  const value = Math.max(0, Math.min(100, numValue(point, key)))
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) / 2 - 14
  const circumference = 2 * Math.PI * radius
  const dash = (value / 100) * circumference
  return (
    `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="12" />` +
    `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${chartColorAt(0)}" ` +
    `stroke-width="12" stroke-linecap="round" stroke-dasharray="${dash} ${circumference}" ` +
    `transform="rotate(-90 ${cx} ${cy})" />` +
    `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="18" font-weight="600" ` +
    `fill="#111827">${Math.round(value)}%</text>` +
    // What the gauge measures, under its value.
    `<text x="${cx}" y="${cy + 22}" text-anchor="middle" font-size="10" fill="#6b7280">${esc(label)}</text>`
  )
}

/**
 * Render a chart to a standalone SVG markup string at a fixed pixel size.
 * Series keys are derived from the data (every key except `x`); pass
 * `seriesLabels` ({ revenue: 'Fees collected' }) to name them in the key.
 */
export function renderStaticChartSVG(
  data: ChartDataPoint[],
  type: ChartType,
  width: number,
  height: number,
  seriesLabels: Record<string, string> = {},
): string {
  if (data.length === 0) return emptySvg(width, height)
  const keys = deriveSeriesKeys(data)
  if (keys.length === 0) return emptySvg(width, height)

  const nameOf = (key: string): string => seriesLabels[key] ?? key
  const isPie = type === 'pie' || type === 'donut'

  // The key: slices (by category, with value) for a pie; series for everything else.
  const keyItems: KeyItem[] = isPie
    ? data.map((point, i) => ({
        color: chartColorAt(i),
        text: `${String(point.x)} — ${fmtValue(numValue(point, keys[0] ?? ''))}`,
      }))
    : keys.map((key, i) => ({ color: chartColorAt(i), text: nameOf(key) }))
  // A radial gauge names itself in its centre, so it needs no separate key.
  const key = type === 'radial' ? { svg: '', height: 0 } : renderKey(keyItems, width)
  const top = key.height + LABEL_HEADROOM

  let inner: string
  switch (type) {
    case 'bar':
    case 'combo':
      inner = renderBars(data, keys, width, height, false, top)
      break
    case 'stackedBar':
      inner = renderBars(data, keys, width, height, true, top)
      break
    case 'line':
    case 'timeSeries':
      inner = renderLinesOrArea(data, keys, width, height, false, top)
      break
    case 'area':
      inner = renderLinesOrArea(data, keys, width, height, true, top)
      break
    case 'pie':
      inner = renderPie(data, keys, width, height, false, top)
      break
    case 'donut':
      inner = renderPie(data, keys, width, height, true, top)
      break
    case 'radial':
      inner = renderRadial(data, keys, width, height, nameOf(keys[0] ?? ''))
      break
  }
  return svgWrap(width, height, key.svg + inner)
}
