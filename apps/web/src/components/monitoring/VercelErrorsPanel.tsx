/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/monitoring/VercelErrorsPanel.tsx
 * [PURPOSE]: Runtime error/warning log rows pulled from Vercel's Runtime
 *   Logs API and cached in our own DB (research doc §1.4, §1.12 — Vercel
 *   only keeps these for 1 hour on Hobby, so this table is the long-term
 *   store). Mirrors LogsPanel.tsx's level-filter + DataTable pattern.
 * [DEPENDS ON]: @/hooks/useVercelMonitoring, @/components/shared/DataTable
 */
'use client'

import { useState } from 'react'
import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import { useVercelErrors } from '@/hooks/useVercelMonitoring'
import type { ApiVercelErrorLog } from '@shared/types/vercel-monitoring'

const LEVELS = ['warning', 'error', 'fatal'] as const

const LEVEL_BORDER: Record<string, string> = {
  warning: 'border-l-brand-amber', error: 'border-l-brand-coral', fatal: 'border-l-brand-coral',
}

export function VercelErrorsPanel() {
  const [level, setLevel] = useState<string | undefined>(undefined)
  const { data: logs, isLoading } = useVercelErrors(level)

  const columns: DataColumn<ApiVercelErrorLog>[] = [
    {
      key: 'level', label: 'Level', priority: 'critical',
      render: (row) => (
        <span className={`border-l-2 pl-2 font-semibold uppercase text-xs ${LEVEL_BORDER[row.level] ?? ''}`}>
          {row.level}
        </span>
      ),
    },
    { key: 'message', label: 'Message', priority: 'critical' },
    { key: 'requestPath', label: 'Route', priority: 'optional', render: (row) => row.requestPath ?? '—' },
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

      <DataTable<ApiVercelErrorLog>
        data={logs ?? []}
        isLoading={isLoading}
        rowKey="id"
        columns={columns}
        emptyMessage="No runtime errors in the captured window. Note: Vercel's free tier only retains 1 hour of runtime logs, so gaps longer than that between syncs may miss data — see docs/vercel-native-monitoring-research.md §1.12."
      />
    </div>
  )
}