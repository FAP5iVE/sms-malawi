/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/monitoring/AlertsPanel.tsx
 * [PURPOSE]: Alerts table (current beta Monitors/Alerts model) with an
 *   inline enable/disable toggle, gated on monitoring.manage separately
 *   from monitoring.view.
 * [DEPENDS ON]: @/hooks/useMonitoring, @/components/shared/DataTable
 */
'use client'

import { DataTable } from '@/components/shared/DataTable'
import type { DataColumn } from '@/components/shared/DataTable'
import { useMonitoringAlerts, useToggleAlert } from '@/hooks/useMonitoring'
import type { ApiMonitoringAlert } from '@shared/types/monitoring'

interface Props { canManage: boolean }

export function AlertsPanel({ canManage }: Props) {
  const { data: alerts, isLoading } = useMonitoringAlerts()
  const toggle = useToggleAlert()

  const columns: DataColumn<ApiMonitoringAlert>[] = [
    { key: 'name', label: 'Alert', priority: 'critical' },
    {
      key: 'enabled', label: 'Status', priority: 'critical',
      render: (row) => (
        <button
          type="button"
          disabled={!canManage || toggle.isPending}
          onClick={() => toggle.mutate({ id: row.sentryAlertId, enabled: !row.enabled })}
          aria-pressed={row.enabled}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors disabled:opacity-50 ${
            row.enabled ? 'bg-brand-teal/15 text-brand-teal' : 'bg-page text-muted'
          }`}
        >
          {row.enabled ? 'Enabled' : 'Disabled'}
        </button>
      ),
    },
    {
      key: 'lastTriggeredAt', label: 'Last Triggered', priority: 'important',
      render: (row) => row.lastTriggeredAt ? new Date(row.lastTriggeredAt).toLocaleString() : 'Never',
    },
  ]

  return (
    <div className="space-y-4">
      {!canManage && (
        <p className="text-xs text-muted">You can view alerts here; enabling/disabling requires monitoring.manage.</p>
      )}
      <DataTable<ApiMonitoringAlert>
        data={alerts ?? []}
        isLoading={isLoading}
        rowKey="id"
        columns={columns}
        emptyMessage="No alerts configured yet."
      />
    </div>
  )
}