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
 * [DEPENDS ON]: W/hooks/useHR.ts, W/components/shared/PlaceholderWidget.tsx
 *   (same phase), W/components/shared/StatCard.tsx (statValue, same phase)
 */

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
import { PlaceholderWidget } from '@/components/shared/PlaceholderWidget'
import {
  useStaffDirectory,
  useLeaveRequests,
  useContractAlerts,
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

export function HRDashboard() {
  const { data: staffData, isLoading: staffLoading }       = useStaffDirectory()
  const { data: leaveData, isLoading: leaveLoading }       = useLeaveRequests({ status: 'PENDING' })
  const { data: contractData, isLoading: contractLoading } = useContractAlerts(CONTRACT_ALERT_DAYS)
  const { data: loansData, isLoading: loansLoading }       = useLoans('PENDING')

  const staff     = staffData    as ApiStaffProfile[]  | undefined
  const leave     = leaveData    as ApiLeaveRequest[]  | undefined
  const contracts = contractData as ApiContractAlert[] | undefined
  const loans     = loansData    as ApiStaffLoan[]     | undefined

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
        <PlaceholderWidget
          title="Contract Expiry Alerts"
          sub="60 / 30 / 7 day warnings"
          h="h-32 md:h-40"
        />
        <PlaceholderWidget
          title="Staff Leave Calendar"
          sub="Who is off this week"
          h="h-32 md:h-40"
        />
      </div>
    </div>
  )
}
