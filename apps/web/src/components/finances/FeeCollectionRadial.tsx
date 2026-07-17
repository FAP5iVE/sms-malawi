/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/finances/FeeCollectionRadial.tsx
 * [R-PHASE]: R17 — Unified Charting Architecture (Phase 10C Plan)
 * [PURPOSE]: The single Fee-Collection-% radial gauge widget. Both
 *   FinanceDashboard and HighRankDashboard render THIS component for their
 *   fee-collection widget rather than each building a bespoke one (R17 AC:
 *   "The Finance and HighRank dashboards' fee-collection widgets both render
 *   from the same shared component"). It owns its own data fetch
 *   (`useFinanceSummary`), so a caller supplies only the academic period.
 *
 *   Renders a `radial` Chart — which `getRecommendedLibrary` routes to
 *   ApexCharts, matching FinanceDashboard's own long-standing placeholder note
 *   ("ApexCharts radial bar — wired in Phase 4/R17"). The single gauge value is
 *   `ApiFinanceSummary.collectionPercent` (already 0–100). The required
 *   `ariaLabel` gives screen-reader users the figure in words.
 * [DEPENDS ON]:
 *   - @/hooks/useFinances (useFinanceSummary — R15 enabled-gated)
 *   - @/components/shared/chart (R17 Chart)
 *   - @/components/shared/ChartCard (R17 card shell)
 */

'use client'

import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import { useFinanceSummary } from '@/hooks/useFinances'

interface FeeCollectionRadialProps {
  academicYear: string
  term: number
  /** True while the caller is still resolving the academic period. */
  periodLoading?: boolean
}

export function FeeCollectionRadial({
  academicYear,
  term,
  periodLoading = false,
}: FeeCollectionRadialProps) {
  const { data: summary, isLoading } = useFinanceSummary(academicYear, term)
  const loading = periodLoading || isLoading

  const percent = summary?.collectionPercent ?? 0
  const data: ChartDataPoint[] = summary ? [{ x: 'Collection', collection: percent }] : []

  return (
    <ChartCard
      title="Fee Collection vs Target"
      sub={term ? `Term ${term} · ${academicYear}` : academicYear}
      isLoading={loading}
      height={220}
    >
      <Chart
        type="radial"
        data={data}
        series={[{ key: 'collection', label: 'Collection %' }]}
        height={220}
        emptyStateMessage="No collection data for this term yet."
        ariaLabel={
          summary
            ? `Fee collection is ${Math.round(percent)} percent of target for term ${term}, ${academicYear}`
            : 'Fee collection chart — no data available'
        }
      />
    </ChartCard>
  )
}
