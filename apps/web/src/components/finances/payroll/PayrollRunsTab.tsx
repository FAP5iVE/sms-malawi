'use client'

/**
 * apps/web/src/components/finances/payroll/PayrollRunsTab.tsx
 *
 * [CHANGE TYPE]: NEW FILE (supersedes the old PayrollTab.tsx's bare
 *   history-table-plus-one-button implementation, and folds in the
 *   previously-unmounted PayrollApprovalPanel.tsx's workflow actions —
 *   see that file's own header comment and PayrollWorkspace.tsx's for the
 *   full history)
 * [PURPOSE]: The Payroll Runs & Approvals tab (user-requested redesign).
 *   Current-cycle card with a real, enforced run window (Run Payroll is
 *   disabled and explains why outside the configured window — see
 *   payrollService.getPayrollRunWindow's header comment — and a month that
 *   has already been run can never be re-run, the @@unique([month,year])
 *   constraint's actual meaning made visible rather than just a 409 the
 *   button silently absorbs), the 4-step approval workflow stepper, the
 *   full run history with year/status/search filtering, and an "Inspect
 *   Payslips" drill-down against the new GET /payroll/:id route.
 * [DEPENDS ON]: usePayroll.ts (useRunWindowStatus/usePayrollHistory/
 *   usePayrollRunDetail/useRunPayroll/useSubmitPayrollForApproval/
 *   useApprovePayrollRun/useLockPayrollRun/useRollbackPayrollRun),
 *   payrollDisplay.ts, W/components/shared/{DataTable,ConfirmDialog}
 */

import { useMemo, useState } from 'react'
import {
  Search, ClipboardCheck, Lock, Undo2, Send, CheckCircle2,
  Loader2, AlertTriangle, X, Download, ShieldCheck,
} from 'lucide-react'
import { formatMWK } from '@shared/constants/malawi'
import type { ApiPayrollRun, ApiPayslip } from '@shared/types/api'
import { usePermissions } from '@/hooks/usePermissions'
import {
  usePayrollHistory, useRunWindowStatus, usePayrollRunDetail,
  useRunPayroll, useSubmitPayrollForApproval, useApprovePayrollRun,
  useLockPayrollRun, useRollbackPayrollRun, downloadPayslip,
} from '@/hooks/usePayroll'
import { DataTable, type DataColumn } from '@/components/shared/DataTable'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import {
  WORKFLOW_STEPS, getStatusMeta, formatRunPeriod, formatRunPeriodShort,
  formatWindowDate,
} from './payrollDisplay'

const NOW = new Date()
const CURRENT_MONTH = NOW.getMonth() + 1
const CURRENT_YEAR = NOW.getFullYear()
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2] as const

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW STEPPER
// ─────────────────────────────────────────────────────────────────────────────

function WorkflowStepper({ currentStep }: { currentStep: number | null }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {WORKFLOW_STEPS.map((s) => {
        const isCurrent = s.step === currentStep
        const isDone = currentStep !== null && s.step < currentStep
        return (
          <div
            key={s.key}
            className={[
              'rounded-xl border p-3',
              isCurrent ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-base bg-page',
            ].join(' ')}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={[
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-heading font-bold shrink-0',
                  isCurrent
                    ? 'bg-emerald-500 text-white'
                    : isDone
                      ? 'bg-brand-navy text-white'
                      : 'bg-base text-muted',
                ].join(' ')}
              >
                {isDone ? <CheckCircle2 className="w-3 h-3" aria-hidden /> : s.step}
              </span>
              <span className="text-xs font-heading font-semibold text-body">{s.label}</span>
            </div>
            <p className="text-[11px] text-muted leading-snug">{s.sublabel}</p>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLLBACK DIALOG — reason is required (payrollApprovalService.rollback
// rejects an empty one — see payroll.ts's POST /runs/:id/rollback)
// ─────────────────────────────────────────────────────────────────────────────

function RollbackDialog({
  open, onCancel, onConfirm, isPending,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
  isPending: boolean
}) {
  const [reason, setReason] = useState('')
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]" onClick={onCancel}>
      <div
        className="w-full max-w-sm bg-surface border border-base rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-brand-coral/10 flex items-center justify-center shrink-0">
            <Undo2 className="w-5 h-5 text-brand-coral" aria-hidden />
          </div>
          <div>
            <h2 className="font-heading font-bold text-base text-body">Rollback Locked Payroll</h2>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              This voids the posted journal entry and returns the run to Pending Approval. A reason is
              required for the audit trail.
            </p>
          </div>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this being rolled back?"
          rows={3}
          className="w-full border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-coral/25 resize-none"
        />
        <div className="flex items-center justify-end gap-2.5 mt-4">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] px-4 rounded-xl text-sm font-heading font-semibold border border-base text-muted hover:bg-page transition-colors">
            Cancel
          </button>
          <button
            type="button"
            disabled={!reason.trim() || isPending}
            onClick={() => onConfirm(reason.trim())}
            className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold text-white bg-brand-coral hover:bg-brand-coral/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Rollback Run
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYSLIP DRILL-DOWN — "Deep Inspection" / "Inspect Payslips"
// ─────────────────────────────────────────────────────────────────────────────

function RunDetailModal({ runId, onClose }: { runId: string; onClose: () => void }) {
  const { data: run, isLoading } = usePayrollRunDetail(runId)

  const columns: DataColumn<ApiPayslip>[] = [
    { key: 'staffName', label: 'Staff Member', priority: 'critical' },
    { key: 'grossSalary', label: 'Gross Pay', priority: 'important', render: (p) => formatMWK(p.grossSalary) },
    { key: 'paye', label: 'PAYE Tax', priority: 'important', render: (p) => <span className="text-brand-coral">-{formatMWK(p.paye)}</span> },
    { key: 'pension', label: 'Pension', priority: 'optional', render: (p) => <span className="text-brand-coral">-{formatMWK(p.pension)}</span> },
    { key: 'loanDeduction', label: 'Loan Ded.', priority: 'optional', render: (p) => p.loanDeduction > 0 ? <span className="text-brand-coral">-{formatMWK(p.loanDeduction)}</span> : <span className="text-muted">—</span> },
    { key: 'netSalary', label: 'Net Pay', priority: 'critical', render: (p) => <span className="font-semibold text-emerald-700">{formatMWK(p.netSalary)}</span> },
    {
      key: 'id', label: 'Payslip', priority: 'important',
      render: (p) => (
        <button
          type="button"
          onClick={() => downloadPayslip(p.id)}
          className="inline-flex items-center gap-1.5 text-xs font-heading font-semibold text-brand-navy hover:underline"
        >
          <Download className="w-3.5 h-3.5" aria-hidden /> View
        </button>
      ),
    },
  ]

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[85vh] overflow-y-auto bg-surface border border-base rounded-2xl shadow-xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="font-heading font-bold text-lg text-body">
              {run ? formatRunPeriod(run.month, run.year) : 'Payroll Run'} — Deep Inspection
            </h2>
            {run && (
              <p className="text-sm text-muted mt-1">
                {run._count?.payslips ?? run.payslips?.length ?? 0} staff •
                {' '}Gross {formatMWK(run.totalGross)} • Net {formatMWK(run.totalNet)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-page text-muted shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <DataTable
          data={run?.payslips ?? []}
          isLoading={isLoading}
          columns={columns}
          rowKey="id"
          emptyMessage="No payslip lines on this run."
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CURRENT CYCLE CARD
// ─────────────────────────────────────────────────────────────────────────────

function CurrentCycleCard({
  currentRun, onInspect,
}: {
  currentRun: ApiPayrollRun | undefined
  onInspect: () => void
}) {
  const { can } = usePermissions()
  const canRun = can('finance.runPayroll')
  const canApprove = can('finance.approvePayroll')
  const canLock = can('finance.lockPayroll')
  const canRollback = can('finance.rollbackPayroll')

  const { data: runWindow, isLoading: windowLoading } = useRunWindowStatus(CURRENT_MONTH, CURRENT_YEAR)
  const runMutation = useRunPayroll()
  const submitMutation = useSubmitPayrollForApproval()
  const approveMutation = useApprovePayrollRun()
  const lockMutation = useLockPayrollRun()
  const rollbackMutation = useRollbackPayrollRun()

  const [confirmAction, setConfirmAction] = useState<'run' | 'submit' | 'approve' | 'lock' | null>(null)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const status = currentRun?.status
  const meta = getStatusMeta(status ?? 'NONE')
  const staffCount = currentRun?._count?.payslips ?? runWindow?.enrolledStaffCount ?? 0

  function runAction<T>(mutate: () => Promise<T>) {
    setActionError(null)
    mutate()
      .catch((e: unknown) => setActionError(e instanceof Error ? e.message : 'Action failed'))
      .finally(() => setConfirmAction(null))
  }

  return (
    <div className="bg-surface border border-base rounded-2xl p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-brand-navy text-white flex items-center justify-center font-heading font-bold text-lg shrink-0">
            {String(CURRENT_MONTH).padStart(2, '0')}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-heading font-bold text-lg text-body">
                Current Cycle: {formatRunPeriod(CURRENT_MONTH, CURRENT_YEAR)}
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-heading font-semibold ${meta.badgeClassName}`}>
                {currentRun ? meta.badge : 'Not Started'}
              </span>
            </div>
            <p className="text-sm text-muted mt-1">
              {staffCount} Staff Members Enrolled
              {currentRun && (
                <> • Gross: <span className="tabular font-semibold text-body">{formatMWK(currentRun.totalGross)}</span>
                {' '}• Net Disbursable: <span className="tabular font-semibold text-body">{formatMWK(currentRun.totalNet)}</span></>
              )}
            </p>
          </div>
        </div>

        {currentRun && (
          <button type="button" onClick={onInspect}
            className="min-h-[40px] px-4 rounded-xl text-sm font-heading font-semibold border border-base text-body hover:bg-page transition-colors flex items-center gap-2 shrink-0">
            <ShieldCheck className="w-4 h-4" aria-hidden /> Deep Inspection
          </button>
        )}
      </div>

      {actionError && (
        <div className="flex items-center gap-2 bg-brand-coral/8 border border-brand-coral/25 rounded-xl px-4 py-3 text-sm text-brand-coral mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {actionError}
        </div>
      )}

      <div className="bg-page rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-sm font-heading font-semibold text-body">Workflow Status</p>
            <p className="text-xs text-muted mt-0.5">
              {!currentRun
                ? 'Payroll for this month has not been run yet.'
                : status === 'COMPLETED'
                  ? 'Payroll calculations verified. Ready for Finance submission.'
                  : status === 'PENDING_APPROVAL'
                    ? 'Awaiting High Rank approval.'
                    : status === 'APPROVED'
                      ? 'Approved — ready to lock and post the journal entry.'
                      : status === 'LOCKED'
                        ? 'Locked and posted. This month is permanently closed.'
                        : ''}
            </p>
          </div>
          {currentRun && (
            <button type="button" onClick={onInspect}
              className="min-h-[36px] px-3.5 rounded-lg text-xs font-heading font-semibold border border-base text-body hover:bg-surface transition-colors">
              Inspect Payslips ({staffCount})
            </button>
          )}
        </div>
        <WorkflowStepper currentStep={meta.step} />
      </div>

      {/* Primary action for the current cycle */}
      <div className="flex flex-wrap items-center gap-3">
        {!currentRun && canRun && (
          <>
            <button
              type="button"
              disabled={!runWindow?.isOpen || windowLoading}
              onClick={() => setConfirmAction('run')}
              className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold text-white bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {runMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Run {formatRunPeriodShort(CURRENT_MONTH, CURRENT_YEAR)} Payroll
            </button>
            {runWindow && !runWindow.isOpen && (
              <p className="text-xs text-muted">
                Run window {new Date() < new Date(runWindow.opensAt) ? 'opens' : 'closed'} {formatWindowDate(runWindow.opensAt)}
                {' '}– {formatWindowDate(runWindow.closesAt)}.
              </p>
            )}
          </>
        )}

        {currentRun?.status === 'COMPLETED' && canRun && (
          <button type="button" onClick={() => setConfirmAction('submit')}
            className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold text-white bg-brand-navy hover:bg-brand-navy/90 transition-colors flex items-center gap-2">
            {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <Send className="w-4 h-4" aria-hidden /> Submit for Approval
          </button>
        )}

        {currentRun?.status === 'PENDING_APPROVAL' && canApprove && (
          <button type="button" onClick={() => setConfirmAction('approve')}
            className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors flex items-center gap-2">
            {approveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <ClipboardCheck className="w-4 h-4" aria-hidden /> Approve Payroll
          </button>
        )}
        {currentRun?.status === 'PENDING_APPROVAL' && !canApprove && (
          <p className="text-xs text-muted">Awaiting approval from a High Rank staff member.</p>
        )}

        {currentRun?.status === 'APPROVED' && canLock && (
          <button type="button" onClick={() => setConfirmAction('lock')}
            className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold text-white bg-brand-navy hover:bg-brand-navy/90 transition-colors flex items-center gap-2">
            {lockMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <Lock className="w-4 h-4" aria-hidden /> Lock &amp; Post Journal
          </button>
        )}

        {currentRun?.status === 'LOCKED' && canRollback && (
          <button type="button" onClick={() => setRollbackOpen(true)}
            className="min-h-[44px] px-4 rounded-xl text-sm font-heading font-semibold border border-brand-coral/30 text-brand-coral hover:bg-brand-coral/5 transition-colors flex items-center gap-2">
            <Undo2 className="w-4 h-4" aria-hidden /> Rollback
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmAction === 'run'}
        title={`Run ${formatRunPeriod(CURRENT_MONTH, CURRENT_YEAR)} Payroll?`}
        description="This calculates salaries, PAYE, and pension for every enrolled staff member. Once run, this month is locked and cannot be run again."
        confirmLabel="Run Payroll"
        onConfirm={() => runAction(() => runMutation.mutateAsync({ month: CURRENT_MONTH, year: CURRENT_YEAR }))}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'submit'}
        title="Submit for Approval?"
        description="Sends this run to a High Rank staff member for approval. You won't be able to edit salary structures affecting this run once approved."
        confirmLabel="Submit"
        onConfirm={() => currentRun && runAction(() => submitMutation.mutateAsync(currentRun.id))}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'approve'}
        title="Approve This Payroll Run?"
        description="Confirms the calculated amounts are correct and clears the run for Finance to lock and post."
        confirmLabel="Approve"
        onConfirm={() => currentRun && runAction(() => approveMutation.mutateAsync(currentRun.id))}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'lock'}
        title="Lock & Post Journal Entry?"
        description="Posts the payroll journal entry to the accounting ledger and permanently locks this month. This cannot be undone without a rollback."
        confirmLabel="Lock & Post"
        destructive
        onConfirm={() => currentRun && runAction(() => lockMutation.mutateAsync(currentRun.id))}
        onCancel={() => setConfirmAction(null)}
      />
      <RollbackDialog
        open={rollbackOpen}
        isPending={rollbackMutation.isPending}
        onCancel={() => setRollbackOpen(false)}
        onConfirm={(reason) => {
          if (!currentRun) return
          setActionError(null)
          rollbackMutation.mutateAsync({ runId: currentRun.id, reason })
            .catch((e: unknown) => setActionError(e instanceof Error ? e.message : 'Rollback failed'))
            .finally(() => setRollbackOpen(false))
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY TABLE
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['COMPLETED', 'PENDING_APPROVAL', 'APPROVED', 'LOCKED'] as const

export function PayrollRunsTab() {
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState<'all' | number>(CURRENT_YEAR)
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all')
  const [inspectRunId, setInspectRunId] = useState<string | null>(null)

  // Fixed set of hook calls (rules-of-hooks) covering the last 3 years —
  // enough for "All Years" on a real school's payroll history without an
  // unbounded fan-out of queries for an "All Years" that could otherwise
  // mean "every year since the system went live".
  const y0 = usePayrollHistory(YEAR_OPTIONS[0])
  const y1 = usePayrollHistory(YEAR_OPTIONS[1])
  const y2 = usePayrollHistory(YEAR_OPTIONS[2])

  const currentRun = y0.data?.find((r) => r.month === CURRENT_MONTH)

  const allRuns = useMemo(
    () => [...(y0.data ?? []), ...(y1.data ?? []), ...(y2.data ?? [])],
    [y0.data, y1.data, y2.data],
  )
  const yearRuns = yearFilter === 'all'
    ? allRuns
    : yearFilter === YEAR_OPTIONS[0] ? (y0.data ?? [])
    : yearFilter === YEAR_OPTIONS[1] ? (y1.data ?? [])
    : (y2.data ?? [])

  const filteredRuns = yearRuns.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const haystack = `${formatRunPeriod(r.month, r.year)} ${r.runByName ?? ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const columns: DataColumn<ApiPayrollRun>[] = [
    {
      key: 'month', label: 'Pay Period', priority: 'critical', sortable: true,
      render: (r) => (
        <div>
          <p className="font-heading font-semibold text-body">{formatRunPeriod(r.month, r.year)}</p>
          {r.runByName && <p className="text-xs text-muted mt-0.5">Run by {r.runByName}</p>}
        </div>
      ),
    },
    {
      key: 'status', label: 'Status', priority: 'critical',
      render: (r) => {
        const meta = getStatusMeta(r.status)
        return <span className={`px-2.5 py-0.5 rounded-full text-xs font-heading font-semibold whitespace-nowrap ${meta.badgeClassName}`}>{meta.badge}</span>
      },
    },
    { key: '_count', label: 'Staff', priority: 'optional', render: (r) => r._count?.payslips ?? '—' },
    { key: 'totalGross', label: 'Total Gross', priority: 'important', render: (r) => formatMWK(r.totalGross) },
    { key: 'totalPaye', label: 'PAYE Withholding', priority: 'optional', render: (r) => r.totalPaye !== undefined ? <span className="text-brand-coral">-{formatMWK(r.totalPaye)}</span> : '—' },
    { key: 'totalPension', label: 'Pension', priority: 'optional', render: (r) => r.totalPension !== undefined ? <span className="text-brand-coral">-{formatMWK(r.totalPension)}</span> : '—' },
    { key: 'totalNet', label: 'Net Payable', priority: 'critical', render: (r) => <span className="font-semibold text-emerald-700">{formatMWK(r.totalNet)}</span> },
    {
      key: 'id', label: 'Actions', priority: 'critical',
      render: (r) => (
        <button type="button" onClick={() => setInspectRunId(r.id)}
          className="min-h-[36px] px-3 rounded-lg text-xs font-heading font-semibold border border-base text-body hover:bg-page transition-colors whitespace-nowrap">
          Inspect
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <CurrentCycleCard currentRun={currentRun} onInspect={() => currentRun && setInspectRunId(currentRun.id)} />

      <div className="bg-surface border border-base rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-heading font-bold text-body">Payroll Runs History &amp; Ledger Records</h3>
            <p className="text-sm text-muted mt-0.5">Comprehensive registry of all monthly payroll batches, statutory remittances, and approval statuses.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search run, month…"
                className="min-h-[40px] pl-9 pr-3 rounded-xl text-sm border border-base bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25 w-44"
              />
            </div>
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="min-h-[40px] px-3 rounded-xl text-sm border border-base bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            >
              <option value="all">All Years</option>
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl text-sm border border-base bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            >
              <option value="all">All Statuses</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{getStatusMeta(s).badge}</option>)}
            </select>
          </div>
        </div>

        <DataTable
          data={filteredRuns}
          isLoading={y0.isLoading || (yearFilter === 'all' && (y1.isLoading || y2.isLoading))}
          columns={columns}
          rowKey="id"
          emptyMessage="No payroll runs match these filters."
        />
      </div>

      {inspectRunId && <RunDetailModal runId={inspectRunId} onClose={() => setInspectRunId(null)} />}
    </div>
  )
}
