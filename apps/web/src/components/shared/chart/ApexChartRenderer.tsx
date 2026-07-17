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
 * [DEPENDS ON]:
 *   - react-apexcharts / apexcharts (R-pre; stack deps)
 *   - next-themes (resolved light/dark mode)
 *   - @/lib/chartPalette (R16 chartColorAt)
 *   - ./types (R17 ChartProps contract)
 */

'use client'

import type { ApexOptions } from 'apexcharts'
import { useTheme } from 'next-themes'
import dynamic from 'next/dynamic'

import { chartColorAt } from '@/lib/chartPalette'
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

const ReactApexChart = dynamic<ApexComponentProps>(() => import('react-apexcharts'), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-xl bg-page animate-pulse" />,
})

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
  const categories = data.map((d) => String(d.x))

  // Build the two possible series shapes: axis (array of {name,data}) vs
  // non-axis (number[] for pie/donut/radial).
  let apexSeries: ApexOptions['series']
  let labels: string[] | undefined
  let colors: string[]

  if (base === 'pie' || base === 'donut') {
    const first = series[0]
    apexSeries = first ? data.map((d) => Number(d[first.key] ?? 0)) : []
    labels = data.map((d) => String(d.x))
    colors = data.map((_, i) => chartColorAt(i))
  } else if (base === 'radialBar') {
    const first = series[0]
    const firstPoint = data[0]
    const value = first && firstPoint ? Number(firstPoint[first.key] ?? 0) : 0
    apexSeries = [value]
    labels = first ? [first.label] : []
    colors = [first?.color ?? chartColorAt(0)]
  } else if (type === 'combo') {
    apexSeries = series.map((s) => ({
      name: s.label,
      type: comboSeriesType(s.kind),
      data: data.map((d) => Number(d[s.key] ?? 0)),
    }))
    colors = seriesColors(series)
  } else {
    apexSeries = series.map((s) => ({
      name: s.label,
      data: data.map((d) => Number(d[s.key] ?? 0)),
    }))
    colors = seriesColors(series)
  }

  const options: ApexOptions = {
    chart: {
      type: base,
      background: 'transparent',
      stacked: type === 'stackedBar',
      zoom: { enabled: Boolean(zoomable) },
      toolbar: { show: Boolean(exportable) },
      fontFamily: 'inherit',
      parentHeightOffset: 0,
    },
    theme: { mode },
    colors,
    labels,
    dataLabels: { enabled: base === 'radialBar' },
    stroke: { curve: 'smooth', width: base === 'line' ? 2 : 1 },
    fill: { opacity: base === 'area' ? 0.15 : 1 },
    legend: { show: series.length > 1 || base === 'pie' || base === 'donut', position: 'bottom' },
    grid: { borderColor: mode === 'dark' ? '#2a2f3a' : '#e5e7eb', strokeDashArray: 4 },
    plotOptions: {
      bar: { columnWidth: '55%', borderRadius: 4 },
      radialBar: {
        hollow: { size: '62%' },
        dataLabels: {
          name: { show: true, fontSize: '12px' },
          value: { show: true, formatter: (v) => `${Math.round(Number(v))}%` },
        },
      },
    },
    xaxis:
      base === 'pie' || base === 'donut' || base === 'radialBar'
        ? undefined
        : { categories, axisBorder: { show: false }, axisTicks: { show: false } },
    tooltip: { theme: mode },
    noData: { text: emptyStateMessage ?? 'No data to display.' },
  }

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
