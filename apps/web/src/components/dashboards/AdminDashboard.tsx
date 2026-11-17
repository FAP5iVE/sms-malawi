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
  Activity,
  UserPlus,
  FileSearch,
  Settings,
  Bell,
} from 'lucide-react'
import { QuickActions }           from '@/components/shared/QuickActions'
import type { QuickAction }       from '@/components/shared/QuickActions'
import { ListCard }               from '@/components/shared/ListCard'
import { Chart }                  from '@/components/shared/chart'
import type { ChartDataPoint }    from '@/components/shared/chart'
import { useAdminLoginTrend }     from '@/hooks/useAnalytics'
import { useAdminOverview, useAdminAttention } from '@/hooks/reporting/useAdminReporting'
import { DashboardAttention } from './DashboardReport'
import { PrimaryOverviewKpis, ReportLinks, SecondaryKpis, TrendCard } from './DashboardSections'
import type { ReportLink } from './DashboardSections'
import { useAnnouncements }       from '@/hooks/useAnnouncements'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Add user',
    // R15: was /user-management/new — a route that has never existed.
    // User creation is in-page at /user-management.
    href:  '/user-management',
    icon:  UserPlus,
    color: 'bg-brand-teal/10',
    text:  'text-tone-teal',
  },
  {
    label: 'Audit logs',
    href:  '/reports?tab=audit',
    icon:  FileSearch,
    color: 'bg-brand-navy/8',
    text:  'text-brand-navy',
  },
  {
    label: 'System health',
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
    text:  'text-tone-amber',
  },
  {
    label: 'Announcements',
    href:  '/announcements',
    icon:  Bell,
    color: 'bg-purple-50',
    text:  'text-purple-600',
  },
]

/** Lead with platform health and sign-in security; the rest sit in "More figures". Health KPIs only exist when monitoring data does. */
const PREFERRED = ['services', 'issues', 'failureRate', 'activeNow', 'loginsToday', 'audit24']

const REPORT_LINKS: ReportLink[] = [
  { label: 'Overview', href: '/reports?tab=overview', description: 'Every figure with its definition' },
  { label: 'Security', href: '/reports?tab=security', description: 'Failed sign-ins, repeated failures' },
  { label: 'Sessions', href: '/reports?tab=sessions', description: 'Who is signed in, from where' },
  { label: 'Governance', href: '/reports?tab=governance', description: 'Audited changes' },
  { label: 'Operations', href: '/reports?tab=operations', description: 'Platform health and errors' },
  { label: 'Audit log', href: '/reports?tab=audit', description: 'Searchable record of actions' },
]

export function AdminDashboard() {
  const overview = useAdminOverview()
  const attention = useAdminAttention()

  const loginQuery = useAdminLoginTrend(30)
  const loginData: ChartDataPoint[] = (loginQuery.data ?? []).map((p) => ({
    x: p.date,
    successful: p.successful,
    failed: p.failed,
  }))

  const { announcements, loading: announcementsLoading } = useAnnouncements()
  const recentAnnouncements = announcements.slice(0, 5)

  return (
    <div className="space-y-4 md:space-y-6">
      <PrimaryOverviewKpis
        title="Administration"
        summary="Review sign-ins, see how the system is being used and check for issues that need attention."
        overview={overview}
        preferred={PREFERRED}
        reportsHref="/reports?tab=overview"
      />

      <TrendCard
        title="Sign-in activity"
        sub="Successful and failed sign-ins, last 30 days"
        isLoading={loginQuery.isLoading}
        isError={loginQuery.isError}
        onRetry={() => void loginQuery.refetch()}
      >
        <Chart
          type="line"
          data={loginData}
          /* Colours are tied to meaning (good = teal, bad = coral), not to a palette index. */
          series={[
            { key: 'successful', label: 'Successful', color: 'var(--color-brand-teal, #0e8a6a)' },
            { key: 'failed', label: 'Failed', color: 'var(--color-brand-coral, #dc4f3a)' },
          ]}
          height={200}
          emptyStateMessage="No login activity recorded in the last 30 days."
          ariaLabel="Login activity over the last 30 days, showing successful versus failed sign-in attempts"
        />
      </TrendCard>

      <DashboardAttention query={attention} title="Administrator attention queue" limit={5} />

      <SecondaryKpis
        title="More figures and findings"
        overview={overview}
        preferred={PREFERRED}
        showInsights
        extra={
          <ListCard
            title="Recent announcements"
            sub="Latest posts"
            isLoading={announcementsLoading}
            isEmpty={recentAnnouncements.length === 0}
            emptyMessage="No announcements have been posted yet."
          >
            <ul className="divide-y divide-base">
              {recentAnnouncements.map((a) => (
                <li key={a.id} className="py-2.5">
                  <p className="text-sm font-medium text-brand-navy truncate">{a.title}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {a.postType.charAt(0) + a.postType.slice(1).toLowerCase()}
                    {a.createdAt ? ` · ${new Date(a.createdAt).toLocaleDateString('en-MW')}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </ListCard>
        }
      />

      <QuickActions actions={QUICK_ACTIONS} compact />
      <ReportLinks links={REPORT_LINKS} />
    </div>
  )
}
