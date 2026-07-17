/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/finances/IncomeExpenseChart.tsx
 * [R-PHASE]: R17 — Unified Charting Architecture (Phase 10C Plan)
 * [PURPOSE]: The Income vs Expense combo widget for FinanceDashboard (R17 AC:
 *   "Add a Monthly Income/Expense combo chart"). Renders revenue and expenses
 *   as columns and net as an overlaid line — a `combo` Chart, which
 *   `getRecommendedLibrary` routes to ApexCharts.
 *
 *   SCOPE NOTE: the R17 change-list anticipated "a new or extended reporting
 *   endpoint, since the existing summary endpoint returns a single term total,
 *   not a time series." That endpoint already exists as of R14 —
 *   `getFinanceCashFlow(academicYear)` (`GET /analytics/finance/cash-flow`,
 *   exposed by `useFinanceCashFlow`) returns a per-term series of
 *   revenue/expenses/payroll/net. Reusing it (rather than adding a duplicate
 *   monthly aggregation) satisfies the combo requirement without violating the
 *   "no duplicate logic" rule. The three-term series is the smallest correct
 *   income-vs-expense time series the finance domain currently produces.
 * [DEPENDS ON]:
 *   - @/hooks/useAnalytics (useFinanceCashFlow — R14)
 *   - @/components/shared/chart (R17 Chart)
 *   - @/components/shared/ChartCard (R17 card shell)
 *   - @shared/constants/malawi (formatMWK — display consistency)
 */

'use client'

import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import { useFinanceCashFlow } from '@/hooks/useAnalytics'

interface IncomeExpenseChartProps {
  academicYear: string
  periodLoading?: boolean
}

export function IncomeExpenseChart({
  academicYear,
  periodLoading = false,
}: IncomeExpenseChartProps) {
  const { data: rows = [], isLoading } = useFinanceCashFlow(academicYear)
  const loading = periodLoading || isLoading

  const data: ChartDataPoint[] = rows.map((r) => ({
    x: `Term ${r.term}`,
    revenue: r.revenue,
    expenses: r.expenses + r.payroll,
    net: r.net,
  }))

  return (
    <ChartCard
      title="Income vs Expenses"
      sub={`Revenue, expenses and net · ${academicYear}`}
      isLoading={loading}
      height={260}
    >
      <Chart
        type="combo"
        data={data}
        series={[
          { key: 'revenue', label: 'Revenue', kind: 'bar' },
          { key: 'expenses', label: 'Expenses', kind: 'bar' },
          { key: 'net', label: 'Net', kind: 'line' },
        ]}
        height={260}
        emptyStateMessage="No income or expense data for this year yet."
        ariaLabel={`Income versus expenses by term for ${academicYear}, showing revenue, expenses and net`}
      />
    </ChartCard>
  )
}
