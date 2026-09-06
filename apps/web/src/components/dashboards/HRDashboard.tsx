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

import { useState } from 'react'
import {
  Users,
  Clock,
  AlertTriangle,
  Banknote,
  UserPlus,
  CheckCircle,
  CalendarDays,
  FileText,
} from 'lucide-react'
import { StatCard, StatCardGrid, statValue } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { ListCard } from '@/components/shared/ListCard'
import {
  useStaffDirectory,
  useLeaveRequests,
  useUpcomingContractExpiries,
  useLoans,
} from '@/hooks/useHR'
import type { QuickAction } from '@/components/shared/QuickActions'
import type {
  ApiStaffProfile,
  ApiLeaveRequest,
  ApiContractAlert,
  ApiStaffLoan,
} from '@shared/types/api'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Approve Leave',
    // R15: was /hr/leave — a route that has never existed (404)
    href: '/hr?tab=leave',
    icon: CheckCircle,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Add Staff',
    // R15: was /hr/staff/new (404) — staff creation lives in the Directory tab
    href: '/hr?tab=directory',
    icon: UserPlus,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Leave Calendar',
    href: '/calendar',
    icon: CalendarDays,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
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

/** Msec in a day — for the "who is off this week" leave-window check. */
const DAY_MS = 24 * 60 * 60 * 1000

export function HRDashboard() {
  const { data: staffData, isLoading: staffLoading }       = useStaffDirectory()
  const { data: leaveData, isLoading: leaveLoading }       = useLeaveRequests({ status: 'PENDING' })
  // [PRODUCTION FIX] was useContractAlerts() — an exact-day match (see
  // hrService.getUpcomingContractExpiries()'s header comment) that could
  // only ever show a contract expiring exactly 60 days from today. Both
  // this stat card and the widget below need a genuine "next 60 days" range.
  const { data: contractData, isLoading: contractLoading } = useUpcomingContractExpiries(CONTRACT_ALERT_DAYS)
  const { data: loansData, isLoading: loansLoading }       = useLoans('PENDING')
  // "Who is off this week" — every APPROVED leave request, filtered to
  // whichever ones overlap the current week.
  const { data: approvedLeaveData, isLoading: approvedLeaveLoading } = useLeaveRequests({ status: 'APPROVED' })

  const staff     = staffData    as ApiStaffProfile[]  | undefined
  const leave     = leaveData    as ApiLeaveRequest[]  | undefined
  const contracts = contractData as ApiContractAlert[] | undefined
  const loans     = loansData    as ApiStaffLoan[]     | undefined
  const approvedLeave = approvedLeaveData as ApiLeaveRequest[] | undefined

  // [PRODUCTION FIX] react-hooks/purity — Date.now() called directly in the
  // render body is an impure call (react.dev/reference/rules/components-and-
  // hooks-must-be-pure#components-and-hooks-must-be-idempotent). Reading it
  // through a lazy useState initializer keeps the render body pure: React
  // only ever invokes the initializer function once, on mount, rather than
  // on every render — which is also the right *behaviour* here, since this
  // widget doesn't need "this week" to shift mid-session as real time ticks
  // past a boundary.
  const [weekStart] = useState(() => Date.now())
  const weekEnd = weekStart + 7 * DAY_MS
  const offThisWeek = (approvedLeave ?? []).filter((lr) => {
    const start = new Date(lr.startDate).getTime()
    const end   = new Date(lr.endDate).getTime()
    return Number.isFinite(start) && Number.isFinite(end) && start <= weekEnd && end >= weekStart - DAY_MS
  })

  return (
    <div className="space-y-6">
      <StatCardGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Staff"
          value={statValue(staffLoading, staff?.length)}
          icon={Users}
          trend="neutral"
          trendLabel="on record"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Leave Requests"
          value={statValue(leaveLoading, leave?.length)}
          icon={Clock}
          trend="neutral"
          trendLabel="pending review"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
        <StatCard
          label="Contract Expiries"
          value={statValue(contractLoading, contracts?.length)}
          icon={AlertTriangle}
          trend="neutral"
          trendLabel={`within ${CONTRACT_ALERT_DAYS} days`}
          iconColor="bg-brand-coral/10"
          iconText="text-brand-coral"
        />
        <StatCard
          label="Pending Loan Approvals"
          value={statValue(loansLoading, loans?.length)}
          icon={Banknote}
          trend="neutral"
          trendLabel="awaiting"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
      </StatCardGrid>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <ListCard
          title="Contract Expiry Alerts"
          sub={`Expiring in the next ${CONTRACT_ALERT_DAYS} days`}
          isLoading={contractLoading}
          isEmpty={(contracts ?? []).length === 0}
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
                <span className="text-xs text-brand-coral whitespace-nowrap shrink-0">
                  {new Date(c.contractExpiry).toLocaleDateString('en-MW')}
                </span>
              </li>
            ))}
          </ul>
        </ListCard>
        <ListCard
          title="Staff Leave Calendar"
          sub="Who is off this week"
          isLoading={approvedLeaveLoading}
          isEmpty={offThisWeek.length === 0}
          emptyMessage="No staff are on approved leave this week."
        >
          <ul className="divide-y divide-base">
            {offThisWeek.map((lr) => (
              <li key={lr.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-navy truncate">
                    {lr.staff ? `${lr.staff.firstName} ${lr.staff.lastName}` : 'Staff member'}
                  </p>
                  <p className="text-xs text-muted truncate">{lr.leaveType}</p>
                </div>
                <span className="text-xs text-muted whitespace-nowrap shrink-0">
                  {new Date(lr.startDate).toLocaleDateString('en-MW')} – {new Date(lr.endDate).toLocaleDateString('en-MW')}
                </span>
              </li>
            ))}
          </ul>
        </ListCard>
      </div>
    </div>
  )
}