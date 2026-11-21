'use client'

/*
 * apps/web/src/app/(auth)/hr/page.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE of the Loans tab only. Directory
 *   visibility, the contract-alert window control, and the
 *   LeaveConflictWarning wiring are TARGETED EDITs (Leave Requests tab
 *   otherwise unchanged).
 * [R-PHASE]: R11 — HR Domain: Loans UI, Leave-Conflict Wiring & Directory
 *   Access Correction
 * [PURPOSE]:
 *   1. Loans tab: replaced the "Staff loan management will be available
 *      in Phase 6" placeholder with a real request/approve/disburse/
 *      repay workflow, using useHR.ts's loan hooks (useRequestLoan(),
 *      already correctly built; useLoans()/useApproveLoan()/
 *      useDisburseLoan()/useRecordLoanRepayment(), added this same phase
 *      — the roadmap's claim that these "siblings" were "confirmed
 *      implemented but callerless" did not hold up against the real
 *      file, which had only useRequestLoan()). "Request a Loan" is shown
 *      to anyone holding hr.applyLoan (nearly every non-admin staff
 *      role); "Manage Loan Requests" is shown to admin/hr/high_rank/
 *      finance, with each action button (Approve/Disburse/Record
 *      Repayment) further gated to match the real, unmodified backend
 *      route each one calls exactly (role-based, not permission-based —
 *      matching the actual enforced authorization rather than the
 *      permission matrix where the two disagree, e.g. high_rank formally
 *      holds hr.approveLoan but the approve route itself still gates by
 *      role only, which this phase is not authorized to change).
 *   2. Directory tab: visibility restricted to admin/high_rank/hr,
 *      matching hr.viewAnyProfile's real grant and GET /hr's corrected
 *      role list (hr.ts, same phase) — previously the only tab visible
 *      to all 8 non-student roles. The page-level RoleGuard is
 *      unchanged (still all 8 non-student roles) since the Loans tab
 *      (hr.applyLoan) needs to remain reachable by finance/academic/
 *      library/lower_rank/exam_officer, none of whom hold
 *      hr.viewAnyProfile.
 *   3. Leave Requests tab: on approving a request, the response's
 *      conflictResult (hrService.reviewLeave(), same phase) is shown via
 *      LeaveConflictWarning.tsx (unmodified — the audit confirmed it
 *      already a model implementation) in a dismissible panel, so the
 *      approving manager actually sees what the conflict engine found.
 *   4. Contract Alerts tab: the fixed 60-day useContractAlerts(60) call
 *      is now backed by a day-window selector (7/30/60/90).
 * [DEPENDS ON]: W/hooks/useHR.ts (loan hooks, same phase),
 *   W/components/hr/LeaveConflictWarning.tsx (unmodified),
 *   W/hooks/usePermissions.ts
 *
 * [POST-R11, user-requested follow-up beyond the roadmap's literal
 * scope]: added a "My Loan Status" section to the Loans tab (any staff
 * member holding hr.applyLoan) showing their own loan history via
 * useMyLoans() — previously a staff member who submitted a request had
 * no way to check on it afterward. See useHR.ts, hr.ts, and hrService.ts
 * headers for the corresponding backend additions (GET /loans/mine,
 * getMyLoans()) and the loan↔payroll balance-reconciliation fix
 * (payrollService.ts, hrService.ts).
 */

import { useState, Suspense } from 'react'
import { useSearchParams }  from 'next/navigation'
import { RoleGuard }        from '@/components/shared/RoleGuard'
import { ModuleSurface }    from '@/components/shared/ModuleSurface'
import { useAuthStore }     from '@/store/authStore'
import { usePermissions }   from '@/hooks/usePermissions'
import type { LeaveRequestInput } from '@shared/schemas/hr'
import { LEAVE_TYPE_LABELS } from '@shared/types/settings'
import type { LeaveTypeKey } from '@shared/types/settings'
import { countLeaveDays, isWeekendDay, toUtcDay } from '@shared/utils/leave'
import {
  useStaffDirectory,
  useLeaveRequests,
  useMyLeaveRequests,
  useMyLeaveOptions,
  useOnLeaveNow,
  useApplyForLeave,
  useUpcomingContractExpiries,
  useReviewLeave,
  useRequestLoan,
  useLoans,
  useMyLoans,
  useApproveLoan,
  useDisburseLoan,
  useRecordLoanRepayment,
}                           from '@/hooks/useHR'
import { useDepartmentTitles } from '@/hooks/useSettings'
import { LeaveConflictWarning } from '@/components/hr/LeaveConflictWarning'
import { StaffForm }           from '@/components/hr/StaffForm'
import type { ConflictCheckResult } from '@/server/services/leaveConflictService'
import {
  Users,
  Calendar,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Banknote,
  Loader2,
  UserPlus,
  Wallet,
  
  ChevronRight,
  LayoutGrid,
  List
}                           from 'lucide-react'
import Link                 from 'next/link'
import { ModuleTabs }       from '@/components/shared/ModuleTabs'
import { formatMWK }        from '@shared/constants/malawi'
import { statusWord }       from '@/lib/hills/statusWord'
import { PayrollWorkspace } from '@/components/finances/payroll/PayrollWorkspace'
import type { ApiStaffProfile, ApiLeaveRequest, ApiContractAlert, ApiStaffLoan } from '@shared/types/api'
import { Modal } from '@/components/shared/Modal'

/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Initialises the active tab from ?tab= (post-hydration) so
 *   HRDashboard's corrected quick actions can deep-link — /hr/leave and
 *   /hr/staff/new never existed as routes.
 */
type Tab = 'directory' | 'leave' | 'loans' | 'mypay' | 'alerts'

const HR_TABS: Tab[] = ['directory', 'leave', 'loans', 'mypay', 'alerts']

export default function HRPage() {
  return (
    <RoleGuard
      allowed={[
        'admin',
        'hr',
        'high_rank',
        'finance',
        'academic',
        'library',
        'lower_rank',
        'exam_officer',
      ]}
    >
      {/* useSearchParams() requires a Suspense boundary or `next build` fails —
          same convention as (public)/login/page.tsx and (auth)/exams/page.tsx. */}
      <Suspense fallback={<div className="p-6 space-y-3"><div className="h-8 w-40 rounded-lg bg-surface animate-pulse" /><div className="h-48 rounded-xl bg-surface animate-pulse" /></div>}>
        <HRContent />
      </Suspense>
    </RoleGuard>
  )
}

function HRContent() {
  const { role }  = useAuthStore()
  const { can }   = usePermissions()

  // R19 — the active tab is derived from ?tab= during render via Next's
  // useSearchParams() (the codebase's established pattern — see
  // (public)/login/page.tsx, (auth)/exams/page.tsx, (auth)/finances/page.tsx)
  // instead of a useEffect that read window.location.search and called
  // setTab post-mount. useSearchParams() is backed by the actual request
  // URL on the server, so a deep-linked tab (/hr?tab=leave, /hr?tab=directory
  // from HRDashboard's quick actions) now renders on first paint. The
  // staff-only tabs are still gated further down by the same isHR checks
  // that gate their tab buttons.
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab: Tab = tabParam && (HR_TABS as string[]).includes(tabParam) ? (tabParam as Tab) : 'loans'

  const [tab, setTab]         = useState<Tab>(initialTab)
  const [search, setSearch]   = useState('')
  // [PRODUCTION FIX 2026-07-27] Department/title directory filters, sourced
  // from the same admin/hr/high_rank-editable taxonomy StaffForm now uses.
  const [deptFilter, setDeptFilter]   = useState('')
  const [titleFilter, setTitleFilter] = useState('')
  const { data: departmentTitles = {} } = useDepartmentTitles()
  const filterDepartments = Object.keys(departmentTitles).sort()
  const filterTitles = deptFilter ? (departmentTitles[deptFilter] ?? []) : []
  const [showStaffForm, setShowStaffForm] = useState(false)
  // [NEW] Staff Directory list/grid toggle — persisted per-browser so the
  // choice survives a refresh, same pattern as any other pure display
  // preference (no server round-trip needed, nothing to sync across users).
  const [directoryView, setDirectoryView] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid'
    return window.localStorage.getItem('hr-directory-view') === 'list' ? 'list' : 'grid'
  })
  function setDirectoryViewPersisted(view: 'grid' | 'list') {
    setDirectoryView(view)
    if (typeof window !== 'undefined') window.localStorage.setItem('hr-directory-view', view)
  }

  const isHR         = ['admin', 'hr', 'high_rank'].includes(role ?? '')
  const canApplyLoan = can('hr.applyLoan')
  // Creating staff (which now provisions a login) maps to the backend's
  // HR_ADMIN role gate on POST /hr — admin/hr/high_rank. Matches isHR.
  const canCreateStaff = isHR

  const { data: staff = [],          isLoading: staffLoading } = useStaffDirectory({
    search,
    department: deptFilter || undefined,
    jobTitle:   titleFilter || undefined,
  })
  // [PRODUCTION FIX 2026-07-27] The Leave Requests tab previously hardcoded
  // status: 'PENDING' with no way to see approved/rejected history. Split
  // into two calls: leaveRequests (filterable, drives the visible list) and
  // pendingLeaveCount (always PENDING, drives the tab badge) — so switching
  // the filter away from Pending doesn't make the badge lie about how many
  // requests are actually awaiting review.
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | ''>('PENDING')
  // The reviewer list is role-gated on the server, so only HR/admin/high_rank ask for it.
  const { data: leaveRequests = [] }                           = useLeaveRequests({ status: leaveStatusFilter || undefined }, { enabled: isHR })
  const { data: pendingLeaveForBadge = [] }                    = useLeaveRequests({ status: 'PENDING' }, { enabled: isHR })
  // Self-service leave: the signed-in person's own requests (resolved on the
  // server; the old call passed the sign-in uid as a staff id and returned
  // nothing, or a 403 for non-reviewers) and what they may ask for.
  const { data: myLeaveRequests = [] } = useMyLeaveRequests()
  const { data: leaveOptions = [] }    = useMyLeaveOptions()
  // Everyone whose approved leave covers today — NOT filtered by request status.
  const { data: onLeaveNow = [] }      = useOnLeaveNow(isHR)
  const applyForLeave = useApplyForLeave()
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [leaveType, setLeaveType]         = useState<LeaveRequestInput['leaveType']>('ANNUAL')
  const [leaveStartDate, setLeaveStartDate] = useState('')
  const [leaveEndDate, setLeaveEndDate]     = useState('')
  const [leaveReason, setLeaveReason]       = useState('')

  // Live check of the dates against the same day-counting the server uses
  // (Monday to Friday, public holidays not counted).
  const selectedLeave   = leaveOptions.find((o) => o.leaveType === leaveType)
  const leaveDatesSet   = Boolean(leaveStartDate && leaveEndDate)
  const leaveDatesOrder = leaveDatesSet && leaveEndDate >= leaveStartDate
  const requestedDays   = leaveDatesOrder ? countLeaveDays(leaveStartDate, leaveEndDate) : 0
  const leaveOnWeekend  = leaveDatesSet && (isWeekendDay(toUtcDay(leaveStartDate)) || isWeekendDay(toUtcDay(leaveEndDate)))
  const leaveOverLimit  = selectedLeave?.maxDays != null && requestedDays > selectedLeave.maxDays
  const leaveDateError  =
    leaveDatesSet && !leaveDatesOrder ? 'The end date must be on or after the start date.'
    : leaveOnWeekend ? 'Leave cannot start or end on a weekend.'
    : leaveDatesOrder && requestedDays === 0 ? 'Those dates have no working days (weekends and public holidays are not counted).'
    : leaveOverLimit ? `That is ${requestedDays} working days; the most you can ask for is ${selectedLeave?.maxDays}.`
    : null

  function submitLeaveRequest() {
    if (!leaveStartDate || !leaveEndDate || leaveReason.trim().length < 10 || leaveDateError) return
    applyForLeave.mutate(
      { leaveType, startDate: leaveStartDate, endDate: leaveEndDate, reason: leaveReason.trim() },
      {
        onSuccess: () => {
          setShowLeaveForm(false)
          setLeaveStartDate(''); setLeaveEndDate(''); setLeaveReason('')
        },
      },
    )
  }
  const [alertDays, setAlertDays]                              = useState(60)
  // Captured once on mount (a lazy initializer is allowed to be impure) so the
  // render stays pure — see react-hooks/purity. Only used for the "days left" label.
  const [nowMs] = useState(() => Date.now())
  // [FIX] Was useContractAlerts(alertDays) — an exact-day match (today + N) that
  // is empty on almost every visit. The HR dashboard's stat card/widget use the
  // range query (every contract expiring within the next N days); this tab and
  // its badge now read the same source so they always agree.
  const { data: contracts = [], isLoading: contractsLoading, isError: contractsError } = useUpcomingContractExpiries(alertDays)
  const reviewLeave = useReviewLeave()

  const [conflictPanel, setConflictPanel] = useState<{ staffName: string; result: ConflictCheckResult } | null>(null)

  const pendingLeave     = (pendingLeaveForBadge as ApiLeaveRequest[]).length
  const expiringContracts = (contracts as ApiContractAlert[]).length

  function handleReview(req: ApiLeaveRequest, status: 'APPROVED' | 'REJECTED') {
    reviewLeave.mutate(
      { id: req.id, data: { status } },
      {
        onSuccess: (res) => {
          if (status === 'APPROVED' && (res.conflictResult.hasBlockingConflicts || res.conflictResult.hasWarnings)) {
            setConflictPanel({
              staffName: req.staff ? `${req.staff.firstName} ${req.staff.lastName}` : 'This staff member',
              result: res.conflictResult,
            })
          }
        },
      }
    )
  }

  // Pre-filter by role then pass clean TabItem objects to ModuleTabs.
  // [R11] Loans is now the broadly-visible tab (hr.applyLoan is held by
  // nearly every non-admin staff role); Directory is the newly-restricted
  // one (hr.viewAnyProfile is admin/high_rank/hr only) — the inverse of
  // the pre-fix visibility.
  const TABS = [
    { id: 'directory' as Tab, label: 'Staff directory', icon: Users },
    { id: 'leave'     as Tab, label: 'Leave requests',  icon: Calendar,      badge: pendingLeave, badgeNoun: 'to review' },
    { id: 'loans'     as Tab, label: 'Loans',           icon: CreditCard                              },
    { id: 'mypay'     as Tab, label: 'My pay',          icon: Wallet                                  },
    { id: 'alerts'    as Tab, label: 'Contract alerts', icon: AlertTriangle, badge: expiringContracts, badgeNoun: 'expiring' },
  // [PRODUCTION FIX 2026-07-28] leave was HR-only, meaning no staff member
  // could even see the tab to submit a leave request — useApplyForLeave()
  // existed and worked, it just had zero UI consumers. Now visible to
  // everyone, same pattern as loans/mypay: self-service apply for anyone,
  // full manage/approve view for HR only (gated inside LeaveTab itself).
  ].filter((t) => t.id === 'loans' || t.id === 'mypay' || t.id === 'leave' || isHR)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">HR Management</h1>
        <p className="text-sm text-muted mt-0.5">
          Staff directory, leave, loans and contract management
        </p>
      </div>

      <ModuleSurface>
      {/* Mobile-scrollable tab navigation — C7 */}
      <ModuleTabs<Tab>
        tabs={TABS}
        active={tab}
        onChange={setTab}
        variant="underline"
        id="hr-tabs"
      />

      {/* ── Directory tab (admin/high_rank/hr only) ─────────────────────────── */}
      {tab === 'directory' && isHR && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or employee number…"
                className="
                  flex-1 min-w-0 max-w-sm border border-base rounded-xl
                  px-4 py-2.5 text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-teal/25
                "
              />
              <select
                value={deptFilter}
                onChange={(e) => { setDeptFilter(e.target.value); setTitleFilter('') }}
                className="border border-base rounded-xl px-3 py-2.5 text-sm bg-surface min-h-[44px]"
                aria-label="Filter by department"
              >
                <option value="">All departments</option>
                {filterDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select
                value={titleFilter}
                onChange={(e) => setTitleFilter(e.target.value)}
                disabled={!deptFilter}
                className="border border-base rounded-xl px-3 py-2.5 text-sm bg-surface min-h-[44px] disabled:opacity-50"
                aria-label="Filter by job title"
              >
                <option value="">All titles</option>
                {filterTitles.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* [NEW] List/grid view toggle for Staff Directory. */}
              <div
                role="group"
                aria-label="Staff directory view"
                className="flex items-center bg-surface border border-base rounded-xl p-1"
              >
                <button
                  type="button"
                  onClick={() => setDirectoryViewPersisted('grid')}
                  aria-pressed={directoryView === 'grid'}
                  aria-label="Grid view"
                  title="Grid view"
                  className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                    directoryView === 'grid'
                      ? 'bg-btn-brand text-btn-brand-fg'
                      : 'text-muted hover:text-body hover:bg-page'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setDirectoryViewPersisted('list')}
                  aria-pressed={directoryView === 'list'}
                  aria-label="List view"
                  title="List view"
                  className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                    directoryView === 'list'
                      ? 'bg-btn-brand text-btn-brand-fg'
                      : 'text-muted hover:text-body hover:bg-page'
                  }`}
                >
                  <List className="w-4 h-4" aria-hidden />
                </button>
              </div>
              {canCreateStaff && (
                <button
                  type="button"
                  onClick={() => setShowStaffForm(true)}
                  className="shrink-0 inline-flex items-center gap-2 bg-btn-brand text-btn-brand-fg rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-brand-teal-light min-h-11"
                >
                  <UserPlus className="w-4 h-4" aria-hidden />
                  Add staff
                </button>
              )}
            </div>
          </div>

          {showStaffForm && <StaffForm onClose={() => setShowStaffForm(false)} />}

          {staffLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-surface animate-pulse" />
              ))}
            </div>
          ) : directoryView === 'grid' ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(staff as ApiStaffProfile[]).map((s) => (
                <Link
                  key={s.id}
                  href={`/hr/${s.id}`}
                  className="app-tint rounded-xl p-4 flex items-center gap-3 text-left hover:bg-brand-teal/10 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-brand-navy/10 flex items-center justify-center text-brand-navy font-semibold text-sm shrink-0">
                    {s.firstName[0]}
                    {s.lastName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-body truncate">
                      {s.firstName} {s.lastName}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {s.jobTitle} · {s.department}
                    </p>
                    <span
                      className={`text-xs ${
                        s.status === 'ACTIVE'
                          ? 'text-status-success'
                          : 'text-status-warning'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden />
                </Link>
              ))}
            </div>
          ) : (
            // [NEW] List view — same records, one compact row per staff
            // member instead of a card, so more of the directory fits on
            // screen at once. Same navigation target and status styling
            // as the grid view; only the layout differs.
            <div className="divide-y divide-base overflow-hidden">
              {(staff as ApiStaffProfile[]).map((s) => (
                <Link
                  key={s.id}
                  href={`/hr/${s.id}`}
                  className="flex items-center gap-3 px-3 sm:px-4 py-3 min-h-11 text-left hover:bg-page active:bg-page transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-navy/10 flex items-center justify-center text-brand-navy font-semibold text-xs shrink-0">
                    {s.firstName[0]}
                    {s.lastName[0]}
                  </div>
                  {/* Stacked on phones (name over job title); side by side from
                      sm up. The fixed 160px name column used to leave the job
                      title ~0px wide on a 360px screen. */}
                  <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
                    <p className="font-semibold text-body truncate sm:w-40 sm:shrink-0">
                      {s.firstName} {s.lastName}
                    </p>
                    <p className="text-xs text-muted truncate sm:flex-1 sm:min-w-0">
                      {s.jobTitle} · {s.department}
                    </p>
                  </div>
                  <span
                    className={`text-xs shrink-0 ${
                      s.status === 'ACTIVE'
                        ? 'text-status-success'
                        : 'text-status-warning'
                    }`}
                  >
                    {s.status}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Leave requests tab ─────────────────────────────────────────────── */}
      {tab === 'leave' && (
        <div className="space-y-6">
          {/* Self-service — visible to everyone, mirrors the Loans tab's
              apply-for-loan pattern. */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading font-semibold text-body">My leave</h2>
              <button
                type="button"
                onClick={() => setShowLeaveForm((v) => !v)}
                className="inline-flex items-center gap-1.5 bg-btn-brand text-btn-brand-fg rounded-lg px-3.5 py-2 text-sm font-semibold hover:bg-brand-teal-light min-h-11"
              >
                {showLeaveForm ? 'Cancel' : 'Request Leave'}
              </button>
            </div>

            {showLeaveForm && (
              <div className="mb-4 pb-4 space-y-3 border-b border-base">
                <div className="grid sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="leave-type" className="text-xs text-muted mb-1 block">Leave type</label>
                    <select
                      id="leave-type"
                      value={leaveType}
                      onChange={(e) => setLeaveType(e.target.value as LeaveRequestInput['leaveType'])}
                      className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
                    >
                      {(leaveOptions.length > 0
                        ? leaveOptions
                        : [{ leaveType: 'ANNUAL', label: LEAVE_TYPE_LABELS.ANNUAL, remainingDays: null }]
                      ).map((o) => (
                        <option key={o.leaveType} value={o.leaveType}>
                          {o.label}{o.remainingDays !== null ? ` (${o.remainingDays} days left)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="leave-start" className="text-xs text-muted mb-1 block">Start date</label>
                    <input id="leave-start" type="date" value={leaveStartDate} onChange={(e) => setLeaveStartDate(e.target.value)}
                      className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
                  </div>
                  <div>
                    <label htmlFor="leave-end" className="text-xs text-muted mb-1 block">End date</label>
                    <input id="leave-end" type="date" value={leaveEndDate} onChange={(e) => setLeaveEndDate(e.target.value)} min={leaveStartDate || undefined}
                      className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11" />
                  </div>
                </div>
                {selectedLeave && (
                  <p className="text-xs text-muted">
                    <span className="font-semibold text-body">{selectedLeave.payNote}.</span>{' '}
                    {selectedLeave.maxDays !== null
                      ? `Up to ${selectedLeave.maxDays} working days.`
                      : 'No fixed limit; HR decides.'}
                    {leaveDatesOrder && requestedDays > 0 && ` This request is ${requestedDays} working day${requestedDays === 1 ? '' : 's'}.`}
                  </p>
                )}
                {leaveDateError && <p className="text-sm text-tone-coral">{leaveDateError}</p>}
                <div>
                  <label htmlFor="leave-reason" className="text-xs text-muted mb-1 block">Reason (at least 10 characters)</label>
                  <textarea id="leave-reason" rows={2} value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page" />
                </div>
                <button
                  type="button"
                  onClick={submitLeaveRequest}
                  disabled={applyForLeave.isPending || Boolean(leaveDateError)}
                  className="bg-brand-deep text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 min-h-11"
                >
                  {applyForLeave.isPending ? 'Submitting…' : 'Submit Request'}
                </button>
                {applyForLeave.isError && (
                  <p className="text-sm text-tone-coral">
                    {applyForLeave.error instanceof Error ? applyForLeave.error.message : 'Failed to submit leave request.'}
                  </p>
                )}
              </div>
            )}

            {/* This year's balances: annual, sick and emergency leave have a yearly allowance that does not carry over. */}
            {leaveOptions.some((o) => o.remainingDays !== null) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {leaveOptions.filter((o) => o.remainingDays !== null).map((o) => (
                  <span key={o.leaveType} className="app-tint rounded-lg px-3 py-1.5 text-xs text-body">
                    <span className="font-semibold">{o.label}:</span> {o.remainingDays} of {o.totalDays} days left
                  </span>
                ))}
              </div>
            )}

            {(myLeaveRequests as ApiLeaveRequest[]).length === 0 ? (
              <p className="text-sm text-muted">You haven&apos;t requested any leave yet.</p>
            ) : (
              <div className="space-y-2">
                {(myLeaveRequests as ApiLeaveRequest[]).map((req) => (
                  <div key={req.id} className="flex items-center justify-between border-b border-base py-2.5 last:border-b-0">
                    <div>
                      <p className="text-sm font-medium text-body">{LEAVE_TYPE_LABELS[req.leaveType as LeaveTypeKey] ?? req.leaveType} · {req.days} working day{req.days === 1 ? '' : 's'}</p>
                      <p className="text-xs text-muted">{new Date(req.startDate).toLocaleDateString()} – {new Date(req.endDate).toLocaleDateString()}{req.payNote ? ` · ${req.payNote}` : ''}</p>
                    </div>
                    <span className={`text-xs font-semibold ${
                      req.status === 'APPROVED' ? 'text-status-success'
                        : req.status === 'REJECTED' ? 'text-status-danger'
                        : 'text-status-warning'
                    }`}>
                      {req.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manage — HR only, unchanged from before */}
          {isHR && (
        <div className="space-y-3">
          {/* Who is away today. Driven by dates, not by request status, so it
              never depends on the filter below. */}
          <div className="border-b border-base pb-4 mb-2">
            <h2 className="font-heading font-semibold text-body mb-3">
              On leave today{onLeaveNow.length > 0 ? ` (${onLeaveNow.length})` : ''}
            </h2>
            {onLeaveNow.length === 0 ? (
              <p className="text-sm text-muted">Nobody is on leave today.</p>
            ) : (
              <div className="space-y-2">
                {onLeaveNow.map((p) => (
                  <div key={p.requestId} className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-body">{p.firstName} {p.lastName}</p>
                      <p className="text-xs text-muted">
                        {p.department} · {LEAVE_TYPE_LABELS[p.leaveType as LeaveTypeKey] ?? p.leaveType}
                      </p>
                    </div>
                    <p className="text-xs text-muted text-right">
                      Until {new Date(p.endDate).toLocaleDateString()}
                      <br />
                      Back {new Date(p.returnDate).toLocaleDateString()} · {p.daysLeft} working day{p.daysLeft === 1 ? '' : 's'} left
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-end">
            <select
              value={leaveStatusFilter}
              onChange={(e) => setLeaveStatusFilter(e.target.value as typeof leaveStatusFilter)}
              className="border border-base rounded-lg px-3 py-2 text-sm bg-surface min-h-[36px]"
              aria-label="Filter leave requests by status"
            >
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="">All statuses</option>
            </select>
          </div>
          {(leaveRequests as ApiLeaveRequest[]).length === 0 && (
            <div className="text-center py-16 text-muted text-sm">
              No {leaveStatusFilter ? leaveStatusFilter.toLowerCase() : ''} leave requests.
            </div>
          )}
          {(leaveRequests as ApiLeaveRequest[]).map((req) => (
            <div
              key={req.id}
              className="border-b border-base pb-4 last:border-b-0 flex items-center justify-between gap-4 flex-wrap"
            >
              <div>
                <p className="font-semibold text-body">
                  {req.staff?.firstName} {req.staff?.lastName}
                </p>
                <p className="text-sm text-muted">
                  {LEAVE_TYPE_LABELS[req.leaveType as LeaveTypeKey] ?? req.leaveType} · {req.days} working day{req.days === 1 ? '' : 's'} ·{' '}
                  {new Date(req.startDate).toLocaleDateString()} –{' '}
                  {new Date(req.endDate).toLocaleDateString()}
                </p>
                {req.payNote && <p className="text-xs text-muted mt-0.5">Pay: {req.payNote}</p>}
                <p className="text-xs text-muted mt-1">{req.reason}</p>
              </div>
              {req.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleReview(req, 'APPROVED')}
                    disabled={reviewLeave.isPending}
                    className="flex items-center gap-1 text-xs font-semibold border border-status-success/60 text-status-success px-3 py-1.5 rounded-lg hover:bg-status-success/10 transition-colors min-h-11 disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReview(req, 'REJECTED')}
                    disabled={reviewLeave.isPending}
                    className="flex items-center gap-1 text-xs font-semibold border border-status-danger/60 text-status-danger px-3 py-1.5 rounded-lg hover:bg-status-danger/10 transition-colors min-h-11 disabled:opacity-60"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              ) : (
                <span className={`text-xs font-semibold shrink-0 ${
                  req.status === 'APPROVED'
                    ? 'text-status-success'
                    : 'text-status-danger'
                }`}>
                  {req.status}
                </span>
              )}
            </div>
          ))}

          {/* [R11] Conflict analysis shown after an approval that surfaced one */}
          {conflictPanel && (
            <Modal
              title={<>Conflict Analysis: {conflictPanel.staffName}</>}
              onClose={() => setConflictPanel(null)}
              size="l"
            >
              <LeaveConflictWarning result={conflictPanel.result} />
            </Modal>
          )}
        </div>
          )}
        </div>
      )}

      {/* ── Loans tab ───────────────────────────────────────────────────────── */}
      {tab === 'loans' && (
        <LoansTab canApplyLoan={canApplyLoan} isHR={isHR} role={role} />
      )}

      {/* ── My Pay tab ────────────────────────────────────────────────────────
          [Payroll Runs & Approvals / My Pay redesign, user-requested]
          Mounts the shared Payroll workspace (same component as Finance's
          Payroll tab — see PayrollWorkspace.tsx's header comment) opening
          on My Pay (Self-Service). Visible to every staff role, same
          pattern as the Loans tab — this is a personal view, not a
          management one, so it is never gated behind isHR; a role holding
          hr.viewAnyPayslips/finance.viewPayrollRuns/etc additionally sees
          this entry point's other tabs (Payroll Runs & Approvals, Salary
          Structure & Allowances, ...) rather than only their own pay. */}
      {tab === 'mypay' && <PayrollWorkspace defaultTab="mypay" />}

      {/* ── Contract alerts tab ────────────────────────────────────────────── */}
      {tab === 'alerts' && isHR && (
        <div className="space-y-3">
          <div className="flex items-center justify-end">
            <label className="text-xs text-muted mr-2" htmlFor="alert-days">
              Show contracts expiring within
            </label>
            <select
              id="alert-days"
              value={alertDays}
              onChange={(e) => setAlertDays(Number(e.target.value))}
              className="border border-base rounded-lg px-2.5 py-1.5 text-sm bg-surface"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>

          {contractsLoading && (
            <div className="space-y-2" role="status" aria-label="Loading contract alerts">
              {[1, 2].map((i) => <div key={i} className="h-14 rounded-xl bg-page animate-pulse" />)}
            </div>
          )}

          {contractsError && !contractsLoading && (
            <p role="alert" className="text-center py-10 text-tone-coral text-sm">
              Could not load contract alerts. Please refresh and try again.
            </p>
          )}

          {!contractsLoading && !contractsError && (contracts as ApiContractAlert[]).length === 0 && (
            <div className="text-center py-16 text-muted text-sm">
              No contracts expiring in the next {alertDays} days.
            </div>
          )}
          {!contractsLoading && !contractsError && (contracts as ApiContractAlert[]).map((s) => {
            const daysLeft = Math.max(0, Math.ceil((new Date(s.contractExpiry).getTime() - nowMs) / 86_400_000))
            return (
              <div
                key={s.id}
                className="bg-status-warning/10 rounded-xl p-4 flex items-center gap-3"
              >
                <AlertTriangle className="w-5 h-5 text-status-warning shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-body">
                    {s.firstName} {s.lastName} - {s.department}
                  </p>
                  <p className="text-sm text-body">
                    Contract expires:{' '}
                    {new Date(s.contractExpiry).toLocaleDateString('en-MW')}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-tone-amber">
                  {daysLeft === 0 ? 'Today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
                </span>
              </div>
            )
          })}
        </div>
      )}
      </ModuleSurface>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LOANS TAB
// ─────────────────────────────────────────────────────────────────────────────

const LOAN_STATUS_COLORS: Record<string, string> = {
  PENDING:   'text-status-warning',
  APPROVED:  'text-status-info',
  DISBURSED: 'text-status-accent',
  REPAYING:  'text-status-success',
  SETTLED:   'text-status-success',
  REJECTED:  'text-status-danger',
}

// Only these two statuses count as "active": the money is out and not yet paid back.
const ACTIVE_LOAN_STATUSES: ReadonlyArray<ApiStaffLoan['status']> = ['DISBURSED', 'REPAYING']

function ActiveLoansView({ loans, isLoading }: { loans: ApiStaffLoan[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-surface animate-pulse" />)}
      </div>
    )
  }

  const active = loans
    .filter((l) => ACTIVE_LOAN_STATUSES.includes(l.status))
    .sort((a, b) => b.balance - a.balance)

  if (active.length === 0) {
    return (
      <div className="text-center py-16 text-muted text-sm">
        No active loans. A loan shows here once it is disbursed, until it is settled.
      </div>
    )
  }

  const sum = (pick: (l: ApiStaffLoan) => number) => active.reduce((n, l) => n + pick(l), 0)
  const totals = [
    { label: 'Staff with a loan',   value: String(active.length) },
    { label: 'Lent out',            value: formatMWK(sum((l) => l.amount)) },
    { label: 'Repaid so far',       value: formatMWK(sum((l) => l.totalRepaid)) },
    { label: 'Still owed',          value: formatMWK(sum((l) => l.balance)) },
    { label: 'Deducted each month', value: formatMWK(sum((l) => l.monthlyDeduction)) },
  ]

  return (
    <div>
      <dl className="grid grid-cols-2 sm:grid-cols-5 gap-x-6 gap-y-3 pb-4 border-b border-base">
        {totals.map((t) => (
          <div key={t.label}>
            <dt className="text-xs text-muted">{t.label}</dt>
            <dd className="font-heading font-semibold text-body tabular-nums">{t.value}</dd>
          </div>
        ))}
      </dl>

      <ul>
        {active.map((loan) => {
          const name = loan.staff ? `${loan.staff.firstName} ${loan.staff.lastName}` : loan.staffId
          const pct = loan.amount > 0 ? Math.min(100, Math.max(0, Math.round((loan.totalRepaid / loan.amount) * 100))) : 0
          return (
            <li key={loan.id} className="py-4 border-b border-base last:border-b-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-body">
                    {name}
                    {loan.staff && <span className="text-xs text-muted ml-2">({loan.staff.employeeNo})</span>}
                  </p>
                  {loan.staff?.department && <p className="text-xs text-muted">{loan.staff.department}</p>}
                </div>
                <span className={`text-xs font-semibold ${LOAN_STATUS_COLORS[loan.status] ?? ''}`}>
                  {statusWord(loan.status)}
                </span>
              </div>

              <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
                <div>
                  <dt className="text-xs text-muted">Loan amount</dt>
                  <dd className="text-sm font-semibold text-body tabular-nums">{formatMWK(loan.amount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Repaid so far</dt>
                  <dd className="text-sm font-semibold text-body tabular-nums">{formatMWK(loan.totalRepaid)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Balance</dt>
                  <dd className="text-sm font-semibold text-body tabular-nums">{formatMWK(loan.balance)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Monthly deduction</dt>
                  <dd className="text-sm font-semibold text-body tabular-nums">{formatMWK(loan.monthlyDeduction)}</dd>
                </div>
              </dl>

              <div className="mt-3 flex items-center gap-3">
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                  aria-label={`${name} has repaid ${pct}% of the loan`}
                  className="h-2 flex-1 rounded-full bg-page border border-base overflow-hidden"
                >
                  <div className="h-full bg-status-success" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-10 text-right text-xs text-muted tabular-nums">{pct}%</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LoansTab({
  canApplyLoan,
  isHR,
  role,
}: {
  canApplyLoan: boolean
  isHR:         boolean
  role:         string | null | undefined
}) {
  const canManage    = isHR || role === 'finance'
  const canApprove   = role === 'admin' || role === 'hr'
  const canDisburse  = role === 'admin' || role === 'finance'
  const canRepay     = role === 'admin' || role === 'finance' || role === 'hr'

  const [showRequestForm, setShowRequestForm] = useState(false)
  const [amount, setAmount]                   = useState('')
  const [monthlyDeduction, setMonthlyDeduction] = useState('')
  const [reason, setReason]                    = useState('')
  const [repayTargetId, setRepayTargetId]      = useState<string | null>(null)
  const [repayAmount, setRepayAmount]          = useState('')
  // [PRODUCTION FIX 2026-07-27] Manage Loan Requests previously fetched
  // every loan regardless of status in one flat list — useLoans() already
  // supported a status filter server-side, it just had no caller passing
  // one. '' = all statuses.
  const [loanStatusFilter, setLoanStatusFilter] = useState<'' | ApiStaffLoan['status']>('')

  const [loanView, setLoanView] = useState<'requests' | 'active'>('requests')

  const { data: loans = [], isLoading } = useLoans(loanStatusFilter || undefined)
  // Same query as the list above when no status is picked, so it costs no extra request then.
  const { data: allLoans = [], isLoading: allLoansLoading } = useLoans()
  const { data: myLoans = [], isLoading: myLoansLoading } = useMyLoans()
  const requestLoan    = useRequestLoan()
  const approveLoan    = useApproveLoan()
  const disburseLoan   = useDisburseLoan()
  const recordRepayment = useRecordLoanRepayment()

  function submitRequest() {
    if (!amount || !monthlyDeduction || reason.trim().length < 10) return
    requestLoan.mutate(
      { amount: Number(amount), monthlyDeduction: Number(monthlyDeduction), reason: reason.trim() },
      {
        onSuccess: () => {
          setShowRequestForm(false)
          setAmount('')
          setMonthlyDeduction('')
          setReason('')
        },
      }
    )
  }

  function submitRepayment() {
    if (!repayTargetId || !repayAmount) return
    recordRepayment.mutate(
      { loanId: repayTargetId, amount: Number(repayAmount) },
      { onSuccess: () => { setRepayTargetId(null); setRepayAmount('') } }
    )
  }

  return (
    <div className="space-y-6">
      {/* Request a Loan */}
      {canApplyLoan && (
        <div className="pb-5 border-b border-base">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-tone-teal" />
              <h2 className="font-heading font-semibold text-body">Request a loan</h2>
            </div>
            {!showRequestForm && (
              <button
                type="button"
                onClick={() => setShowRequestForm(true)}
                className="text-xs font-semibold text-tone-teal app-action min-h-11"
              >
                New request
              </button>
            )}
          </div>

          {showRequestForm && (
            <div className="mt-4 space-y-3 max-w-sm">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Amount (MWK)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-base rounded-lg px-3 py-2 text-sm"
                  placeholder="500000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Monthly deduction (MWK)</label>
                <input
                  type="number"
                  value={monthlyDeduction}
                  onChange={(e) => setMonthlyDeduction(e.target.value)}
                  className="w-full border border-base rounded-lg px-3 py-2 text-sm"
                  placeholder="50000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Reason</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full border border-base rounded-lg px-3 py-2 text-sm resize-none"
                  placeholder="At least 10 characters…"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRequestForm(false)}
                  className="flex-1 border border-base rounded-lg py-2 text-sm min-h-11"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitRequest}
                  disabled={requestLoan.isPending || !amount || !monthlyDeduction || reason.trim().length < 10}
                  className="flex-1 bg-btn-brand text-btn-brand-fg rounded-lg py-2 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 min-h-11"
                >
                  {requestLoan.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit request
                </button>
              </div>
              {requestLoan.isError && (
                <p className="text-xs text-tone-coral">
                  {requestLoan.error instanceof Error ? requestLoan.error.message : 'Failed to submit request.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* [POST-R11 follow-up] My Loan Status — a staff member who submits
          a request previously had no way to check on it afterward. */}
      {canApplyLoan && (
        <div>
          <h2 className="font-heading font-semibold text-body mb-3">My loan status</h2>
          {myLoansLoading ? (
            <div className="h-16 rounded-xl bg-surface animate-pulse" />
          ) : (myLoans as ApiStaffLoan[]).length === 0 ? (
            <div className="text-center py-10 text-muted text-sm">
              You have no loan requests on record.
            </div>
          ) : (
            <div className="space-y-2">
              {(myLoans as ApiStaffLoan[]).map((loan) => (
                <div
                  key={loan.id}
                  className="border-b border-base pb-4 last:border-b-0 flex items-center justify-between gap-4 flex-wrap"
                >
                  <div>
                    <p className="text-sm font-medium text-body">
                      {formatMWK(loan.amount)} requested {new Date(loan.createdAt).toLocaleDateString('en-GB')}
                    </p>
                    <p className="text-xs text-muted mt-0.5">{loan.reason}</p>
                    {(loan.status === 'DISBURSED' || loan.status === 'REPAYING') && (
                      <p className="text-xs text-muted mt-1">
                        Balance remaining: {formatMWK(loan.balance)} of {formatMWK(loan.amount)} · {formatMWK(loan.monthlyDeduction)}/mo
                      </p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ${LOAN_STATUS_COLORS[loan.status] ?? ''}`}>
                    {loan.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manage Loan Requests */}
      {canManage && (
        <div>
          <div className="flex gap-2 mb-4" role="group" aria-label="Loans view">
            {([['requests', 'Requests'], ['active', 'Active loans']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLoanView(key)}
                aria-pressed={loanView === key}
                className={[
                  'min-h-11 px-4 rounded-lg border text-sm font-semibold transition-colors',
                  loanView === key
                    ? 'bg-brand-deep text-white border-brand-navy'
                    : 'border-base text-muted hover:text-body hover:bg-page',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-heading font-semibold text-body">{loanView === 'active' ? 'Active loans' : 'Manage loan requests'}</h2>
            {loanView === 'requests' && <select
              value={loanStatusFilter}
              onChange={(e) => setLoanStatusFilter(e.target.value as '' | ApiStaffLoan['status'])}
              className="border border-base rounded-lg px-3 py-2 text-sm bg-surface min-h-[36px]"
              aria-label="Filter loans by status"
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="DISBURSED">Disbursed</option>
              <option value="REPAYING">Repaying</option>
              <option value="SETTLED">Settled</option>
              <option value="REJECTED">Rejected</option>
            </select>}
          </div>
          {loanView === 'active' ? (
            <ActiveLoansView loans={allLoans as ApiStaffLoan[]} isLoading={allLoansLoading} />
          ) : isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-surface animate-pulse" />)}
            </div>
          ) : (loans as ApiStaffLoan[]).length === 0 ? (
            <div className="text-center py-16 text-muted text-sm">
              No loan requests.
            </div>
          ) : (
            <div className="space-y-3">
              {(loans as ApiStaffLoan[]).map((loan) => (
                <div key={loan.id} className="border-b border-base pb-4 last:border-b-0">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-semibold text-body">
                        {loan.staff ? `${loan.staff.firstName} ${loan.staff.lastName}` : loan.staffId}
                        {loan.staff && <span className="text-xs text-muted ml-2">({loan.staff.employeeNo})</span>}
                      </p>
                      <p className="text-sm text-muted">
                        {formatMWK(loan.amount)} · {formatMWK(loan.monthlyDeduction)}/mo · Balance: {formatMWK(loan.balance)}
                      </p>
                      <p className="text-xs text-muted mt-1">{loan.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${LOAN_STATUS_COLORS[loan.status] ?? ''}`}>
                        {loan.status}
                      </span>
                      {loan.status === 'PENDING' && canApprove && (
                        <button
                          type="button"
                          onClick={() => approveLoan.mutate(loan.id)}
                          disabled={approveLoan.isPending}
                          className="text-xs font-semibold border border-status-success/60 text-status-success px-3 py-1.5 rounded-lg hover:bg-status-success/10 transition-colors min-h-11 disabled:opacity-60"
                        >
                          Approve
                        </button>
                      )}
                      {loan.status === 'APPROVED' && canDisburse && (
                        <button
                          type="button"
                          onClick={() => disburseLoan.mutate(loan.id)}
                          disabled={disburseLoan.isPending}
                          className="text-xs font-semibold border border-status-accent/60 text-status-accent px-3 py-1.5 rounded-lg hover:bg-status-accent/10 transition-colors min-h-11 disabled:opacity-60"
                        >
                          Disburse
                        </button>
                      )}
                      {(loan.status === 'DISBURSED' || loan.status === 'REPAYING') && canRepay && (
                        <button
                          type="button"
                          onClick={() => setRepayTargetId(loan.id)}
                          className="text-xs font-semibold border border-status-success/60 text-status-success px-3 py-1.5 rounded-lg hover:bg-status-success/10 transition-colors min-h-11"
                        >
                          Record repayment
                        </button>
                      )}
                    </div>
                  </div>

                  {repayTargetId === loan.id && (
                    <div className="mt-3 pt-3 border-t border-base flex items-center gap-2">
                      <input
                        type="number"
                        value={repayAmount}
                        onChange={(e) => setRepayAmount(e.target.value)}
                        placeholder="Repayment amount (MWK)"
                        className="flex-1 border border-base rounded-lg px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={submitRepayment}
                        disabled={recordRepayment.isPending || !repayAmount}
                        className="bg-btn-brand text-btn-brand-fg rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 min-h-11"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRepayTargetId(null); setRepayAmount('') }}
                        className="border border-base rounded-lg px-3 py-2 text-sm min-h-11"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!canApplyLoan && !canManage && (
        <div className="text-center py-16 text-muted text-sm">
          You do not have access to loan management.
        </div>
      )}
    </div>
  )
}
