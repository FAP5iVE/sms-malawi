'use client'

/**
 * apps/web/src/components/dashboards/HRDashboard.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (stat-card data-wiring and quick-action
 *   link targets only — the overall visual layout is unaffected)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: All four stat cards were permanent '—' placeholders. Wired to
 *   the same hooks hr/page.tsx already uses for the identical figures:
 *   Total Staff ← useStaffDirectory(); Leave Requests ←
 *   useLeaveRequests({status:'PENDING'}); Contract Expiries ←
 *   useContractAlerts(60) — the trendLabel already said "within 60 days"
 *   and 60 is that hook's documented default lookahead; Pending Loan
 *   Approvals ← useLoans('PENDING'). Quick actions: /hr/leave and
 *   /hr/staff/new have never existed as routes (guaranteed 404s) —
 *   corrected to the real in-page tabs /hr?tab=leave and
 *   /hr?tab=directory (staff creation lives in the Directory tab; the
 *   page reads ?tab= as of this phase). PlaceholderWidget import moved to
 *   its new shared home.
 *
 * [CHANGE TYPE]: TARGETED EDIT (production fix).
 * [PURPOSE]: "Contract Expiries" stat card and "Contract Expiry Alerts" /
 *   "Staff Leave Calendar" widgets. The stat card's useContractAlerts(60)
 *   was an exact-day match (only ever true for a contract expiring on
 *   precisely day 60), so it — and the widget, then still a
 *   PlaceholderWidget — could show almost nothing; repointed at the new
 *   range-based useUpcomingContractExpiries(). Staff Leave Calendar is new:
 *   useLeaveRequests({status:'APPROVED'}) filtered client-side to leave
 *   overlapping the current week.
 * [DEPENDS ON]: W/hooks/useHR.ts (useUpcomingContractExpiries, same phase),
 *   W/components/shared/ListCard.tsx (same phase), W/components/shared/StatCard.tsx (statValue, same phase)
 */

import {
  UserPlus,
  CheckCircle,
  CalendarDays,
  FileText,
} from 'lucide-react'
import { QuickActions } from '@/components/shared/QuickActions'
import { ListCard } from '@/components/shared/ListCard'
import { useOnLeaveNow, useUpcomingContractExpiries } from '@/hooks/useHR'
import { LEAVE_TYPE_LABELS } from '@shared/types/settings'
import type { LeaveTypeKey } from '@shared/types/settings'
import { useHrOverview, useHrAttention } from '@/hooks/reporting/useHrReporting'
import { useViewingPeriod } from '@/hooks/useViewingPeriod'
import { DashboardAttention } from './DashboardReport'
import { PrimaryOverviewKpis, ReportLinks, SecondaryKpis } from './DashboardSections'
import type { ReportLink } from './DashboardSections'
import type { QuickAction } from '@/components/shared/QuickActions'
import type { ApiContractAlert } from '@shared/types/api'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Approve leave',
    // R15: was /hr/leave — a route that has never existed (404)
    href: '/hr?tab=leave',
    icon: CheckCircle,
    color: 'bg-brand-teal/10',
    text: 'text-tone-teal',
  },
  {
    label: 'Add staff',
    // R15: was /hr/staff/new (404) — staff creation lives in the Directory tab
    href: '/hr?tab=directory',
    icon: UserPlus,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Leave calendar',
    href: '/calendar',
    icon: CalendarDays,
    color: 'bg-brand-amber/10',
    text: 'text-tone-amber',
  },
  {
    label: 'HR Reports',
    href: '/reports',
    icon: FileText,
    color: 'bg-brand-navy/8',
    text: 'text-brand-navy',
  },
]

/** Matches useContractAlerts()'s documented default lookahead window. */
const CONTRACT_ALERT_DAYS = 60

/** Lead with headcount, absence and the two decisions HR is waiting on; the rest sit in "More figures". */
const PREFERRED = ['headcount', 'onLeaveToday', 'pendingLeave', 'expiringContracts']

const REPORT_LINKS: ReportLink[] = [
  { label: 'Overview', href: '/reports?tab=overview', description: 'Every workforce figure with its definition' },
  { label: 'Workforce', href: '/reports?tab=workforce', description: 'Headcount by department and role' },
  { label: 'Leave', href: '/reports?tab=leave', description: 'Requests, balances, days taken' },
  { label: 'Contracts', href: '/reports?tab=contracts', description: 'Expiring and expired contracts' },
  { label: 'Staff loans', href: '/reports?tab=loans', description: 'Balances and approvals' },
  { label: 'Reviews', href: '/reports?tab=reviews', description: 'Performance review completion' },
]

export function HRDashboard() {
  const { academicYear } = useViewingPeriod()
  const overview = useHrOverview(academicYear ?? '')
  const attention = useHrAttention(academicYear ?? '')
  // [PRODUCTION FIX] was useContractAlerts() — an exact-day match (see
  // hrService.getUpcomingContractExpiries()'s header comment) that could
  // only ever show a contract expiring exactly 60 days from today. Both
  // this stat card and the widget below need a genuine "next 60 days" range.
  const { data: contractData, isLoading: contractLoading, isError: contractError, refetch: refetchContracts } = useUpcomingContractExpiries(CONTRACT_ALERT_DAYS)
  // Who is away right now: everyone whose approved leave covers today. Comes
  // from the server by date, not from a filtered list of requests.
  const { data: onLeaveNow, isLoading: onLeaveLoading, isError: leaveError, refetch: refetchLeave } = useOnLeaveNow()

  const contracts = contractData as ApiContractAlert[] | undefined


  return (
    <div className="space-y-4 md:space-y-6">
      <PrimaryOverviewKpis
        title="Workforce"
        summary="Check staff numbers, upcoming contract dates, leave and requests waiting for a decision."
        academicYear={academicYear}
        overview={overview}
        preferred={PREFERRED}
        reportsHref="/reports?tab=overview"
      />
      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
        <ListCard
          title="Contract expiry alerts"
          sub={`Expiring in the next ${CONTRACT_ALERT_DAYS} days`}
          isLoading={contractLoading}
          isEmpty={(contracts ?? []).length === 0}
          isError={contractError}
          onRetry={() => void refetchContracts()}
          emptyMessage={`No contracts expiring in the next ${CONTRACT_ALERT_DAYS} days.`}
        >
          <ul className="divide-y divide-base">
            {(contracts ?? []).map((c) => (
              <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-navy truncate">
                    {c.firstName} {c.lastName}
                  </p>
                  <p className="text-xs text-muted truncate">{c.department}</p>
                </div>
                <span className="text-xs text-tone-coral whitespace-nowrap shrink-0">
                  {new Date(c.contractExpiry).toLocaleDateString('en-MW')}
                </span>
              </li>
            ))}
          </ul>
        </ListCard>
        <ListCard
          title="On leave today"
          sub="Staff whose approved leave covers today"
          isLoading={onLeaveLoading}
          isEmpty={(onLeaveNow ?? []).length === 0}
          isError={leaveError}
          onRetry={() => void refetchLeave()}
          emptyMessage="Nobody is on leave today."
        >
          <ul className="divide-y divide-base">
            {(onLeaveNow ?? []).map((p) => (
              <li key={p.requestId} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-navy truncate">{p.firstName} {p.lastName}</p>
                  <p className="text-xs text-muted truncate">
                    {LEAVE_TYPE_LABELS[p.leaveType as LeaveTypeKey] ?? p.leaveType} · {p.department}
                  </p>
                </div>
                <span className="text-xs text-muted whitespace-nowrap shrink-0 text-right">
                  Back {new Date(p.returnDate).toLocaleDateString('en-MW')}
                </span>
              </li>
            ))}
          </ul>
        </ListCard>
      </div>
      <DashboardAttention query={attention} title="HR attention queue" limit={5} />
      <SecondaryKpis title="More figures and findings" overview={overview} preferred={PREFERRED} showInsights />
      <QuickActions actions={QUICK_ACTIONS} compact />
      <ReportLinks links={REPORT_LINKS} />
    </div>
  )
}
