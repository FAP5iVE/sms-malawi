/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/monitoring/ReleasesPanel.tsx
 * [PURPOSE]: Releases panel — the KPI numeral already sits in the strip;
 *   this adds a per-week cadence bar chart ("are we shipping regularly").
 * [DEPENDS ON]: @/hooks/useMonitoring, @/components/shared/{ChartCard,chart}
 */
'use client'

import { ChartCard } from '@/components/shared/ChartCard'
import { Chart } from '@/components/shared/chart'
import { useMonitoringReleases } from '@/hooks/useMonitoring'
import type { ApiMonitoringSummary } from '@shared/types/monitoring'

interface Props { summary?: ApiMonitoringSummary }

function startOfWeek(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return monday.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export function ReleasesPanel({ summary }: Props) {
  const { data: releases, isLoading } = useMonitoringReleases()

  const byWeek = new Map<string, number>()
  for (const r of releases ?? []) {
    const week = startOfWeek(r.dateCreated)
    byWeek.set(week, (byWeek.get(week) ?? 0) + 1)
  }
  const chartData = Array.from(byWeek.entries()).map(([week, count]) => ({ x: week, count }))

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-base rounded-xl p-4 text-center max-w-xs">
        <p className="text-2xl font-heading font-bold text-brand-navy">
          {summary?.stats['releases_count:30d'] ?? '\u2014'}
        </p>
        <p className="text-xs text-muted mt-1">Releases in the last 30 days</p>
      </div>

      <ChartCard title="Release cadence" sub="Releases per week" isLoading={isLoading} height={220}>
        <Chart
          type="bar"
          data={chartData}
          series={[{ key: 'count', label: 'Releases' }]}
          ariaLabel="Number of releases per week over the last 30 days"
          emptyStateMessage="No releases in this window."
        />
      </ChartCard>
    </div>
  )
}