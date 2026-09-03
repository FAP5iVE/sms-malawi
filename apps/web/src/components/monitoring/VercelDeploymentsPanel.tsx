/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/monitoring/VercelDeploymentsPanel.tsx
 * [PURPOSE]: Recent deployments + build status, polled from Vercel's free
 *   `GET /v6/deployments` (no plan gate, no webhook needed — research
 *   doc §1.6). This is the most reliable free "did the last deploy fail"
 *   signal, so it's shown as a plain state badge, no cleverness needed.
 * [DEPENDS ON]: @/hooks/useVercelMonitoring, @/components/shared/DataTable
 */
'use client'

import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import { useVercelDeployments } from '@/hooks/useVercelMonitoring'
import type { ApiVercelDeployment } from '@shared/types/vercel-monitoring'

const STATE_STYLE: Record<string, string> = {
  READY: 'bg-brand-teal/15 text-brand-teal',
  ERROR: 'bg-brand-coral/15 text-brand-coral',
  BUILDING: 'bg-brand-amber/15 text-brand-amber',
  QUEUED: 'bg-page text-muted',
  INITIALIZING: 'bg-page text-muted',
  CANCELED: 'bg-page text-muted',
  BLOCKED: 'bg-brand-amber/15 text-brand-amber',
}

export function VercelDeploymentsPanel() {
  const { data: deployments, isLoading } = useVercelDeployments(20)

  const columns: DataColumn<ApiVercelDeployment>[] = [
    {
      key: 'state', label: 'Status', priority: 'critical',
      render: (row) => (
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATE_STYLE[row.state] ?? 'bg-page text-muted'}`}>
          {row.state}
        </span>
      ),
    },
    { key: 'target', label: 'Target', priority: 'important', render: (row) => row.target ?? 'preview' },
    {
      key: 'errorMessage', label: 'Detail', priority: 'important',
      render: (row) => row.errorMessage ?? (row.url ? row.url : '—'),
    },
    {
      key: 'createdAtVercel', label: 'Created', priority: 'critical',
      render: (row) => new Date(row.createdAtVercel).toLocaleString(),
    },
  ]

  return (
    <DataTable<ApiVercelDeployment>
      data={deployments ?? []}
      isLoading={isLoading}
      rowKey="id"
      columns={columns}
      emptyMessage="No deployments found yet."
    />
  )
}