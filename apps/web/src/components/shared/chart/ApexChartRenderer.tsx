/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/chart/ApexChartRenderer.tsx
 * [R-PHASE]: R17 — Unified Charting Architecture (Phase 10C Plan)
 * [PURPOSE]: Renders a `ChartProps` using ApexCharts, translating the shared
 *   contract into an `ApexOptions` object. This is the renderer for the shapes
 *   Recharts covers less cleanly and the interactions Recharts lacks:
 *     - `zoomable`  → `chart.zoom.enabled` (pan/zoom on axis charts)
 *     - `exportable`→ ApexCharts' built-in PNG/SVG/CSV/print toolbar
 *     - `radial`    → radial-bar gauge (e.g. Fee Collection %)
 *     - `combo`     → mixed column/line/area on one axis
 *     - `timeSeries`→ large-point-count line series
 *   `react-apexcharts` is not SSR-compatible, so it is loaded via `next/dynamic`
 *   with `ssr: false` and a pulse fallback — the same pattern `BudgetTab.tsx`
 *   already established, and the pattern sms-erp-frontend Rule 10 mandates for
 *   every chart library.
 *
 *   Series colours draw from the SAME R16 design-token palette
 *   (`chartColorAt(index)`) `RechartsRenderer.tsx` uses, so a dashboard mixing
 *   both libraries stays visually consistent. Light/dark correctness comes from
 *   `theme.mode`, resolved reactively from `next-themes` so a theme toggle
 *   re-renders the chart in the right palette. The `ariaLabel` is applied to a
 *   `role="img"` wrapper, closing the same screen-reader gap the Recharts
 *   renderer does.
 *
 *   LABELLING (every chart, no exceptions — mirrors RechartsRenderer):
 *     - bars and (short) line/area points print their VALUE on the chart;
 *     - pie/donut slices print their SHARE on the slice, the key lists each
 *       slice by NAME with its exact value, and a donut shows its total;
 *     - the key is always shown (it was hidden for single-series charts);
 *     - category names are rotated rather than dropped when the axis is crowded.
 *   All formatter functions are module-level / cached so their identity is
 *   stable across renders (see the [BUG FIX] notes below).
 * [DEPENDS ON]:
 *   - ./chartLabels (shared value formatting)
 *   - react-apexcharts / apexcharts (R-pre; stack deps)
 *   - next-themes (resolved light/dark mode)
 *   - @/lib/chartPalette (R16 chartColorAt)
 *   - ./types (R17 ChartProps contract)
 */

'use client'

import type { ApexOptions } from 'apexcharts'
import { useTheme } from 'next-themes'
import dynamic from 'next/dynamic'
import type { ComponentType } from 'react'
import { useMemo } from 'react'

import { chartColorAt } from '@/lib/chartPalette'
import {
  MAX_LABELLED_POINTS,
  formatChartValue,
  formatChartValueFull,
  inferValueFormat,
  type ValueFormat,
} from './chartLabels'
import type { ChartProps, ChartSeriesConfig, ChartType } from './types'

const DEFAULT_HEIGHT = 300

type ApexBaseType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'radialBar'

/** Props we actually pass to the dynamically-loaded `<ReactApexChart>`. */
interface ApexComponentProps {
  type: ApexBaseType
  series: ApexOptions['series']
  options: ApexOptions
  height: number
}

// react-apexcharts's own Props.type is a wider, optional union (14 chart
// kinds, e.g. 'scatter' | 'heatmap' | 'treemap' | ...) than the
// `ApexBaseType` this renderer restricts itself to — real chart types this
// renderer never uses, plus `undefined` since the library leaves `type`
// optional. Passing our narrower `ApexComponentProps` as `dynamic<P>()`'s
// generic makes TypeScript try to structurally verify the *whole* resolved
// component against it, which fails on that required-vs-optional,
// narrower-vs-wider mismatch. The loader instead resolves to
// `ComponentType<ApexComponentProps>` directly — asserting once, at this
// single boundary, that every value ApexBaseType allows is a valid member
// of the library's own wider `type` union (it is), and that this file only
// ever calls `<ReactApexChart>` with our narrower shape (it does, below).
const ReactApexChart = dynamic(
  () => import('react-apexcharts').then((mod) => mod.default as unknown as ComponentType<ApexComponentProps>),
  {
    ssr: false,
    loading: () => <div className="h-full w-full rounded-xl bg-page animate-pulse" />,
  },
)

// [BUG FIX] Hoisted out of the component body. react-apexcharts decides
// whether to call `updateSeries()` (cheap: patch existing paths) or
// `updateOptions()` (expensive: tear the chart down via `Destroy.clear()`
// and fully `create()` it again) by deep-comparing the *previous* `options`
// object against the new one. That comparator treats any function-valued
// property as unequal unless it's the exact same reference (functions can
// only ever be `===` to themselves, never structurally equal) — so an
// inline `formatter` recreated on every render made `options` register as
// "changed" on every single render, even when nothing about it actually
// changed, forcing a full destroy+recreate cycle every time.
// ApexCharts' own `_updateOptions()` fans that recreate out across
// `getSyncedCharts()` via a bare `Array.prototype.forEach()`, whose
// callback's returned promise chain is never collected — so any exception
// thrown mid-recreate (e.g. from a chart caught mid-teardown by another
// overlapping recreate) becomes an unhandled promise rejection rather than
// something a caller could ever `.catch()`. Forcing that expensive,
// non-cancellable cycle on every render — for a pure formatting function
// that never needed a fresh identity — was manufacturing exactly the
// rapid, overlapping recreate cycles that condition needs to surface. This
// formatter has no closure over component state, so a single stable,
// module-level reference removes it from the equation entirely: unrelated
// renders that don't change the chart's actual shape now correctly take
// the cheap `updateSeries()` path (or skip updating at all), and the
// destroy+recreate cycle only runs when the chart truly has something new
// to show.
function formatRadialValue(v: number): string {
  return `${Math.round(Number(v))}%`
}

// ─── STABLE LABEL FORMATTERS ─────────────────────────────────────────────────
// Same reasoning as `formatRadialValue` above: react-apexcharts treats a
// function-valued option as "changed" unless it is the SAME reference, so each
// formatter is created once per distinct format combination and cached, never
// recreated inline on a render. They read everything else they need from the
// `opts.w` object ApexCharts hands them, not from a closure.

const formatterCache = new Map<string, unknown>()

function stable<T>(key: string, make: () => T): T {
  if (!formatterCache.has(key)) formatterCache.set(key, make())
  return formatterCache.get(key) as T
}

type ApexOpts = { seriesIndex?: number; w?: { globals?: { series?: unknown[]; seriesTotals?: number[] } } }

/** Bar-top / point label: each series is written in its own format. */
function valueLabelFormatter(formats: ValueFormat[]) {
  return stable(`value:${formats.join('|')}`, () => (val: string | number | number[], opts?: ApexOpts) =>
    formatChartValue(val, formats[opts?.seriesIndex ?? 0] ?? formats[0] ?? 'number'),
  )
}

/** Axis tick / tooltip value for the first series' format. */
function axisFormatter(format: ValueFormat) {
  return stable(`axis:${format}`, () => (val: number) => formatChartValue(val, format))
}

function tooltipFormatter(formats: ValueFormat[]) {
  return stable(`tip:${formats.join('|')}`, () => (val: number, opts?: ApexOpts) =>
    formatChartValueFull(val, formats[opts?.seriesIndex ?? 0] ?? formats[0] ?? 'number'),
  )
}

/** Pie/donut slice label: the slice's share. The NAME lives in the key. */
function formatSliceShare(val: string | number | number[]): string {
  return `${Math.round(Number(val))}%`
}

/** Pie/donut key entry: "Name — value" (exact figure, series format). */
function pieLegendFormatter(format: ValueFormat) {
  return stable(`pielegend:${format}`, () => (name: string, opts?: ApexOpts) => {
    const raw = opts?.w?.globals?.series?.[opts?.seriesIndex ?? -1]
    return raw === undefined ? name : `${name} — ${formatChartValueFull(raw, format)}`
  })
}

/** Donut hole: the total of all slices. */
function donutTotalFormatter(format: ValueFormat) {
  return stable(`donuttotal:${format}`, () => (w?: ApexOpts['w']) =>
    formatChartValue((w?.globals?.seriesTotals ?? []).reduce((a, b) => a + b, 0), format),
  )
}

/** Map a `ChartType` to the ApexCharts base `chart.type`. */
function apexBaseType(type: ChartType): ApexBaseType {
  switch (type) {
    case 'bar':
    case 'stackedBar':
      return 'bar'
    case 'line':
    case 'timeSeries':
    case 'combo':
      return 'line'
    case 'area':
      return 'area'
    case 'pie':
      return 'pie'
    case 'donut':
      return 'donut'
    case 'radial':
      return 'radialBar'
  }
}

/** Per-series geometry for a `combo` chart, mapped to ApexCharts series `type`. */
function comboSeriesType(kind: ChartSeriesConfig['kind']): 'column' | 'line' | 'area' {
  if (kind === 'line') return 'line'
  if (kind === 'area') return 'area'
  return 'column'
}

function seriesColors(series: ChartSeriesConfig[]): string[] {
  return series.map((s, i) => s.color ?? chartColorAt(i))
}

export function ApexChartRenderer(props: ChartProps): React.ReactElement {
  const {
    type,
    data,
    series,
    height = DEFAULT_HEIGHT,
    title,
    subtitle,
    zoomable,
    exportable,
    emptyStateMessage,
    ariaLabel,
  } = props

  const { resolvedTheme } = useTheme()
  const mode: 'light' | 'dark' = resolvedTheme === 'dark' ? 'dark' : 'light'

  const isEmpty = data.length === 0 || series.length === 0
  const base = apexBaseType(type)
  // One format per series (explicit `format`, else inferred from its label).
  // Joined into a primitive so the options memo below only changes when a
  // format really does, not whenever the caller passes a fresh `series` array.
  const formatKey = series.map((s) => inferValueFormat(s.label, s.format)).join('|')
  const labelPoints = data.length <= MAX_LABELLED_POINTS

  // [BUG FIX] Previously computed inline in the component body on every
  // render, producing brand-new array/object references even when `data`
  // and `series` themselves hadn't changed reference (which, thanks to
  // TanStack Query's default structural sharing, they don't on a poll that
  // returns unchanged values). That reference churn fed straight into the
  // same "options always look changed" problem `formatRadialValue` above
  // caused — just via `categories`/`colors`/`labels` instead of a function.
  // Memoizing on the actual inputs means a poll that returns the same
  // values now produces `apexSeries`/`labels`/`colors`/`categories` that
  // are reference-*and*-content stable, so the options object built below
  // only changes when something real did.
  const { apexSeries, labels, colors, categories } = useMemo(() => {
    const cats = data.map((d) => String(d.x))

    if (base === 'pie' || base === 'donut') {
      const first = series[0]
      return {
        apexSeries: first ? data.map((d) => Number(d[first.key] ?? 0)) : [],
        labels: data.map((d) => String(d.x)),
        colors: data.map((_, i) => chartColorAt(i)),
        categories: cats,
      }
    }
    if (base === 'radialBar') {
      const first = series[0]
      const firstPoint = data[0]
      const value = first && firstPoint ? Number(firstPoint[first.key] ?? 0) : 0
      return {
        apexSeries: [value],
        labels: first ? [first.label] : [],
        colors: [first?.color ?? chartColorAt(0)],
        categories: cats,
      }
    }
    if (type === 'combo') {
      return {
        apexSeries: series.map((s) => ({
          name: s.label,
          type: comboSeriesType(s.kind),
          data: data.map((d) => Number(d[s.key] ?? 0)),
        })),
        labels: undefined,
        colors: seriesColors(series),
        categories: cats,
      }
    }
    return {
      apexSeries: series.map((s) => ({
        name: s.label,
        data: data.map((d) => Number(d[s.key] ?? 0)),
      })),
      labels: undefined,
      colors: seriesColors(series),
      categories: cats,
    }
  }, [base, type, data, series])

  const options: ApexOptions = useMemo(() => {
    const formats = (formatKey ? formatKey.split('|') : ['number']) as ValueFormat[]
    const firstFormat = formats[0] ?? 'number'
    const isPie = base === 'pie' || base === 'donut'
    const isStacked = type === 'stackedBar'
    const labelText = mode === 'dark' ? '#e4eaf3' : '#0f172a'

    // On-chart labels. Radial gauges draw their own centre label (plotOptions
    // below), so `dataLabels` stays on for them only to keep that label.
    const dataLabels: ApexOptions['dataLabels'] = isPie
      ? {
          enabled: true,
          formatter: formatSliceShare,
          style: { fontSize: '11px', fontWeight: 600 },
          dropShadow: { enabled: false },
        }
      : base === 'radialBar'
        ? { enabled: true }
        : {
            // Bars always carry their value; line/area points only when short enough to read.
            enabled: base === 'bar' || labelPoints,
            formatter: valueLabelFormatter(formats),
            offsetY: (base === 'bar' || type === 'combo') && !isStacked ? -18 : -6,
            style: { fontSize: '10px', fontWeight: 500, colors: isStacked ? ['#fff'] : [labelText] },
            background: { enabled: false },
            dropShadow: { enabled: false },
          }

    return {
      chart: {
        type: base,
        background: 'transparent',
        stacked: isStacked,
        zoom: { enabled: Boolean(zoomable) },
        toolbar: { show: Boolean(exportable) },
        fontFamily: 'inherit',
        parentHeightOffset: 0,
      },
      theme: { mode },
      colors,
      labels,
      dataLabels,
      stroke: { curve: 'smooth', width: base === 'line' ? 2 : 1 },
      fill: { opacity: base === 'area' ? 0.15 : 1 },
      markers: { size: base === 'bar' || isPie || base === 'radialBar' ? 0 : labelPoints ? 3 : 0 },
      // The key is ALWAYS shown (a single-series chart still says what its
      // colour is); a radial gauge names itself in its centre instead.
      legend: {
        show: base !== 'radialBar',
        position: 'bottom',
        ...(isPie ? { formatter: pieLegendFormatter(firstFormat) } : {}),
      },
      grid: { borderColor: mode === 'dark' ? '#2a2f3a' : '#e5e7eb', strokeDashArray: 4 },
      plotOptions: {
        // Column labels sit ABOVE the bar (stacked ones stay centred inside it).
        bar: {
          columnWidth: '55%',
          borderRadius: 4,
          dataLabels: { position: isStacked ? 'center' : 'top' },
        },
        pie: {
          donut: {
            labels: {
              show: base === 'donut',
              total: { show: true, label: 'Total', formatter: donutTotalFormatter(firstFormat) },
            },
          },
        },
        radialBar: {
          hollow: { size: '62%' },
          dataLabels: {
            name: { show: true, fontSize: '12px' },
            value: { show: true, formatter: formatRadialValue },
          },
        },
      },
      // [BUG FIX] Was `xaxis: undefined` for pie/donut/radialBar — an
      // explicitly-*present* key set to undefined, not an absent one.
      // ApexCharts' own internal create() reads
      // `w.config.xaxis.convertedCatToNumeric` with no optional chaining,
      // assuming its own default-merge step always leaves `xaxis` as a real
      // object; that merge appears to be a shallow one that lets an
      // explicit `undefined` from a later chart.updateOptions() call
      // overwrite (rather than skip past) its previously-merged default —
      // exactly reproducing "Cannot read properties of undefined (reading
      // 'convertedCatToNumeric')" on a live production monitoring dashboard.
      // Spreading the key in only when it's a real object — versus always
      // having the key present with a sometimes-undefined value — means
      // ApexCharts' own default never gets an explicit `undefined` to
      // collide with on any update cycle, not just the first mount.
      ...(isPie || base === 'radialBar'
        ? {}
        : {
            xaxis: {
              categories,
              axisBorder: { show: false },
              axisTicks: { show: false },
              // Never silently drop a category name: tilt crowded names instead.
              labels: { rotate: -35, rotateAlways: false, hideOverlappingLabels: false, trim: true },
            },
            yaxis: { labels: { formatter: axisFormatter(firstFormat) } },
          }),
      tooltip: {
        theme: mode,
        ...(isPie || base === 'radialBar' ? {} : { y: { formatter: tooltipFormatter(formats) } }),
      },
      noData: { text: emptyStateMessage ?? 'No data to display.' },
    }
  }, [base, type, mode, zoomable, exportable, emptyStateMessage, colors, labels, categories, formatKey, labelPoints])

  return (
    <figure className="w-full" aria-label={ariaLabel} role="group">
      {(title ?? subtitle) ? (
        <figcaption className="mb-3">
          {title ? <p className="font-heading font-semibold text-sm text-body">{title}</p> : null}
          {subtitle ? <p className="text-xs text-muted mt-0.5">{subtitle}</p> : null}
        </figcaption>
      ) : null}

      {isEmpty ? (
        <div
          role="status"
          className="flex items-center justify-center rounded-xl bg-page text-sm text-muted"
          style={{ height }}
        >
          {emptyStateMessage ?? 'No data to display.'}
        </div>
      ) : (
        <div role="img" aria-label={ariaLabel} style={{ height }}>
          <ReactApexChart type={base} series={apexSeries} options={options} height={height} />
        </div>
      )}
    </figure>
  )
}