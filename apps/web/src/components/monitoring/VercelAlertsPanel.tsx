/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/monitoring/VercelAlertsPanel.tsx
 * [PURPOSE]: DIY alerts (deployment_failed, error_spike) — Vercel's own
 *   Alerts feature requires Observability Plus (Pro), so these are
 *   computed by our own sync logic instead of something Vercel hands us
 *   (research doc §1.2, §3 Phase 5). Mirrors AlertsPanel.tsx's
 *   manage-gated-action pattern (toggle → acknowledge).
 * [DEPENDS ON]: @/hooks/useVercelMonitoring, @/components/shared/DataTable
 */
'use client'

import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import { useVercelAlerts, useAcknowledgeVercelAlert } from '@/hooks/useVercelMonitoring'
import type { ApiVercelAlert } from '@shared/types/vercel-monitoring'

interface Props { canManage: boolean }

const KIND_LABEL: Record<string, string> = {
  deployment_failed: 'Deployment Failed',
  error_spike: 'Error Spike',
}

export function VercelAlertsPanel({ canManage }: Props) {
  const { data: alerts, isLoading } = useVercelAlerts()
  const acknowledge = useAcknowledgeVercelAlert()

  const columns: DataColumn<ApiVercelAlert>[] = [
    {
      key: 'severity', label: 'Severity', priority: 'critical',
      render: (row) => (
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
          row.severity === 'critical' ? 'bg-brand-coral/15 text-brand-coral' : 'bg-brand-amber/15 text-brand-amber'
        }`}>
          {row.severity}
        </span>
      ),
    },
    { key: 'kind', label: 'Type', priority: 'critical', render: (row) => KIND_LABEL[row.kind] ?? row.kind },
    { key: 'message', label: 'Message', priority: 'important' },
    { key: 'occurredAt', label: 'When', priority: 'important', render: (row) => new Date(row.occurredAt).toLocaleString() },
    {
      key: 'acknowledged', label: 'Status', priority: 'critical',
      render: (row) => (
        <button
          type="button"
          disabled={!canManage || row.acknowledged || acknowledge.isPending}
          onClick={() => acknowledge.mutate(row.id)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
            row.acknowledged ? 'bg-page text-muted' : 'bg-brand-teal/15 text-brand-teal'
          }`}
        >
          {row.acknowledged ? 'Acknowledged' : 'Acknowledge'}
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {!canManage && (
        <p className="text-xs text-muted">You can view alerts here; acknowledging requires monitoring.manage.</p>
      )}
      <DataTable<ApiVercelAlert>
        data={alerts ?? []}
        isLoading={isLoading}
        rowKey="id"
        columns={columns}
        emptyMessage="No platform alerts. These are computed from deployment status and error-log volume — see the panel description in docs/vercel-native-monitoring-research.md §3 Phase 5."
      />
    </div>
  )
}