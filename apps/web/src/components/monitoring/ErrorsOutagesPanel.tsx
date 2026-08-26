/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/monitoring/ErrorsOutagesPanel.tsx
 * [PURPOSE]: The primary monitoring panel — event-volume sparkline + a
 *   sortable Issues table, filterable to Outages only (isUptimeIssue).
 * [DEPENDS ON]: @/hooks/useMonitoring, @/components/shared/{DataTable,ChartCard,chart}
 */
'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import { ChartCard } from '@/components/shared/ChartCard'
import { Chart } from '@/components/shared/chart'
import { useMonitoringIssues } from '@/hooks/useMonitoring'
import type { ApiMonitoringIssue } from '@shared/types/monitoring'

const LEVEL_TONE: Record<string, string> = {
  fatal: 'text-brand-coral', error: 'text-brand-coral',
  warning: 'text-brand-amber', info: 'text-muted', debug: 'text-muted',
}

export function ErrorsOutagesPanel() {
  const [showOutagesOnly, setShowOutagesOnly] = useState(false)
  const { data: issues, isLoading } = useMonitoringIssues({ status: 'unresolved', uptimeOnly: showOutagesOnly || undefined })

  const sparkline = (issues ?? []).slice(0, 20).map((i) => ({ x: i.title.slice(0, 12), count: i.eventCount }))

  const columns: DataColumn<ApiMonitoringIssue>[] = [
    { key: 'level', label: 'Level', priority: 'critical', render: (row) => <span className={`font-semibold ${LEVEL_TONE[row.level] ?? ''}`}>{row.level}</span> },
    { key: 'title', label: 'Issue', priority: 'critical', render: (row) => <span className="truncate">{row.title}{row.isUptimeIssue && ' \u00b7 Outage'}</span> },
    { key: 'eventCount', label: 'Events', priority: 'important', sortable: true },
    { key: 'userCount', label: 'Users', priority: 'important', sortable: true },
    { key: 'lastSeenAt', label: 'Last Seen', priority: 'optional', render: (row) => row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : '\u2014' },
    {
      key: 'permalink', label: '', priority: 'critical', render: (row) => row.permalink ? (
        <a href={row.permalink} target="_blank" rel="noopener noreferrer" className="text-brand-teal">
          <ExternalLink className="w-4 h-4" />
        </a>
      ) : null,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setShowOutagesOnly(false)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${!showOutagesOnly ? 'bg-brand-navy text-white' : 'bg-page text-muted'}`}>
          All ({issues?.length ?? 0})
        </button>
        <button type="button" onClick={() => setShowOutagesOnly(true)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${showOutagesOnly ? 'bg-brand-coral text-white' : 'bg-page text-muted'}`}>
          Outages only
        </button>
      </div>

      <ChartCard title="Event volume" isLoading={isLoading} height={140}>
        <Chart type="timeSeries" data={sparkline} series={[{ key: 'count', label: 'Events' }]}
          ariaLabel="Issue event volume for the current unresolved list" emptyStateMessage="No unresolved issues." />
      </ChartCard>

      <DataTable<ApiMonitoringIssue>
        data={issues ?? []}
        isLoading={isLoading}
        rowKey="id"
        columns={columns}
        emptyMessage="No unresolved issues \u2014 the system is quiet."
      />
    </div>
  )
}