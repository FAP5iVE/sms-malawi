/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/monitoring/MonitoringKpiStrip.tsx
 * [PURPOSE]: The 6-tile KPI strip + 3 radial gauges (Crash-Free Sessions,
 *   Crash-Free Users, Apdex) for the /monitoring dashboard.
 * [DEPENDS ON]: @/components/shared/{ChartCard,chart}, @shared/types/monitoring
 */
'use client'

import { ChartCard } from '@/components/shared/ChartCard'
import { Chart } from '@/components/shared/chart'
import type { ApiMonitoringSummary } from '@shared/types/monitoring'

interface Props { summary?: ApiMonitoringSummary; isLoading: boolean }

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const toneClass = tone === 'bad' ? 'text-tone-coral' : tone === 'warn' ? 'text-tone-amber' : 'text-brand-navy'
  return (
    <div className="app-tint rounded-xl p-4 text-center">
      <p className={`text-2xl font-heading font-bold ${toneClass}`}>{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  )
}

export function MonitoringKpiStrip({ summary, isLoading }: Props) {
  const s = summary?.stats ?? {}
  const crashFreeSessions = s['crash_free_sessions:7d']
  const crashFreeUsers    = s['crash_free_users:7d']
  const apdex             = s['apdex:24h']
  const releases          = s['releases_count:30d']

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="Unresolved issues" value={String(summary?.unresolvedIssues ?? '-')} tone={summary?.unresolvedIssues ? 'warn' : 'ok'} />
        <StatTile label="Active outages"    value={String(summary?.activeOutages ?? '-')}    tone={summary?.activeOutages ? 'bad' : 'ok'} />
        <StatTile label="Crash-free sessions" value={crashFreeSessions != null ? `${crashFreeSessions.toFixed(1)}%` : '-'} />
        <StatTile label="Crash-free users"    value={crashFreeUsers    != null ? `${crashFreeUsers.toFixed(1)}%`    : '-'} />
        <StatTile label="Apdex (24h)"         value={apdex != null ? apdex.toFixed(2) : '-'} />
        <StatTile label="Releases (30d)"      value={String(releases ?? '-')} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ChartCard title="Crash-free sessions" isLoading={isLoading} height={160}>
          <Chart
            type="radial"
            data={crashFreeSessions != null ? [{ x: '7d', value: crashFreeSessions }] : []}
            series={[{ key: 'value', label: 'Crash-free %' }]}
            ariaLabel="Crash-free sessions percentage, last 7 days"
            emptyStateMessage="No session data yet."
          />
        </ChartCard>
        <ChartCard title="Crash-free users" isLoading={isLoading} height={160}>
          <Chart
            type="radial"
            data={crashFreeUsers != null ? [{ x: '7d', value: crashFreeUsers }] : []}
            series={[{ key: 'value', label: 'Crash-free %' }]}
            ariaLabel="Crash-free users percentage, last 7 days"
            emptyStateMessage="No user session data yet."
          />
        </ChartCard>
        <ChartCard title="Apdex" isLoading={isLoading} height={160}>
          <Chart
            type="radial"
            data={apdex != null ? [{ x: '24h', value: apdex * 100 }] : []}
            series={[{ key: 'value', label: 'Apdex score' }]}
            ariaLabel="Apdex performance score, last 24 hours"
            emptyStateMessage="No performance data yet."
          />
        </ChartCard>
      </div>
    </div>
  )
}