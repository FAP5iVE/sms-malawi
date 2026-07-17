/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/chart/types.ts
 * [R-PHASE]: R17 — Unified Charting Architecture (Phase 10C Plan)
 * [PURPOSE]: The single shared contract both chart renderers implement. Every
 *   chart in the codebase — Recharts-backed or ApexCharts-backed — is described
 *   by one `ChartProps` object, so a caller never has to know which library
 *   actually renders it. Key deliberate decisions carried from the R17 plan:
 *     - `ariaLabel` is REQUIRED (not optional): it closes the missing
 *       screen-reader text-alternative CROSS_a11y.md flagged for every existing
 *       chart instance in the codebase (AnalyticsPanel, ForecastPanel, all ~20
 *       reports/page.tsx panels). A chart cannot be constructed without one.
 *     - `ChartSeriesConfig.color` is optional; when omitted a renderer draws the
 *       series colour from the R16 design-token palette (`chartColorAt(index)`
 *       in `@/lib/chartPalette`) by series index, so both libraries stay
 *       visually identical and no raw hex literal is ever needed at a call site.
 *     - `emptyStateMessage` replaces the "—" placeholder pattern R15 already
 *       fixed for dashboard stat cards — a chart with no data renders this
 *       message rather than an empty axis frame.
 * [SCOPE NOTE]: `ChartSeriesConfig.kind` is an additive field beyond the R17
 *   plan's base `{ key, label, color? }` shape. It is strictly necessary for the
 *   `combo` chart type the phase itself requires (Finance monthly income/expense
 *   combo, AC "Add a Monthly Income/Expense combo chart"): a combo chart must
 *   know which series render as bars and which as a line. It is optional and
 *   defaults to the chart's primary geometry, so it is inert for every
 *   non-combo chart.
 * [DEPENDS ON]: none (pure type module)
 */

/** The two real charting libraries in the stack (`recharts` + `apexcharts`). */
export type ChartLibrary = 'recharts' | 'apexcharts'

/**
 * Every chart shape the module can render. The library that services each type
 * by default is decided by `getRecommendedLibrary` (see `./index.tsx`):
 *   - `bar` / `stackedBar` / `line` / `area` / `pie` / `donut` → Recharts
 *   - `radial` / `combo` / `timeSeries` → ApexCharts
 * A caller may override the default with an explicit `ChartProps.library`.
 */
export type ChartType =
  | 'bar'
  | 'stackedBar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'radial'
  | 'combo'
  | 'timeSeries'

/**
 * One row of chart data. `x` is the categorical/temporal axis value (a month
 * label, a date, a subject name, a class name); every other key is a numeric
 * series value keyed by its `ChartSeriesConfig.key`.
 */
export interface ChartDataPoint {
  x: string | number
  [seriesKey: string]: string | number
}

/**
 * One plotted series. `key` selects the value from each `ChartDataPoint`;
 * `label` is the human-readable name shown in legend/tooltip; `color` is
 * optional (falls back to the R16 palette by index); `kind` is only consulted
 * for `combo` charts (see [SCOPE NOTE] above).
 */
export interface ChartSeriesConfig {
  key: string
  label: string
  color?: string
  kind?: 'bar' | 'line' | 'area'
}

/**
 * The complete, library-agnostic description of a chart. This is the only type
 * a feature/component needs to import to render a chart.
 */
export interface ChartProps {
  type: ChartType
  data: ChartDataPoint[]
  series: ChartSeriesConfig[]
  /** Force a specific library; omit to let `getRecommendedLibrary` decide. */
  library?: ChartLibrary
  /** Pixel height of the plot area. Defaults to 300 in each renderer. */
  height?: number
  title?: string
  subtitle?: string
  /** ApexCharts pan/zoom (also nudges the recommended library to ApexCharts). */
  zoomable?: boolean
  /** ApexCharts PNG/CSV/print toolbar (also nudges the library to ApexCharts). */
  exportable?: boolean
  /** Rendered in place of the plot when `data` is empty. */
  emptyStateMessage?: string
  /** REQUIRED screen-reader text alternative — never optional. */
  ariaLabel: string
}
