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

import { useState, useEffect } from 'react'
import { RoleGuard }        from '@/components/shared/RoleGuard'
import { useAuthStore }     from '@/store/authStore'
import { usePermissions }   from '@/hooks/usePermissions'
import {
  useStaffDirectory,
  useLeaveRequests,
  useContractAlerts,
  useReviewLeave,
  useRequestLoan,
  useLoans,
  useMyLoans,
  useApproveLoan,
  useDisburseLoan,
  useRecordLoanRepayment,
}                           from '@/hooks/useHR'
import { LeaveConflictWarning } from '@/components/hr/LeaveConflictWarning'
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
  X,
}                           from 'lucide-react'
import { ModuleTabs }       from '@/components/shared/ModuleTabs'
import { formatMWK }        from '@shared/constants/malawi'
import type { ApiStaffProfile, ApiLeaveRequest, ApiContractAlert, ApiStaffLoan } from '@shared/types/api'

/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Initialises the active tab from ?tab= (post-hydration) so
 *   HRDashboard's corrected quick actions can deep-link — /hr/leave and
 *   /hr/staff/new never existed as routes.
 */
type Tab = 'directory' | 'leave' | 'loans' | 'alerts'

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
      <HRContent />
    </RoleGuard>
  )
}

function HRContent() {
  const { role }  = useAuthStore()
  const { can }   = usePermissions()
  const [tab, setTab]         = useState<Tab>('loans')
  const [search, setSearch]   = useState('')

  // R15 — initialise the active tab from ?tab= so HRDashboard's corrected
  // quick actions (/hr?tab=leave, /hr?tab=directory) can deep-link. Runs
  // once post-hydration; the staff-only tabs are gated further down by the
  // same isHR checks that gate their tab buttons.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    const valid: Tab[] = ['directory', 'leave', 'loans', 'alerts']
    if (t && (valid as string[]).includes(t)) setTab(t as Tab)
  }, [])
  const isHR         = ['admin', 'hr', 'high_rank'].includes(role ?? '')
  const canApplyLoan = can('hr.applyLoan')

  const { data: staff = [],          isLoading: staffLoading } = useStaffDirectory({ search })
  const { data: leaveRequests = [] }                           = useLeaveRequests({ status: 'PENDING' })
  const [alertDays, setAlertDays]                              = useState(60)
  const { data: contracts = [] }                               = useContractAlerts(alertDays)
  const reviewLeave = useReviewLeave()

  const [conflictPanel, setConflictPanel] = useState<{ staffName: string; result: ConflictCheckResult } | null>(null)

  const pendingLeave     = (leaveRequests as ApiLeaveRequest[]).length
  const expiringContracts = (contracts   as ApiContractAlert[]).length

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
    { id: 'directory' as Tab, label: 'Staff Directory', icon: Users },
    { id: 'leave'     as Tab, label: 'Leave Requests',  icon: Calendar,      badge: pendingLeave      },
    { id: 'loans'     as Tab, label: 'Loans',           icon: CreditCard                              },
    { id: 'alerts'    as Tab, label: 'Contract Alerts', icon: AlertTriangle, badge: expiringContracts },
  ].filter((t) => t.id === 'loans' || isHR)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">HR Management</h1>
        <p className="text-sm text-muted mt-0.5">
          Staff directory, leave, loans and contract management
        </p>
      </div>

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
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or employee number…"
            className="
              w-full max-w-sm border border-base rounded-xl
              px-4 py-2.5 text-sm
              focus:outline-none focus:ring-2 focus:ring-brand-teal/25
            "
          />

          {staffLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-surface animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(staff as ApiStaffProfile[]).map((s) => (
                <div
                  key={s.id}
                  className="bg-surface border border-base rounded-xl p-4 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-brand-navy/10 flex items-center justify-center text-brand-navy font-semibold text-sm shrink-0">
                    {s.firstName[0]}
                    {s.lastName[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-body truncate">
                      {s.firstName} {s.lastName}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {s.jobTitle} · {s.department}
                    </p>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        s.status === 'ACTIVE'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Leave requests tab ─────────────────────────────────────────────── */}
      {tab === 'leave' && isHR && (
        <div className="space-y-3">
          {(leaveRequests as ApiLeaveRequest[]).length === 0 && (
            <div className="text-center py-16 text-muted text-sm border border-base rounded-xl">
              No pending leave requests.
            </div>
          )}
          {(leaveRequests as ApiLeaveRequest[]).map((req) => (
            <div
              key={req.id}
              className="bg-surface border border-base rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap"
            >
              <div>
                <p className="font-semibold text-body">
                  {req.staff?.firstName} {req.staff?.lastName}
                </p>
                <p className="text-sm text-muted">
                  {req.leaveType} · {req.days} day(s) ·{' '}
                  {new Date(req.startDate).toLocaleDateString()} –{' '}
                  {new Date(req.endDate).toLocaleDateString()}
                </p>
                <p className="text-xs text-muted mt-1">{req.reason}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleReview(req, 'APPROVED')}
                  disabled={reviewLeave.isPending}
                  className="flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 min-h-[44px] disabled:opacity-60"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => handleReview(req, 'REJECTED')}
                  disabled={reviewLeave.isPending}
                  className="flex items-center gap-1 text-xs bg-brand-coral/10 text-brand-coral border border-brand-coral/20 px-3 py-1.5 rounded-lg hover:bg-brand-coral/20 min-h-[44px] disabled:opacity-60"
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            </div>
          ))}

          {/* [R11] Conflict analysis shown after an approval that surfaced one */}
          {conflictPanel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-lg bg-page rounded-2xl shadow-xl p-5 space-y-3 max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-semibold text-body">
                    Conflict Analysis — {conflictPanel.staffName}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setConflictPanel(null)}
                    aria-label="Close"
                    className="p-1.5 rounded-lg hover:bg-surface min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-muted" />
                  </button>
                </div>
                <LeaveConflictWarning result={conflictPanel.result} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Loans tab ───────────────────────────────────────────────────────── */}
      {tab === 'loans' && (
        <LoansTab canApplyLoan={canApplyLoan} isHR={isHR} role={role} />
      )}

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

          {(contracts as ApiContractAlert[]).length === 0 && (
            <div className="text-center py-16 text-muted text-sm border border-base rounded-xl">
              No contracts expiring in the next {alertDays} days.
            </div>
          )}
          {(contracts as ApiContractAlert[]).map((s) => (
            <div
              key={s.id}
              className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-semibold text-amber-900">
                  {s.firstName} {s.lastName} — {s.department}
                </p>
                <p className="text-sm text-amber-700">
                  Contract expires:{' '}
                  {new Date(s.contractExpiry).toLocaleDateString('en-MW')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LOANS TAB
// ─────────────────────────────────────────────────────────────────────────────

const LOAN_STATUS_COLORS: Record<string, string> = {
  PENDING:   'bg-brand-amber/10 text-brand-amber border-brand-amber/25',
  APPROVED:  'bg-blue-50 text-blue-700 border-blue-200',
  DISBURSED: 'bg-purple-50 text-purple-700 border-purple-200',
  REPAYING:  'bg-brand-teal/10 text-brand-teal border-brand-teal/25',
  SETTLED:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED:  'bg-brand-coral/10 text-brand-coral border-brand-coral/25',
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

  const { data: loans = [], isLoading } = useLoans()
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
        <div className="bg-surface border border-base rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-brand-teal" />
              <h2 className="font-heading font-semibold text-body">Request a Loan</h2>
            </div>
            {!showRequestForm && (
              <button
                type="button"
                onClick={() => setShowRequestForm(true)}
                className="text-xs font-semibold text-brand-teal hover:underline min-h-[44px]"
              >
                New Request
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
                  placeholder="e.g. 500000"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Monthly Deduction (MWK)</label>
                <input
                  type="number"
                  value={monthlyDeduction}
                  onChange={(e) => setMonthlyDeduction(e.target.value)}
                  className="w-full border border-base rounded-lg px-3 py-2 text-sm"
                  placeholder="e.g. 50000"
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
                  className="flex-1 border border-base rounded-lg py-2 text-sm min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitRequest}
                  disabled={requestLoan.isPending || !amount || !monthlyDeduction || reason.trim().length < 10}
                  className="flex-1 bg-brand-teal text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 min-h-[44px]"
                >
                  {requestLoan.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Request
                </button>
              </div>
              {requestLoan.isError && (
                <p className="text-xs text-brand-coral">
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
          <h2 className="font-heading font-semibold text-body mb-3">My Loan Status</h2>
          {myLoansLoading ? (
            <div className="h-16 rounded-xl bg-surface animate-pulse" />
          ) : (myLoans as ApiStaffLoan[]).length === 0 ? (
            <div className="text-center py-10 text-muted text-sm border border-base rounded-xl">
              You have no loan requests on record.
            </div>
          ) : (
            <div className="space-y-2">
              {(myLoans as ApiStaffLoan[]).map((loan) => (
                <div
                  key={loan.id}
                  className="bg-surface border border-base rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap"
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
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${LOAN_STATUS_COLORS[loan.status] ?? ''}`}>
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
          <h2 className="font-heading font-semibold text-body mb-3">Manage Loan Requests</h2>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-surface animate-pulse" />)}
            </div>
          ) : (loans as ApiStaffLoan[]).length === 0 ? (
            <div className="text-center py-16 text-muted text-sm border border-base rounded-xl">
              No loan requests.
            </div>
          ) : (
            <div className="space-y-3">
              {(loans as ApiStaffLoan[]).map((loan) => (
                <div key={loan.id} className="bg-surface border border-base rounded-xl p-4">
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
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${LOAN_STATUS_COLORS[loan.status] ?? ''}`}>
                        {loan.status}
                      </span>
                      {loan.status === 'PENDING' && canApprove && (
                        <button
                          type="button"
                          onClick={() => approveLoan.mutate(loan.id)}
                          disabled={approveLoan.isPending}
                          className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 min-h-[44px] disabled:opacity-60"
                        >
                          Approve
                        </button>
                      )}
                      {loan.status === 'APPROVED' && canDisburse && (
                        <button
                          type="button"
                          onClick={() => disburseLoan.mutate(loan.id)}
                          disabled={disburseLoan.isPending}
                          className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-lg hover:bg-purple-100 min-h-[44px] disabled:opacity-60"
                        >
                          Disburse
                        </button>
                      )}
                      {(loan.status === 'DISBURSED' || loan.status === 'REPAYING') && canRepay && (
                        <button
                          type="button"
                          onClick={() => setRepayTargetId(loan.id)}
                          className="text-xs bg-brand-teal/10 text-brand-teal border border-brand-teal/25 px-3 py-1.5 rounded-lg hover:bg-brand-teal/20 min-h-[44px]"
                        >
                          Record Repayment
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
                        className="bg-brand-teal text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 min-h-[44px]"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRepayTargetId(null); setRepayAmount('') }}
                        className="border border-base rounded-lg px-3 py-2 text-sm min-h-[44px]"
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
        <div className="text-center py-16 text-muted text-sm border border-base rounded-xl">
          You do not have access to loan management.
        </div>
      )}
    </div>
  )
}
