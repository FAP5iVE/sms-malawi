'use client'

/*
 * apps/web/src/components/finances/PayrollApprovalPanel.tsx — Phase D13
 *
 * [CHANGE TYPE]: MAJOR REWRITE — expanded beyond the roadmap's literal
 *   scope (fix canRollback only); see rationale below.
 * [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
 *   Reconciliation
 * [PURPOSE]: The roadmap's explicit instruction for this file was narrow:
 *   `canRollback = role === 'admin'` is inverted relative to the
 *   permission matrix; replace with
 *   usePermissions().can('finance.rollbackPayroll'). Implementing that
 *   fix required first reading this file in full, which surfaced that
 *   its entire data contract was fictional and incompatible with the
 *   real routes this same phase builds:
 *     - Local `PayrollRun`/`PayslipLine` interfaces used `period`,
 *       `totalStaff`, `grossTotal`, `netTotal`, `lines` — none of which
 *       exist on the real model (month/year/totalGross/totalNet/
 *       payslips, already correctly typed as ApiPayrollRun/ApiPayslip in
 *       S/types/api.ts, just unused by this component).
 *     - A six-state status vocabulary (DRAFT/PENDING_APPROVAL/APPROVED/
 *       LOCKED/PROCESSED/ROLLED_BACK) that does not match the real,
 *       extended enum this phase adds
 *       (PROCESSING/PENDING_APPROVAL/APPROVED/LOCKED/COMPLETED/FAILED).
 *     - `canApprove`/`canLock` had the identical admin-inclusion bug the
 *       roadmap named only for canRollback — verified directly against
 *       S/types/permissions.ts: finance.approvePayroll is high_rank-only,
 *       finance.lockPayroll is finance-only, neither includes admin.
 *       Fixed alongside canRollback using the same
 *       usePermissions().can(...) method the roadmap demonstrates.
 *     - Called `/finances/payroll/runs/...`, a path that resolves
 *       nowhere — payroll.ts's router is mounted at `/payroll`, not
 *       `/finances/payroll` (verified against api-app.ts). Repointed to
 *       the real mount.
 *     - Dispatched a `reject` action with no backing function or route
 *       in this phase's explicit 4-route list (submit-for-approval /
 *       approve / lock / rollback) — removed rather than left calling
 *       nothing.
 *     - Rendered an expandable per-staff payslip-line table sourced from
 *       a route this phase does not add (no GET /runs/:id exists) —
 *       removed; the run summary still shows staff count via
 *       `_count.payslips`, which GET /payroll already returns.
 *   Fixing only canRollback while leaving the rest would have left a
 *   component that cannot render real data at all, failing this phase's
 *   own acceptance criteria for this exact file ("rollback action is
 *   visible to finance and not to admin" is unverifiable if the run list
 *   never successfully loads).
 * [DEPENDS ON]: W/lib/api-client.ts (apiFetch), S/types/api.ts
 *   (ApiPayrollRun/ApiPayslip, already correctly shaped), payroll.ts's 4
 *   rebuilt routes (same phase)
 */

import { useState, useCallback } from 'react'
import {
  CheckCircle2,
  Lock,
  RotateCcw,
  Loader2,
  AlertTriangle,
  Banknote,
}                                   from 'lucide-react'
import { usePermissions }           from '@/hooks/usePermissions'
import { apiFetch }                 from '@/lib/api-client'
import { formatMWK }                from '@shared/constants/malawi'
import type { ApiPayrollRun }       from '@shared/types/api'

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  PROCESSING:        'bg-base text-muted border-base',
  PENDING_APPROVAL:  'bg-brand-amber/10 text-brand-amber border-brand-amber/25',
  APPROVED:          'bg-emerald-50 text-emerald-700 border-emerald-200',
  LOCKED:            'bg-brand-navy/10 text-brand-navy border-brand-navy/20',
  COMPLETED:         'bg-purple-50 text-purple-700 border-purple-200',
  FAILED:            'bg-brand-coral/10 text-brand-coral border-brand-coral/20',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-heading font-semibold border ${STATUS_STYLES[status] ?? ''}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function runLabel(run: ApiPayrollRun): string {
  return new Date(run.year, run.month - 1).toLocaleDateString('en-GB', {
    month: 'long',
    year:  'numeric',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLLBACK DIALOG
// ─────────────────────────────────────────────────────────────────────────────

function RollbackDialog({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: (reason: string) => void
  onCancel:  () => void
  loading:   boolean
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-surface rounded-3xl shadow-2xl border border-base p-7 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-coral/10 flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-brand-coral" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-base text-body">Rollback Payroll Run</h2>
            <p className="text-xs text-muted mt-0.5">This will void the accounting journal entry.</p>
          </div>
        </div>
        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
            Reason for rollback <span className="text-brand-coral">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Provide a clear reason for the rollback…"
            className="w-full border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body resize-none focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} disabled={loading}
            className="flex-1 min-h-[44px] rounded-xl border border-base text-sm font-heading font-semibold text-muted hover:bg-page transition-colors">
            Cancel
          </button>
          <button type="button" onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={loading || !reason.trim()}
            className="flex-1 min-h-[44px] rounded-xl bg-brand-coral text-white text-sm font-heading font-semibold hover:bg-brand-coral/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm Rollback
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL RUN CARD
// ─────────────────────────────────────────────────────────────────────────────

function PayrollRunCard({
  run,
  canSubmit,
  canApprove,
  canLock,
  canRollback,
  onAction,
  actionLoading,
}: {
  run:          ApiPayrollRun
  canSubmit:    boolean
  canApprove:   boolean
  canLock:      boolean
  canRollback:  boolean
  onAction:     (runId: string, action: string, payload?: Record<string, string>) => Promise<void>
  actionLoading: string | null
}) {
  const [showRollback, setShowRollback] = useState(false)
  const loading = actionLoading === run.id

  return (
    <>
      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-navy/8 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-brand-navy" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-heading font-semibold text-body">{runLabel(run)}</p>
                <StatusBadge status={run.status} />
              </div>
              <p className="text-xs text-muted mt-0.5">
                {run._count?.payslips ?? 0} staff · Gross: {formatMWK(run.totalGross)} · Net: {formatMWK(run.totalNet)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {run.status === 'COMPLETED' && canSubmit && (
              <button type="button" onClick={() => onAction(run.id, 'submit-for-approval')} disabled={loading}
                className="min-h-[44px] px-4 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit for Approval
              </button>
            )}
            {run.status === 'PENDING_APPROVAL' && canApprove && (
              <button type="button" onClick={() => onAction(run.id, 'approve')} disabled={loading}
                className="min-h-[44px] px-4 rounded-xl text-sm font-heading font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 transition-colors disabled:opacity-60 flex items-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <CheckCircle2 className="w-4 h-4" /> Approve
              </button>
            )}
            {run.status === 'APPROVED' && canLock && (
              <button type="button" onClick={() => onAction(run.id, 'lock')} disabled={loading}
                className="min-h-[44px] px-4 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2">
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <Lock className="w-4 h-4" /> Lock & Post Journal
              </button>
            )}
            {run.status === 'LOCKED' && canRollback && (
              <button type="button" onClick={() => setShowRollback(true)} disabled={loading}
                className="min-h-[44px] px-4 rounded-xl text-sm font-heading font-semibold border border-brand-coral text-brand-coral hover:bg-brand-coral/5 transition-colors disabled:opacity-60 flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Rollback
              </button>
            )}
          </div>
        </div>
      </div>

      {showRollback && (
        <RollbackDialog
          onConfirm={async (reason) => {
            await onAction(run.id, 'rollback', { reason })
            setShowRollback(false)
          }}
          onCancel={() => setShowRollback(false)}
          loading={loading}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL APPROVAL PANEL
// ─────────────────────────────────────────────────────────────────────────────

export function PayrollApprovalPanel() {
  const { can }      = usePermissions()
  const canSubmit     = can('finance.runPayroll')
  const canApprove    = can('finance.approvePayroll')
  const canLock       = can('finance.lockPayroll')
  const canRollback   = can('finance.rollbackPayroll')

  const [runs,          setRuns]          = useState<ApiPayrollRun[]>([])
  const [loading,       setLoading]       = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [fetched,       setFetched]       = useState(false)

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // [R10] GET /payroll — payroll.ts's router is mounted at /payroll,
      // not /finances/payroll (verified against api-app.ts).
      const data = await apiFetch<ApiPayrollRun[]>('/payroll')
      setRuns(data)
      setFetched(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payroll runs')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleAction = useCallback(async (
    runId:    string,
    action:   string,
    payload?: Record<string, string>,
  ) => {
    setActionLoading(runId)
    setError(null)
    try {
      await apiFetch(`/payroll/runs/${runId}/${action}`, {
        method: 'POST',
        body:   JSON.stringify(payload ?? {}),
      })
      await fetchRuns()
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} payroll run`)
    } finally {
      setActionLoading(null)
    }
  }, [fetchRuns])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-brand-navy">Payroll Approval</h2>
          <p className="text-sm text-muted mt-0.5">Review, approve, lock and rollback monthly payroll runs.</p>
        </div>
        <button type="button" onClick={fetchRuns} disabled={loading}
          className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {fetched ? 'Refresh' : 'Load Runs'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-brand-coral/8 border border-brand-coral/25 rounded-xl px-4 py-3 text-sm text-brand-coral">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {fetched && runs.length === 0 && (
        <div className="text-center py-16 text-muted text-sm border border-base rounded-xl">
          No payroll runs found.
        </div>
      )}

      <div className="space-y-4">
        {runs.map((run) => (
          <PayrollRunCard
            key={run.id}
            run={run}
            canSubmit={canSubmit}
            canApprove={canApprove}
            canLock={canLock}
            canRollback={canRollback}
            onAction={handleAction}
            actionLoading={actionLoading}
          />
        ))}
      </div>
    </div>
  )
}
