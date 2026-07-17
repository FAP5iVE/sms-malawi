/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/components/finances/LibraryFinesTab.tsx
 * [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
 *   Reconciliation (originally R1 — API Client & Query-Key Singleton
 *   Consolidation)
 * [PURPOSE]:
 *   1. Added the fine's associated student name to the display — the
 *      most severe variant of the "raw ID instead of name" defect family
 *      confirmed in this audit: studentId existed on the interface but
 *      was never rendered in any form (absent entirely, not merely
 *      truncated). Uses ApiLibraryFine.student, joined server-side this
 *      phase (finances.ts's GET /library-fines).
 *   2. The single `isFinance` gate (role === 'admin' | 'finance' |
 *      'high_rank') controlled both Pay and Waive actions together, and
 *      was wrong for both: admin holds neither finance.clearLibraryFine
 *      nor finance.waiveFine; library holds both but was excluded
 *      entirely, meaning a library-role user could never see these
 *      actions even though R10's corrected backend now permits library
 *      to use both. Split into two permission-based gates matching the
 *      backend's real, verified authorization exactly:
 *      usePermissions().can('finance.clearLibraryFine') for Pay,
 *      can('finance.waiveFine') for Waive.
 * [DEPENDS ON]: W/lib/api-client.ts, W/hooks/usePermissions.ts
 */
/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: The Waive action — one unconfirmed tap permanently writing
 *   off a real receivable — now routes through the shared ConfirmDialog
 *   naming the student, book and amount being waived.
 * [DEPENDS ON]: W/components/shared/ConfirmDialog.tsx (same phase)
 */
'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatMWK } from '@shared/constants/malawi'
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { apiFetch, queryKeys } from '@/lib/api-client'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import type { ApiLibraryFine } from '@shared/types/api'

function fineStudentName(fine: ApiLibraryFine): string {
  return fine.student ? `${fine.student.firstName} ${fine.student.lastName}` : '—'
}

export function LibraryFinesTab() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const canPay   = can('finance.clearLibraryFine')
  const canWaive = can('finance.waiveFine')
  // R15 — the fine awaiting waive confirmation (null = dialog closed)
  const [pendingWaive, setPendingWaive] = useState<ApiLibraryFine | null>(null)

  const { data: fines = [], isLoading } = useQuery<ApiLibraryFine[]>({
    queryKey: queryKeys.finances.libraryFines(),
    queryFn: () => apiFetch('/finances/library-fines'),
  })

  const markPaid = useMutation({
    mutationFn: (id: string) => apiFetch(`/finances/library-fines/${id}/pay`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finances.libraryFines() }),
  })

  const waive = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/finances/library-fines/${id}/waive`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finances.libraryFines() }),
  })

  if (isLoading) return <div className="p-6 text-center text-muted text-sm">Loading fines…</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-brand-amber" />
        <h3 className="font-heading font-semibold text-brand-navy">Library Fines</h3>
        <span className="text-xs text-muted ml-auto">
          {fines.filter((f) => f.status === 'PENDING').length} pending
        </span>
      </div>

      {fines.length === 0 ? (
        <p className="text-center text-muted text-sm py-8">No library fines recorded.</p>
      ) : (
        <div className="divide-y divide-base border border-base rounded-xl overflow-hidden bg-surface">
          {fines.map((fine) => (
            <div key={fine.id} className="flex items-center gap-4 px-5 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-body truncate">{fineStudentName(fine)}</p>
                <p className="text-xs text-muted truncate">{fine.bookTitle} — {fine.reason}</p>
              </div>
              <p className="text-sm font-heading font-bold text-brand-navy shrink-0">
                {formatMWK(fine.amount)}
              </p>
              <span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                  fine.status === 'PAID'
                    ? 'bg-brand-teal/15 text-brand-teal'
                    : fine.status === 'WAIVED'
                      ? 'bg-base text-muted'
                      : 'bg-brand-amber/15 text-brand-amber'
                }`}
              >
                {fine.status}
              </span>
              {fine.status === 'PENDING' && (canPay || canWaive) && (
                <div className="flex gap-2 shrink-0">
                  {canPay && (
                    <button
                      onClick={() => markPaid.mutate(fine.id)}
                      className="p-1 text-brand-teal hover:text-brand-teal-light transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label="Mark as paid"
                      title="Mark paid"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  {canWaive && (
                    <button
                      type="button"
                      onClick={() => setPendingWaive(fine)}
                      className="p-1 text-muted hover:text-body transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      aria-label="Waive fine"
                      title="Waive fine"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* R15 — confirmation before permanently writing off a receivable */}
      <ConfirmDialog
        open={pendingWaive !== null}
        title="Waive this fine?"
        description={
          pendingWaive
            ? `The ${formatMWK(pendingWaive.amount)} fine for ${fineStudentName(pendingWaive)} (${pendingWaive.bookTitle}) will be permanently waived — the amount will no longer be collectable.`
            : ''
        }
        confirmLabel="Waive Fine"
        destructive
        onConfirm={() => {
          if (pendingWaive) waive.mutate(pendingWaive.id)
          setPendingWaive(null)
        }}
        onCancel={() => setPendingWaive(null)}
      />
    </div>
  )
}
