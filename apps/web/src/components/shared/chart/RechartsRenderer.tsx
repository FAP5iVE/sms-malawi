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
 *
 *   LABELLING (every chart, no exceptions — see ./chartLabels.tsx):
 *     - every bar, and every point of a short line/area, prints its VALUE on
 *       the chart (counts, %, or MWK per the series' `format`);
 *     - every pie/donut slice prints its NAME and SHARE beside it, and the key
 *       lists each slice with its exact value; a donut also shows its total in
 *       the hole; a radial gauge prints its value and name in the centre;
 *     - every chart has a key, INCLUDING single-series ones (it used to be
 *       hidden for one series, leaving the colour unexplained);
 *     - category names are never skipped on a crowded axis.
 * [DEPENDS ON]:
 *   - ./chartLabels (shared on-chart label + key helpers)
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
  Label,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { chartColorAt } from '@/lib/chartPalette'
import {
  BAR_LABEL_PROPS,
  MAX_LABELLED_POINTS,
  PieSliceLabel,
  categoryAxisLayout,
  chartKey,
  formatChartValue,
  formatChartValueFull,
  inferValueFormat,
  truncateLabel,
  valueFormatter,
  type ValueFormat,
} from './chartLabels'
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

/** The value format a series is written in (explicit `format`, else inferred from its label). */
function formatOf(series: ChartSeriesConfig | undefined): ValueFormat {
  return inferValueFormat(series?.label, series?.format)
}

/** Room above the plot so the top-most bar/point label is never clipped. */
const CARTESIAN_MARGIN = { top: 22, right: 12, left: 0, bottom: 0 } as const

function CartesianAxes({
  categories,
  yFormat,
}: {
  categories: Array<string | number>
  yFormat: ValueFormat
}) {
  const layout = categoryAxisLayout(categories)
  return (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis
        dataKey="x"
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        tickFormatter={(v: unknown) => truncateLabel(v)}
        {...layout}
      />
      <YAxis
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        width={yFormat === 'mwk' ? 72 : 48}
        tickFormatter={(v: unknown) => formatChartValue(v, yFormat)}
      />
    </>
  )
}

/** The key. Always rendered — a single-series chart still says what its colour is. */
function Key({ detail }: { detail?: (name: string) => string | undefined }) {
  return <ChartLegend verticalAlign="bottom" content={chartKey(detail)} />
}

function renderChart(props: ChartProps): React.ReactElement {
  const { type, data, series } = props
  const stacked = type === 'stackedBar'
  const categories = data.map((d) => d.x)
  const yFormat = formatOf(series[0])
  // Many bars → smaller value text so neighbours don't collide.
  const barLabelSize = series.length * data.length > 24 ? 8 : BAR_LABEL_PROPS.fontSize
  // A point label per point is only legible on a short series.
  const labelPoints = data.length <= MAX_LABELLED_POINTS

  switch (type) {
    case 'bar':
    case 'stackedBar':
      return (
        <BarChart data={data} accessibilityLayer margin={CARTESIAN_MARGIN}>
          <CartesianAxes categories={categories} yFormat={yFormat} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Key />
          {series.map((s) => {
            const fmt = formatOf(s)
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={colorVar(s.key)}
                radius={stacked ? 0 : [4, 4, 0, 0]}
                stackId={stacked ? 'stack' : undefined}
              >
                {stacked ? (
                  <LabelList
                    dataKey={s.key}
                    position="center"
                    fontSize={10}
                    fill="#fff"
                    formatter={(v: unknown) => (Number(v) === 0 ? '' : formatChartValue(v, fmt))}
                  />
                ) : (
                  <LabelList
                    dataKey={s.key}
                    {...BAR_LABEL_PROPS}
                    fontSize={barLabelSize}
                    formatter={valueFormatter(fmt)}
                  />
                )}
              </Bar>
            )
          })}
        </BarChart>
      )

    case 'line':
    case 'timeSeries':
      return (
        <LineChart data={data} accessibilityLayer margin={CARTESIAN_MARGIN}>
          <CartesianAxes categories={categories} yFormat={yFormat} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Key />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={colorVar(s.key)}
              strokeWidth={2}
              dot={labelPoints}
            >
              {labelPoints ? (
                <LabelList
                  dataKey={s.key}
                  {...BAR_LABEL_PROPS}
                  formatter={valueFormatter(formatOf(s))}
                />
              ) : null}
            </Line>
          ))}
        </LineChart>
      )

    case 'area':
      return (
        <AreaChart data={data} accessibilityLayer margin={CARTESIAN_MARGIN}>
          <CartesianAxes categories={categories} yFormat={yFormat} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Key />
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
              dot={labelPoints}
            >
              {labelPoints ? (
                <LabelList
                  dataKey={s.key}
                  {...BAR_LABEL_PROPS}
                  formatter={valueFormatter(formatOf(s))}
                />
              ) : null}
            </Area>
          ))}
        </AreaChart>
      )

    case 'combo':
      return (
        <ComposedChart data={data} accessibilityLayer margin={CARTESIAN_MARGIN}>
          <CartesianAxes categories={categories} yFormat={yFormat} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Key />
          {series.map((s) => {
            const kind = s.kind ?? 'bar'
            const fmt = formatOf(s)
            const label = (
              <LabelList
                dataKey={s.key}
                {...BAR_LABEL_PROPS}
                fontSize={barLabelSize}
                formatter={valueFormatter(fmt)}
              />
            )
            if (kind === 'line') {
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={colorVar(s.key)}
                  strokeWidth={2}
                  dot={labelPoints}
                >
                  {labelPoints ? label : null}
                </Line>
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
                >
                  {labelPoints ? label : null}
                </Area>
              )
            }
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={colorVar(s.key)}
                radius={[4, 4, 0, 0]}
              >
                {label}
              </Bar>
            )
          })}
        </ComposedChart>
      )

    case 'pie':
    case 'donut': {
      const slices = toPieSlices(props)
      const fmt = formatOf(series[0])
      const total = slices.reduce((sum, sl) => sum + sl.value, 0)
      // Key entry per slice: exact value and share, e.g. "42 · 35%".
      const detail = (name: string): string | undefined => {
        const slice = slices.find((sl) => sl.name === name)
        if (!slice) return undefined
        const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0
        return `${formatChartValueFull(slice.value, fmt)} · ${pct}%`
      }
      return (
        <PieChart accessibilityLayer margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
          <Key detail={detail} />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={type === 'donut' ? '38%' : 0}
            outerRadius="62%"
            paddingAngle={type === 'donut' ? 2 : 0}
            label={PieSliceLabel}
            labelLine
          >
            {slices.map((slice, index) => (
              <Cell key={`${slice.name}-${index}`} fill={chartColorAt(index)} />
            ))}
            {type === 'donut' ? (
              <Label
                position="center"
                content={({ viewBox }) => {
                  if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null
                  const cx = Number(viewBox.cx)
                  const cy = Number(viewBox.cy)
                  return (
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan
                        x={cx}
                        y={cy - 4}
                        fontSize={18}
                        fontWeight={700}
                        className="fill-current text-body"
                      >
                        {formatChartValue(total, fmt)}
                      </tspan>
                      <tspan x={cx} y={cy + 14} fontSize={11} className="fill-current text-muted">
                        Total
                      </tspan>
                    </text>
                  )
                }}
              />
            ) : null}
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
          {/* The gauge's own label: its value, and what it measures. */}
          <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null
                const cx = Number(viewBox.cx)
                const cy = Number(viewBox.cy)
                return (
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan
                      x={cx}
                      y={cy - 4}
                      fontSize={22}
                      fontWeight={700}
                      className="fill-current text-body"
                    >
                      {formatChartValue(value, 'percent')}
                    </tspan>
                    <tspan x={cx} y={cy + 16} fontSize={11} className="fill-current text-muted">
                      {first?.label ?? ''}
                    </tspan>
                  </text>
                )
              }}
            />
          </PolarRadiusAxis>
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
