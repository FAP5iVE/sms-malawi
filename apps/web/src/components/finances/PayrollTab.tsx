/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/components/finances/PayrollTab.tsx
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation; R15 —
 *   UI/UX Polish routes the "Run Payroll" button — previously one
 *   unconfirmed tap creating a real payroll run for every staff member —
 *   through the shared ConfirmDialog, and adds a visible onError to the
 *   mutation, which previously discarded failures silently.
 * [DEPENDS ON]: W/lib/api-client.ts,
 *   W/components/shared/ConfirmDialog.tsx (R15)
 */
'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { formatMWK } from '@shared/constants/malawi'
import type { ApiPayrollRun } from '@shared/types/api'
import { Loader2, AlertTriangle } from 'lucide-react'
import { apiFetch, queryKeys } from '@/lib/api-client'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

export function PayrollTab() {
  const year = new Date().getFullYear()
  // R15 — run-payroll confirmation dialog visibility + visible failure state
  const [confirmRunOpen, setConfirmRunOpen] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const {
    data: runs = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.finances.payroll.list({ year }),
    queryFn: () => apiFetch<ApiPayrollRun[]>(`/payroll?year=${year}`),
  })

  const { mutate: triggerPayroll, isPending } = useMutation({
    mutationFn: ({ month, year }: { month: number; year: number }) =>
      apiFetch<{ runId: string }>('/payroll/run', {
        method: 'POST',
        body: JSON.stringify({ month, year }),
      }),
    onSuccess: () => {
      setRunError(null)
      void refetch()
    },
    onError: (e: Error) => setRunError(e.message),
  })

  const currentMonth = new Date().getMonth() + 1
  const currentMonthName = new Date(year, currentMonth - 1).toLocaleString('en', { month: 'long' })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-sm text-brand-navy">
          Payroll History {year}
        </h3>
        <button
          onClick={() => setConfirmRunOpen(true)}
          disabled={isPending}
          className="flex items-center gap-2 bg-brand-navy text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-navy-mid disabled:opacity-60"
          type="button"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
          Run {currentMonthName} Payroll
        </button>
      </div>

      {/* R15 — visible run failure (previously silently discarded) */}
      {runError && (
        <div
          className="flex items-center gap-2 bg-brand-coral/8 border border-brand-coral/25 rounded-xl px-4 py-3 text-sm text-brand-coral"
          role="alert"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
          {runError}
        </div>
      )}

      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base bg-page">
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Period
              </th>
              <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Gross
              </th>
              <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Net
              </th>
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center">
                  <div className="skeleton h-4 w-48 mx-auto rounded" />
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">
                  No payroll runs yet this year
                </td>
              </tr>
            ) : (
              runs.map((run) => {
                const monthName = new Date(run.year, run.month - 1).toLocaleString('en', {
                  month: 'long',
                })
                return (
                  <tr key={run.id} className="border-b border-base hover:bg-page">
                    <td className="px-4 py-3 font-medium">
                      {monthName} {run.year}
                    </td>
                    <td className="px-4 py-3 text-right tabular">{formatMWK(run.totalGross)}</td>
                    <td className="px-4 py-3 text-right tabular font-semibold text-emerald-600">
                      {formatMWK(run.totalNet)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${run.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-brand-amber/10 text-brand-amber border-brand-amber/30'}`}
                      >
                        {run.status}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* R15 — confirmation before creating a real payroll run */}
      <ConfirmDialog
        open={confirmRunOpen}
        title={`Run ${currentMonthName} ${year} payroll?`}
        description="A payroll run will be created for every active staff member for this period, computing gross and net pay from their current contracts, allowances and deductions. Payroll runs are real financial records."
        confirmLabel="Run Payroll"
        onConfirm={() => {
          setConfirmRunOpen(false)
          triggerPayroll({ month: currentMonth, year })
        }}
        onCancel={() => setConfirmRunOpen(false)}
      />
    </div>
  )
}
