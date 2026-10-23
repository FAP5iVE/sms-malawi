/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/chart/chartLabels.tsx
 * [PURPOSE]: The ONE place that decides how a chart labels itself. Every chart
 *   in the system — the shared `<Chart>` (Recharts + ApexCharts renderers) and
 *   the hand-built Recharts charts in reports/page.tsx, ForecastPanel and
 *   PayrollInsightsTab — draws its on-chart labels and its key from here, so a
 *   bar, a line point, a pie slice or a gauge is labelled the same way
 *   everywhere:
 *     - every bar / line point shows its VALUE on the chart (`valueFormatter`
 *       + `BAR_LABEL_PROPS`), formatted as a count, a percentage or MWK;
 *     - every pie / donut slice shows its NAME and SHARE on the chart
 *       (`PieSliceLabel`) and its exact value in the key (`ChartKey`);
 *     - every chart — including single-series ones — has a key that says what
 *       each colour represents (`ChartKey`), never a blank one.
 *   Previously only the tooltip (hover) identified a slice or bar, which is
 *   invisible on touch screens, in print, and in screenshots.
 */

import type { ReactNode } from 'react'
import type { DefaultLegendContentProps, PieLabelRenderProps } from 'recharts'

import type { ValueFormat } from './types'

export type { ValueFormat }

// ─── VALUE FORMATTING ─────────────────────────────────────────────────────────

/**
 * Work out a series' format. An explicit `format` always wins; otherwise a
 * label that says "%" is a percentage and one that says "MWK" is money, so
 * existing call sites (`'Attendance %'`, `'Collected (MWK)'`) label correctly
 * without being touched.
 */
export function inferValueFormat(label: string | undefined, explicit?: ValueFormat): ValueFormat {
  if (explicit) return explicit
  if (label && /%/.test(label)) return 'percent'
  if (label && /\bMWK\b/i.test(label)) return 'mwk'
  return 'number'
}

function trimDecimals(n: number, maxDecimals: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals })
}

function compact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${trimDecimals(n / 1_000_000_000, 1)}B`
  if (abs >= 1_000_000) return `${trimDecimals(n / 1_000_000, 1)}M`
  if (abs >= 10_000) return `${trimDecimals(n / 1_000, 1)}K`
  return trimDecimals(n, abs < 100 ? 1 : 0)
}

/** Short, on-chart text for a value (bar tops, line points, axis ticks). */
export function formatChartValue(value: unknown, format: ValueFormat = 'number'): string {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  if (format === 'percent') return `${trimDecimals(n, 1)}%`
  if (format === 'mwk') return `MWK ${compact(n)}`
  return compact(n)
}

/** Full-precision text for a value (key entries, tooltips). */
export function formatChartValueFull(value: unknown, format: ValueFormat = 'number'): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  if (format === 'percent') return `${trimDecimals(n, 1)}%`
  if (format === 'mwk') return `MWK ${trimDecimals(n, 0)}`
  return trimDecimals(n, 2)
}

/** Recharts-compatible formatter: `<LabelList formatter={valueFormatter('mwk')} />`. */
export function valueFormatter(format: ValueFormat = 'number'): (v: unknown) => string {
  return (v: unknown) => formatChartValue(v, format)
}

// ─── CATEGORY (AXIS) TEXT ─────────────────────────────────────────────────────

/** Shorten a category name for an axis tick; the tooltip/key still carry the full name. */
export function truncateLabel(value: unknown, max = 16): string {
  const s = String(value ?? '')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/**
 * Axis layout for a category axis: tilt the names when there are many or long
 * ones, and ALWAYS draw every one (`interval: 0`) — Recharts' default silently
 * skips every other name on a crowded axis, which left bars with no name.
 */
export function categoryAxisLayout(categories: Array<string | number>): {
  interval: 0
  angle: number
  textAnchor: 'end' | 'middle'
  height: number
} {
  const longest = categories.reduce<number>((m, c) => Math.max(m, String(c).length), 0)
  const tilted = categories.length > 6 || longest > 10
  return {
    interval: 0,
    angle: tilted ? -35 : 0,
    textAnchor: tilted ? 'end' : 'middle',
    height: tilted ? 64 : 30,
  }
}

// ─── BAR / POINT VALUE LABELS ─────────────────────────────────────────────────

/**
 * Spread onto `<LabelList>` to print each bar's value above it (vertical bars)
 * or beside it (horizontal bars). `fill-current text-body` follows the active
 * light/dark theme, so labels stay readable on both.
 */
export const BAR_LABEL_PROPS = {
  position: 'top' as const,
  fontSize: 10,
  className: 'fill-current text-body',
}

export const HBAR_LABEL_PROPS = {
  position: 'right' as const,
  fontSize: 10,
  className: 'fill-current text-body',
}

/** A line/area point label is only legible when there are few points. */
export const MAX_LABELLED_POINTS = 12

// ─── PIE / DONUT ──────────────────────────────────────────────────────────────

/**
 * On-chart label for a pie/donut slice: its NAME and SHARE, drawn beside the
 * slice with a leader line. Every slice gets one.
 */
export function PieSliceLabel(props: PieLabelRenderProps): ReactNode {
  const { x, y, textAnchor, name, percent } = props
  if (typeof x !== 'number' || typeof y !== 'number') return null
  const pct = Math.round((percent ?? 0) * 100)
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline="central"
      fontSize={11}
      className="fill-current text-body"
    >
      {`${truncateLabel(name, 14)} ${pct}%`}
    </text>
  )
}

// ─── THE KEY (LEGEND) ─────────────────────────────────────────────────────────

/**
 * Builds the `content` for a Recharts `<Legend>`: a colour swatch plus the
 * series (or slice) name, and — when `detail` is given — its exact value.
 * shadcn's `ChartLegendContent` looked a series up by key and rendered nothing
 * when it was missing, so every pie/donut key and some bar keys came out blank;
 * this one always prints the entry's own name.
 *
 * `detail(name)` returns extra text (e.g. "42 · 35%") for that entry.
 */
export function chartKey(detail?: (name: string) => string | undefined) {
  return function ChartKeyContent({ payload }: DefaultLegendContentProps): ReactNode {
    if (!payload?.length) return null
    return (
      <ul
        className="m-0 flex list-none flex-wrap items-center justify-center gap-x-4 gap-y-1 p-0 pt-2 text-[11px] text-body"
        aria-label="Chart key"
      >
        {payload
          .filter((item) => item.type !== 'none')
          .map((item, index) => {
            const name = String(item.value ?? '')
            const extra = detail?.(name)
            return (
              <li key={`${name}-${index}`} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: item.color }}
                />
                <span>{name}</span>
                {extra ? <span className="text-muted tabular">{extra}</span> : null}
              </li>
            )
          })}
      </ul>
    )
  }
}
