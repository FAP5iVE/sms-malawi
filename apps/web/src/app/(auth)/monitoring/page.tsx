/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/app/(auth)/monitoring/page.tsx
 * [PURPOSE]: The admin monitoring dashboard — Sentry KPI strip + 7
 *   ModuleTabs panels (Errors & Outages, Logs, Alerts, Replays, Releases,
 *   Feedback, Vercel Platform). The 7th tab (Vercel Platform, added
 *   2026-09-02) is backed by a completely separate service
 *   (vercelMonitoringService, not Sentry) — see
 *   docs/vercel-native-monitoring-research.md for why it's a distinct
 *   section rather than folded into the panels above. Route-level access
 *   is already enforced twice before this component renders (proxy.ts
 *   edge check + NAV_ITEMS visibility, both from PAGE_ACCESS['/monitoring'])
 *   — RoleGuard here is defense-in-depth, matching the real pattern used
 *   by exams/page.tsx.
 * [DEPENDS ON]: @/hooks/{useMonitoring,useVercelMonitoring}, @/hooks/usePermissions,
 *   @/components/shared/{RoleGuard,ModuleTabs}, @/components/monitoring/*
 */
'use client'

import { useState } from 'react'
import { Activity, AlertTriangle, ScrollText, Bell, Video, GitBranch, MessageSquareWarning, Cloud } from 'lucide-react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { ModuleTabs } from '@/components/shared/ModuleTabs'
import type { TabItem } from '@/components/shared/ModuleTabs'
import { usePermissions } from '@/hooks/usePermissions'
import { useMonitoringSummary } from '@/hooks/useMonitoring'
import { MonitoringKpiStrip } from '@/components/monitoring/MonitoringKpiStrip'
import { ErrorsOutagesPanel } from '@/components/monitoring/ErrorsOutagesPanel'
import { LogsPanel } from '@/components/monitoring/LogsPanel'
import { AlertsPanel } from '@/components/monitoring/AlertsPanel'
import { ReplaysPanel } from '@/components/monitoring/ReplaysPanel'
import { ReleasesPanel } from '@/components/monitoring/ReleasesPanel'
import { FeedbackPanel } from '@/components/monitoring/FeedbackPanel'
import { VercelPlatformPanel } from '@/components/monitoring/VercelPlatformPanel'

type Tab = 'errors' | 'logs' | 'alerts' | 'replays' | 'releases' | 'feedback' | 'vercel'

export default function MonitoringPage() {
  const { can } = usePermissions()
  const [tab, setTab] = useState<Tab>('errors')
  const { data: summary, isLoading: summaryLoading } = useMonitoringSummary()

  const tabs: TabItem<Tab>[] = [
    { id: 'errors',   label: 'Errors & Outages', icon: AlertTriangle, badge: summary?.unresolvedIssues },
    { id: 'logs',     label: 'Logs',              icon: ScrollText },
    { id: 'alerts',   label: 'Alerts',            icon: Bell },
    { id: 'replays',  label: 'Replays',           icon: Video },
    { id: 'releases', label: 'Releases',          icon: GitBranch },
    { id: 'feedback', label: 'Feedback',          icon: MessageSquareWarning },
    { id: 'vercel',   label: 'Vercel Platform',   icon: Cloud },
  ]

  return (
    <RoleGuard allowed={['admin', 'high_rank']}>
      <div className="min-h-screen bg-page">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-brand-navy" aria-hidden />
            <h1 className="font-heading text-2xl font-bold text-brand-navy">Monitoring</h1>
          </div>
          <p className="text-sm text-muted -mt-4">Live system health, errors, and outages</p>

          <MonitoringKpiStrip summary={summary} isLoading={summaryLoading} />

          <ModuleTabs<Tab>
            id="monitoring"
            tabs={tabs}
            active={tab}
            onChange={setTab}
            variant="pill"
          />

          {tab === 'errors'   && <ErrorsOutagesPanel />}
          {tab === 'logs'     && <LogsPanel />}
          {tab === 'alerts'   && <AlertsPanel canManage={can('monitoring.manage')} />}
          {tab === 'replays'  && <ReplaysPanel />}
          {tab === 'releases' && <ReleasesPanel summary={summary} />}
          {tab === 'feedback' && <FeedbackPanel />}
          {tab === 'vercel'   && <VercelPlatformPanel />}
        </div>
      </div>
    </RoleGuard>
  )
}