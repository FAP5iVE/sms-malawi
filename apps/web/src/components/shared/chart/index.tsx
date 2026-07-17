/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/chart/index.tsx
 * [R-PHASE]: R17 — Unified Charting Architecture (Phase 10C Plan)
 * [PURPOSE]: The module's public API — the file `Chart.tsx`'s name always
 *   promised but never delivered (that file was 0 bytes and is deleted in this
 *   phase). A feature renders any chart by importing `Chart` from
 *   `@/components/shared/chart` and passing one `ChartProps` object; it never
 *   touches Recharts or ApexCharts directly.
 *
 *   `getRecommendedLibrary` formalises — rather than overturns — the split the
 *   codebase already organically settled on: zoomable/exportable interactions
 *   and the `radial`/`combo`/`timeSeries` shapes go to ApexCharts; everything
 *   else (small fixed `bar`/`stackedBar`/`line`/`area`/`pie`/`donut`) goes to
 *   Recharts. A caller can override with an explicit `ChartProps.library`.
 *
 *   Both renderers are loaded via `next/dynamic` (ssr:false): `RechartsRenderer`
 *   statically imports Recharts and `ApexChartRenderer` pulls in ApexCharts, so
 *   dynamic-importing them here keeps BOTH charting libraries out of the initial
 *   bundle of any page that imports `Chart` — the code-splitting discipline
 *   sms-erp-frontend Rule 10 requires for every chart library.
 * [DEPENDS ON]:
 *   - ./RechartsRenderer, ./ApexChartRenderer (R17 renderers)
 *   - ./types (R17 ChartProps contract)
 */

'use client'

import dynamic from 'next/dynamic'

import type { ChartLibrary, ChartProps, ChartType } from './types'

/** Shared loading fallback for either renderer's async chunk. */
function ChartLoadingSkeleton(): React.ReactElement {
  return <div className="h-64 w-full rounded-xl bg-page animate-pulse" aria-hidden="true" />
}

const RechartsRenderer = dynamic(
  () => import('./RechartsRenderer').then((m) => m.RechartsRenderer),
  { ssr: false, loading: () => <ChartLoadingSkeleton /> },
)

const ApexChartRenderer = dynamic(
  () => import('./ApexChartRenderer').then((m) => m.ApexChartRenderer),
  { ssr: false, loading: () => <ChartLoadingSkeleton /> },
)

/**
 * Decide which library services a chart when the caller does not force one.
 * Mirrors the R17 decision rule exactly.
 */
export function getRecommendedLibrary(
  type: ChartType,
  opts?: { zoomable?: boolean; exportable?: boolean },
): ChartLibrary {
  if (Boolean(opts?.zoomable) || Boolean(opts?.exportable)) return 'apexcharts'
  if (type === 'radial' || type === 'combo' || type === 'timeSeries') return 'apexcharts'
  return 'recharts'
}

/**
 * The single chart entry point. Resolves the library (explicit override or the
 * recommendation) and delegates to the matching renderer.
 */
export function Chart(props: ChartProps): React.ReactElement {
  const library = props.library ?? getRecommendedLibrary(props.type, props)
  return library === 'apexcharts' ? <ApexChartRenderer {...props} /> : <RechartsRenderer {...props} />
}

export type {
  ChartDataPoint,
  ChartLibrary,
  ChartProps,
  ChartSeriesConfig,
  ChartType,
} from './types'
