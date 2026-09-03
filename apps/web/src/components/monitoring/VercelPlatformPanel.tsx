/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/monitoring/VercelPlatformPanel.tsx
 * [PURPOSE]: The "Vercel Platform" tab of /monitoring — a small KPI strip
 *   (latest deploy state, unacknowledged alerts, 24h errors, 24h traffic)
 *   plus an inner Deployments / Errors / Alerts tab set. Kept as its own
 *   clearly-separated section rather than mixed into the Sentry panels,
 *   since it's backed by an entirely different service
 *   (vercelMonitoringService, not Sentry) — see
 *   docs/vercel-native-monitoring-research.md §3 Phase 6.
 * [DEPENDS ON]: @/hooks/useVercelMonitoring, @/hooks/usePermissions,
 *   @/components/shared/ModuleTabs, ./Vercel{Deployments,Errors,Alerts}Panel
 */
'use client'

import { useState } from 'react'
import { Rocket, AlertTriangle, Bell } from 'lucide-react'
import { ModuleTabs } from '@/components/shared/ModuleTabs'
import type { TabItem } from '@/components/shared/ModuleTabs'
import { usePermissions } from '@/hooks/usePermissions'
import { useVercelSummary } from '@/hooks/useVercelMonitoring'
import { VercelDeploymentsPanel } from './VercelDeploymentsPanel'
import { VercelErrorsPanel } from './VercelErrorsPanel'
import { VercelAlertsPanel } from './VercelAlertsPanel'

type InnerTab = 'deployments' | 'errors' | 'alerts'

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const toneClass = tone === 'bad' ? 'text-brand-coral' : tone === 'warn' ? 'text-brand-amber' : 'text-brand-navy'
  return (
    <div className="bg-surface border border-base rounded-xl p-4 text-center">
      <p className={`text-2xl font-heading font-bold ${toneClass}`}>{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  )
}

export function VercelPlatformPanel() {
  const { can } = usePermissions()
  const [tab, setTab] = useState<InnerTab>('deployments')
  const { data: summary, isLoading: summaryLoading } = useVercelSummary()

  // Derived once, with plain `&&` (not `?.`) narrowing on the discriminated
  // union — safer than inlining `summary?.configured` checks repeatedly
  // below, and keeps the JSX free of union-type juggling.
  const isConfigured = Boolean(summary && summary.configured)
  const latestDeploymentState = summary && summary.configured ? summary.latestDeploymentState : null
  const unacknowledgedAlerts = summary && summary.configured ? summary.unacknowledgedAlerts : 0
  const errorCount24h = summary && summary.configured ? summary.errorCount24h : 0
  const pageviews24h = summary && summary.configured ? summary.stats['pageviews:24h'] : undefined

  const tabs: TabItem<InnerTab>[] = [
    { id: 'deployments', label: 'Deployments', icon: Rocket },
    { id: 'errors',      label: 'Errors',      icon: AlertTriangle },
    { id: 'alerts',      label: 'Alerts',      icon: Bell, badge: isConfigured ? unacknowledgedAlerts : undefined },
  ]

  if (summary && !summary.configured) {
    return (
      <div className="bg-surface border border-base rounded-xl p-6 text-center space-y-2">
        <p className="font-semibold text-brand-navy">Vercel monitoring is not set up yet</p>
        <p className="text-sm text-muted">
          Set <code className="text-xs">VERCEL_API_TOKEN</code> and <code className="text-xs">VERCEL_PROJECT_ID</code> in
          the environment to enable this tab — see docs/vercel-native-monitoring-research.md §3 Phase 1.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="Latest Deploy"
          value={isConfigured ? (latestDeploymentState ?? '\u2014') : '\u2014'}
          tone={isConfigured && latestDeploymentState === 'ERROR' ? 'bad' : 'ok'}
        />
        <StatTile
          label="Unacknowledged Alerts"
          value={isConfigured ? String(unacknowledgedAlerts) : '\u2014'}
          tone={isConfigured && unacknowledgedAlerts > 0 ? 'warn' : 'ok'}
        />
        <StatTile
          label="Errors (24h)"
          value={isConfigured ? String(errorCount24h) : '\u2014'}
          tone={isConfigured && errorCount24h > 0 ? 'warn' : 'ok'}
        />
        <StatTile
          label="Pageviews (24h)"
          value={isConfigured ? String(pageviews24h ?? '\u2014') : '\u2014'}
        />
      </div>

      <ModuleTabs<InnerTab>
        id="monitoring-vercel"
        tabs={tabs}
        active={tab}
        onChange={setTab}
        variant="underline"
      />

      {tab === 'deployments' && <VercelDeploymentsPanel />}
      {tab === 'errors'      && <VercelErrorsPanel />}
      {tab === 'alerts'      && <VercelAlertsPanel canManage={can('monitoring.manage')} />}

      {summaryLoading && <p className="text-xs text-muted">Refreshing…</p>}
    </div>
  )
}