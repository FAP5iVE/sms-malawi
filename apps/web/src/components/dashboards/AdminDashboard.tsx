'use client'

/**
 * apps/web/src/components/dashboards/AdminDashboard.tsx — Phase C6
 *
 * [CHANGE TYPE]: MAJOR REWRITE (stat-card data-wiring and quick-action
 *   link targets only — the overall visual layout is unaffected)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]:
 *   (1) All four stat cards now show real figures instead of permanent
 *       '—'/'0' literals: Total Users ← useUsers() (GET /users, admin-only,
 *       which this dashboard's role is); Active Users (last hour) ←
 *       useSystemHealth().activeUsersLastHr; Service Alerts ← count of
 *       useSystemHealth().services not reporting 'ok'; Actions (24h) ←
 *       useSystemHealth().actionsLast24h. The hardcoded "Security Alerts: 0
 *       / All clear" and "System Errors: 0 / No errors" cards — figures no
 *       endpoint has ever produced — are replaced by the two real health
 *       figures above.
 *   (2) Quick actions de-duplicated and corrected: the 'Users' and 'System
 *       Health' actions both pointed at /user-management; 'Users' is
 *       removed and 'System Health' now deep-links to
 *       /user-management?tab=health (the page gains ?tab= initialisation
 *       this phase). 'Add User' pointed at /user-management/new — a route
 *       that has never existed (404); user creation is in-page at
 *       /user-management.
 *   (3) PlaceholderWidget moved to W/components/shared/PlaceholderWidget
 *       (tier fix — a shared component was defined in, and re-exported
 *       from, this domain file); the re-export here is gone and all eight
 *       sibling dashboards now import it from shared.
 * [DEPENDS ON]: W/hooks/useAdmin.ts (useUsers), W/hooks/useReports.ts
 *   (useSystemHealth), W/components/shared/PlaceholderWidget.tsx (same
 *   phase), W/components/shared/StatCard.tsx (statValue, same phase)
 */

import {
  Users,
  ShieldCheck,
  Activity,
  ClipboardList,
  UserPlus,
  FileSearch,
  Settings,
  Bell,
} from 'lucide-react'
import { StatCard, StatCardGrid, statValue } from '@/components/shared/StatCard'
import { QuickActions }           from '@/components/shared/QuickActions'
import type { QuickAction }       from '@/components/shared/QuickActions'
import { PlaceholderWidget }      from '@/components/shared/PlaceholderWidget'
import { ChartCard }              from '@/components/shared/ChartCard'
import { Chart }                  from '@/components/shared/chart'
import type { ChartDataPoint }    from '@/components/shared/chart'
import { useUsers }               from '@/hooks/useAdmin'
import { useAdminLoginTrend }     from '@/hooks/useAnalytics'
import { useSystemHealth }        from '@/hooks/useReports'
import type { ApiUserListResponse, ApiSystemHealth } from '@shared/types/api'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Add User',
    // R15: was /user-management/new — a route that has never existed.
    // User creation is in-page at /user-management.
    href:  '/user-management',
    icon:  UserPlus,
    color: 'bg-brand-teal/10',
    text:  'text-brand-teal',
  },
  {
    label: 'Audit Logs',
    href:  '/reports',
    icon:  FileSearch,
    color: 'bg-brand-navy/8',
    text:  'text-brand-navy',
  },
  {
    label: 'System Health',
    // R15: deep-links to the health tab (page reads ?tab= as of this phase).
    href:  '/user-management?tab=health',
    icon:  Activity,
    color: 'bg-emerald-50',
    text:  'text-emerald-600',
  },
  {
    label: 'Settings',
    href:  '/settings',
    icon:  Settings,
    color: 'bg-brand-amber/10',
    text:  'text-brand-amber',
  },
  {
    label: 'Announcements',
    href:  '/announcements',
    icon:  Bell,
    color: 'bg-purple-50',
    text:  'text-purple-600',
  },
]

export function AdminDashboard() {
  const { data: usersData, isLoading: usersLoading }   = useUsers()
  const { data: healthData, isLoading: healthLoading } = useSystemHealth()

  const users  = usersData  as ApiUserListResponse | undefined
  const health = healthData as ApiSystemHealth | undefined

  const serviceAlerts = health
    ? health.services.filter((s) => s.status !== 'ok').length
    : undefined

  const { data: loginTrend = [], isLoading: loginLoading } = useAdminLoginTrend(30)
  const loginData: ChartDataPoint[] = loginTrend.map((p) => ({
    x: p.date,
    successful: p.successful,
    failed: p.failed,
  }))

  return (
    <div className="space-y-6">

      {/* Stat row — StatCardGrid orchestrates stagger animation (B8 + C6) */}
      <StatCardGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={statValue(usersLoading, users?.users.length)}
          icon={Users}
          trend="neutral"
          trendLabel="accounts"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Active Users"
          value={statValue(healthLoading, health?.activeUsersLastHr)}
          icon={Activity}
          trend="neutral"
          trendLabel="last hour"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
        <StatCard
          label="Service Alerts"
          value={statValue(healthLoading, serviceAlerts)}
          icon={ShieldCheck}
          trend={serviceAlerts === 0 ? 'up' : serviceAlerts !== undefined ? 'down' : 'neutral'}
          trendLabel={serviceAlerts === 0 ? 'all healthy' : 'degraded'}
          iconColor={serviceAlerts ? 'bg-brand-coral/10' : 'bg-emerald-50'}
          iconText={serviceAlerts ? 'text-brand-coral' : 'text-emerald-600'}
        />
        <StatCard
          label="Actions (24h)"
          value={statValue(healthLoading, health?.actionsLast24h)}
          icon={ClipboardList}
          trend="neutral"
          trendLabel="audit events"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
      </StatCardGrid>

      <QuickActions actions={QUICK_ACTIONS} />

      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard
          title="User Activity"
          sub="Login success vs failure (last 30 days)"
          isLoading={loginLoading}
          height={200}
        >
          <Chart
            type="line"
            data={loginData}
            series={[
              { key: 'successful', label: 'Successful' },
              { key: 'failed', label: 'Failed' },
            ]}
            height={200}
            emptyStateMessage="No login activity recorded in the last 30 days."
            ariaLabel="Login activity over the last 30 days, showing successful versus failed sign-in attempts"
          />
        </ChartCard>
        <PlaceholderWidget
          title="Recent Announcements"
          sub="Latest posts — see the header bell or /announcements"
          h="h-36 md:h-48"
        />
      </div>
    </div>
  )
}
