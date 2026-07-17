/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/chart/RechartsRenderer.tsx
 * [R-PHASE]: R17 — Unified Charting Architecture (Phase 10C Plan)
 * [PURPOSE]: Renders a `ChartProps` using Recharts. Composes the existing
 *   shadcn/ui `ChartContainer`/`ChartTooltip`/`ChartTooltipContent`/`ChartLegend`/
 *   `ChartLegendContent` foundation from `@/components/ui/chart` UNMODIFIED
 *   rather than forking its theming logic — `ChartContainer` injects a
 *   `--color-<seriesKey>` CSS variable per series from the `ChartConfig` we
 *   build, and every Recharts geometry below references those variables for its
 *   fill/stroke, so light/dark theming and the series palette come for free.
 *
 *   Series colours default to the R16 design-token palette via
 *   `chartColorAt(index)` when a series omits an explicit `color`, so no raw hex
 *   literal ever appears at a call site and Recharts- and ApexCharts-backed
 *   charts stay visually identical.
 *
 *   The whole plot is wrapped in a `role="img"` element carrying the REQUIRED
 *   `ariaLabel`, giving screen-reader users the text alternative every existing
 *   chart in the codebase was missing. An empty `data`/`series` set renders
 *   `emptyStateMessage` instead of a bare axis frame.
 *
 *   This renderer is normally reached only for the types `getRecommendedLibrary`
 *   routes to Recharts (`bar`/`stackedBar`/`line`/`area`/`pie`/`donut`), but it
 *   implements every `ChartType` so an explicit `library="recharts"` override
 *   never hits an unhandled case.
 * [DEPENDS ON]:
 *   - @/components/ui/chart (ChartContainer/Tooltip/Legend foundation, R-pre)
 *   - @/lib/chartPalette (R16 CHART_PALETTE / chartColorAt)
 *   - ./types (R17 ChartProps contract)
 */

'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { chartColorAt } from '@/lib/chartPalette'
import type { ChartProps, ChartSeriesConfig } from './types'

const DEFAULT_HEIGHT = 300

/** CSS variable reference the ChartContainer injects for a given series key. */
function colorVar(key: string): string {
  return `var(--color-${key})`
}

/** Build the shadcn `ChartConfig`, defaulting each series colour to the R16
 *  palette by index when the series omits an explicit `color`. */
function buildConfig(series: ChartSeriesConfig[]): ChartConfig {
  return series.reduce<ChartConfig>((acc, s, index) => {
    acc[s.key] = { label: s.label, color: s.color ?? chartColorAt(index) }
    return acc
  }, {})
}

/** Slice data for pie/donut: name from `x`, value from the first series' key. */
function toPieSlices(props: ChartProps): { name: string; value: number }[] {
  const first = props.series[0]
  if (!first) return []
  return props.data.map((d) => ({
    name: String(d.x),
    value: Number(d[first.key] ?? 0),
  }))
}

function CartesianAxes() {
  return (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis dataKey="x" tickLine={false} axisLine={false} tickMargin={8} />
      <YAxis tickLine={false} axisLine={false} tickMargin={8} width={44} />
    </>
  )
}

function renderChart(props: ChartProps): React.ReactElement {
  const { type, data, series } = props
  const stacked = type === 'stackedBar'

  switch (type) {
    case 'bar':
    case 'stackedBar':
      return (
        <BarChart data={data} accessibilityLayer>
          <CartesianAxes />
          <ChartTooltip content={<ChartTooltipContent />} />
          {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={colorVar(s.key)}
              radius={stacked ? 0 : [4, 4, 0, 0]}
              stackId={stacked ? 'stack' : undefined}
            />
          ))}
        </BarChart>
      )

    case 'line':
    case 'timeSeries':
      return (
        <LineChart data={data} accessibilityLayer>
          <CartesianAxes />
          <ChartTooltip content={<ChartTooltipContent />} />
          {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={colorVar(s.key)}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      )

    case 'area':
      return (
        <AreaChart data={data} accessibilityLayer>
          <CartesianAxes />
          <ChartTooltip content={<ChartTooltipContent />} />
          {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={colorVar(s.key)}
              fill={colorVar(s.key)}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      )

    case 'combo':
      return (
        <ComposedChart data={data} accessibilityLayer>
          <CartesianAxes />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((s) => {
            const kind = s.kind ?? 'bar'
            if (kind === 'line') {
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={colorVar(s.key)}
                  strokeWidth={2}
                  dot={false}
                />
              )
            }
            if (kind === 'area') {
              return (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={colorVar(s.key)}
                  fill={colorVar(s.key)}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              )
            }
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={colorVar(s.key)}
                radius={[4, 4, 0, 0]}
              />
            )
          })}
        </ComposedChart>
      )

    case 'pie':
    case 'donut': {
      const slices = toPieSlices(props)
      return (
        <PieChart accessibilityLayer>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={type === 'donut' ? 60 : 0}
            outerRadius={90}
            paddingAngle={type === 'donut' ? 2 : 0}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.name} fill={chartColorAt(index)} />
            ))}
          </Pie>
        </PieChart>
      )
    }

    case 'radial': {
      const first = props.series[0]
      const firstPoint = props.data[0]
      const value = first && firstPoint ? Number(firstPoint[first.key] ?? 0) : 0
      const radialData = [{ x: first?.label ?? '', value }]
      return (
        <RadialBarChart
          data={radialData}
          innerRadius="70%"
          outerRadius="100%"
          startAngle={90}
          endAngle={90 - (value / 100) * 360}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={8}
            fill={first?.color ?? chartColorAt(0)}
            background
          />
        </RadialBarChart>
      )
    }
  }
}

export function RechartsRenderer(props: ChartProps): React.ReactElement {
  const { data, series, height = DEFAULT_HEIGHT, title, subtitle, emptyStateMessage, ariaLabel } =
    props
  const isEmpty = data.length === 0 || series.length === 0
  const config = buildConfig(series)

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
        <div role="img" aria-label={ariaLabel}>
          <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
            {renderChart(props)}
          </ChartContainer>
        </div>
      )}
    </figure>
  )
}
