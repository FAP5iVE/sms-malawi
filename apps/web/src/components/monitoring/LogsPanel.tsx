/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/monitoring/LogsPanel.tsx
 * [PURPOSE]: Structured logs panel (info/warn/error/fatal), bridged from
 *   the app's own Pino logger via Sentry's pinoIntegration. Logs have no
 *   webhook path (research-confirmed) so this proxies Sentry live.
 * [DEPENDS ON]: @/hooks/useMonitoring, @/components/shared/DataTable
 */
'use client'

import { useState } from 'react'
import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import { useMonitoringLogs } from '@/hooks/useMonitoring'
import type { ApiMonitoringLog } from '@shared/types/monitoring'

const LEVELS = ['info', 'warn', 'error', 'fatal'] as const

const LEVEL_BORDER: Record<string, string> = {
  info: 'border-l-muted', warn: 'border-l-brand-amber',
  error: 'border-l-brand-coral', fatal: 'border-l-brand-coral',
}

export function LogsPanel() {
  const [level, setLevel] = useState<string | undefined>(undefined)
  const { data, isLoading } = useMonitoringLogs(level)
  const logs = data?.data ?? []

  const columns: DataColumn<ApiMonitoringLog>[] = [
    {
      key: 'level', label: 'Level', priority: 'critical',
      render: (row) => (
        <span className={`border-l-2 pl-2 font-semibold uppercase text-xs ${LEVEL_BORDER[row.level] ?? ''}`}>
          {row.level}
        </span>
      ),
    },
    { key: 'message', label: 'Message', priority: 'critical' },
    { key: 'timestamp', label: 'Time', priority: 'important', render: (row) => new Date(row.timestamp).toLocaleString() },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setLevel(undefined)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold ${!level ? 'bg-brand-navy text-white' : 'bg-page text-muted'}`}>
          All
        </button>
        {LEVELS.map((l) => (
          <button key={l} type="button" onClick={() => setLevel(l)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${level === l ? 'bg-brand-navy text-white' : 'bg-page text-muted'}`}>
            {l}
          </button>
        ))}
      </div>

      <DataTable<ApiMonitoringLog>
        data={logs}
        isLoading={isLoading}
        rowKey="id"
        columns={columns}
        emptyMessage="No log entries for this filter in the last 24 hours."
      />
    </div>
  )
}