'use client'

import { useBudgetVsActual } from '@/hooks/useFinances'
import { formatMWK } from '@shared/constants/malawi'
import dynamic from 'next/dynamic'

// ApexCharts must be dynamically imported — it's not SSR-compatible
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })

export function BudgetTab({ academicYear }: { academicYear: string }) {
  const { data: budget = [], isLoading } = useBudgetVsActual(academicYear)

  const categories = budget.map((b) => b.category)
  const allocated = budget.map((b) => b.allocated)
  const spent = budget.map((b) => b.spent)

  const chartOptions = {
    chart: { type: 'bar' as const, toolbar: { show: false } },
    plotOptions: { bar: { horizontal: false, columnWidth: '55%' } },
    xaxis: { categories },
    yaxis: {
      labels: {
        formatter: (v: number) => `MWK ${(v / 1_000_000).toFixed(1)}M`,
      },
    },
    colors: ['#0F2744', '#0E8A6A'],
    legend: { position: 'top' as const },
    tooltip: {
      y: { formatter: (v: number) => formatMWK(v) },
    },
  }

  const series = [
    { name: 'Allocated', data: allocated },
    { name: 'Spent', data: spent },
  ]

  return (
    <div className="space-y-5">
      {isLoading ? (
        <div className="skeleton h-64 rounded-xl" />
      ) : budget.length === 0 ? (
        <div className="bg-surface border border-base rounded-xl p-12 text-center text-muted text-sm">
          No budget data for {academicYear}
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="bg-surface border border-base rounded-xl p-5">
            <p className="font-heading font-semibold text-sm text-brand-navy mb-4">
              Budget vs Actual Spending
            </p>
            <Chart type="bar" options={chartOptions} series={series} height={300} />
          </div>

          {/* Table */}
          <div className="bg-surface border border-base rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base bg-page">
                  <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                    Category
                  </th>
                  <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                    Allocated
                  </th>
                  <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                    Spent
                  </th>
                  <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                    Remaining
                  </th>
                  <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {budget.map((b) => {
                  const pct = b.allocated > 0 ? Math.round((b.spent / b.allocated) * 100) : 0
                  return (
                    <tr key={b.category} className="border-b border-base hover:bg-page">
                      <td className="px-4 py-3 font-medium">{b.category}</td>
                      <td className="px-4 py-3 text-right tabular">{formatMWK(b.allocated)}</td>
                      <td className="px-4 py-3 text-right tabular">{formatMWK(b.spent)}</td>
                      <td
                        className={`px-4 py-3 text-right tabular font-semibold ${b.remaining < 0 ? 'text-brand-coral' : 'text-emerald-600'}`}
                      >
                        {formatMWK(b.remaining)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct > 100 ? 'bg-brand-coral' : 'bg-brand-teal'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted tabular">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
