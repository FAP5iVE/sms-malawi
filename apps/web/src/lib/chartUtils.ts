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
 * [DEPENDS ON]:
 *   - @/lib/chartPalette (R16 CHART_PALETTE / chartColorAt)
 *   - @/components/shared/chart/types (R17 ChartType/ChartDataPoint contract)
 */

import { chartColorAt } from '@/lib/chartPalette'
import type { ChartDataPoint, ChartType } from '@/components/shared/chart/types'

const PADDING = { top: 16, right: 16, bottom: 28, left: 40 } as const

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
): string {
  const plotW = width - PADDING.left - PADDING.right
  const plotH = height - PADDING.top - PADDING.bottom
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
      let cursorY = PADDING.top + plotH
      keys.forEach((key, si) => {
        const v = numValue(point, key)
        const barH = (v / max) * plotH
        cursorY -= barH
        bars.push(
          `<rect x="${groupX + groupWidth * 0.15}" y="${cursorY}" ` +
            `width="${groupWidth * 0.7}" height="${barH}" fill="${chartColorAt(si)}" />`,
        )
      })
    } else {
      const barSlot = (groupWidth * 0.7) / Math.max(keys.length, 1)
      keys.forEach((key, si) => {
        const v = numValue(point, key)
        const barH = (v / max) * plotH
        const x = groupX + groupWidth * 0.15 + si * barSlot
        bars.push(
          `<rect x="${x}" y="${PADDING.top + plotH - barH}" ` +
            `width="${barSlot * 0.9}" height="${barH}" fill="${chartColorAt(si)}" />`,
        )
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
): string {
  const plotW = width - PADDING.left - PADDING.right
  const plotH = height - PADDING.top - PADDING.bottom
  const max = maxAcross(data, keys)
  const stepX = data.length > 1 ? plotW / (data.length - 1) : plotW

  const parts: string[] = []
  keys.forEach((key, si) => {
    const color = chartColorAt(si)
    const points = data.map((point, i) => {
      const x = PADDING.left + i * stepX
      const y = PADDING.top + plotH - (numValue(point, key) / max) * plotH
      return `${x},${y}`
    })
    if (area && points.length > 0) {
      const first = points[0] ?? ''
      const last = points[points.length - 1] ?? ''
      const firstX = first.split(',')[0] ?? String(PADDING.left)
      const lastX = last.split(',')[0] ?? String(PADDING.left + plotW)
      const baseY = PADDING.top + plotH
      parts.push(
        `<polygon points="${firstX},${baseY} ${points.join(' ')} ${lastX},${baseY}" ` +
          `fill="${color}" fill-opacity="0.15" />`,
      )
    }
    parts.push(
      `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2" />`,
    )
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
): string {
  const key = keys[0]
  if (!key) return ''
  const cx = width / 2
  const cy = height / 2
  const radius = Math.min(width, height) / 2 - 12
  const inner = donut ? radius * 0.6 : 0
  const total = data.reduce((sum, p) => sum + numValue(p, key), 0) || 1

  let angle = -Math.PI / 2
  const slices: string[] = []
  data.forEach((point, i) => {
    const fraction = numValue(point, key) / total
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
    angle = next
  })
  return slices.join('')
}

function renderRadial(data: ChartDataPoint[], keys: string[], width: number, height: number): string {
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
    `fill="#111827">${Math.round(value)}%</text>`
  )
}

/**
 * Render a chart to a standalone SVG markup string at a fixed pixel size.
 * Series keys are derived from the data (every key except `x`).
 */
export function renderStaticChartSVG(
  data: ChartDataPoint[],
  type: ChartType,
  width: number,
  height: number,
): string {
  if (data.length === 0) return emptySvg(width, height)
  const keys = deriveSeriesKeys(data)
  if (keys.length === 0) return emptySvg(width, height)

  let inner: string
  switch (type) {
    case 'bar':
    case 'combo':
      inner = renderBars(data, keys, width, height, false)
      break
    case 'stackedBar':
      inner = renderBars(data, keys, width, height, true)
      break
    case 'line':
    case 'timeSeries':
      inner = renderLinesOrArea(data, keys, width, height, false)
      break
    case 'area':
      inner = renderLinesOrArea(data, keys, width, height, true)
      break
    case 'pie':
      inner = renderPie(data, keys, width, height, false)
      break
    case 'donut':
      inner = renderPie(data, keys, width, height, true)
      break
    case 'radial':
      inner = renderRadial(data, keys, width, height)
      break
  }
  return svgWrap(width, height, inner)
}
