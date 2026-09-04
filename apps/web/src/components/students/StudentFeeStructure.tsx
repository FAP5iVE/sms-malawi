'use client'

/*
 * apps/web/src/components/students/StudentFeeStructure.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Mirrors StaffForm.tsx's SalarySection for students — "how
 *   staff has a salary structure, student should also have a tab of all
 *   the fees structure." FeeStructureTab.tsx (finances page) is the
 *   school-wide admin screen for CONFIGURING fee types; this is the
 *   per-student view of what actually applies to THIS student: every fee
 *   type their class is subject to (School Fee, Transport, Uniform, ...),
 *   cross-referenced against their current-term invoice (if one exists)
 *   to show paid/balance per fee type, plus any unapplied overpayment
 *   credit sitting on their account.
 * [DEPENDS ON]: useFinances.ts (useFeeStructures, useInvoices,
 *   useStudentCredits)
 */

import { useFeeStructures, useInvoices, useStudentCredits } from '@/hooks/useFinances'
import { formatMWK } from '@shared/constants/malawi'
import { Wallet, CheckCircle2 } from 'lucide-react'

// Matches the hardcoded default used elsewhere (finances/page.tsx) —
// there's no centralized "current academic year" source in this codebase
// yet.
const CURRENT_YEAR = '2025/2026'
const CURRENT_TERM = 1

export function StudentFeeStructure({ studentId }: { studentId: string }) {
  const { data: feeStructures = [], isLoading: feesLoading } = useFeeStructures(
    CURRENT_YEAR, studentId, CURRENT_TERM,
  )
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices(
    { studentId, academicYear: CURRENT_YEAR, term: CURRENT_TERM }, !!studentId,
  )
  const { data: credits = [] } = useStudentCredits(studentId)

  const currentInvoice = invoices[0]
  const lineItemsByFeeName = new Map((currentInvoice?.lineItems ?? []).map((li) => [li.feeName, li]))
  const availableCredit = credits.reduce((sum, c) => sum + c.amount, 0)
  const totalFees = feeStructures.reduce((sum, f) => sum + f.amount, 0)

  const isLoading = feesLoading || invoicesLoading

  return (
    <div className="border border-base rounded-xl p-4 bg-page/50 space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-brand-teal" aria-hidden />
        <h3 className="text-sm font-heading font-semibold text-body">Fee Structure — {CURRENT_YEAR} Term {CURRENT_TERM}</h3>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : feeStructures.length === 0 ? (
        <p className="text-xs text-muted">
          No fee types are configured for this student&apos;s class yet — set them up under Finances → Fee Structures.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-base border border-base rounded-lg overflow-hidden">
            {feeStructures.map((f) => {
              const lineItem = lineItemsByFeeName.get(f.name)
              return (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-surface">
                  <div>
                    <p className="text-sm text-body font-medium">{f.name}</p>
                    <p className="text-xs text-muted">{formatMWK(f.amount)}</p>
                  </div>
                  {!currentInvoice ? (
                    <span className="text-xs text-muted">Not yet invoiced</span>
                  ) : !lineItem ? (
                    <span className="text-xs text-muted">Not on this invoice</span>
                  ) : lineItem.balance <= 0 ? (
                    <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> Paid
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-brand-coral">
                      {formatMWK(lineItem.balance)} due
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="flex justify-between text-sm font-heading font-semibold text-body pt-1">
            <span>Total Termly Fees</span>
            <span>{formatMWK(totalFees)}</span>
          </div>

          {!currentInvoice && (
            <p className="text-xs text-muted">
              No invoice has been generated for this student this term yet.
            </p>
          )}

          {availableCredit > 0 && (
            <p className="text-xs text-brand-teal bg-brand-teal/10 border border-brand-teal/25 rounded-lg px-3 py-2">
              MWK {availableCredit.toLocaleString()} credit available from a prior overpayment — applied automatically to their next invoice.
            </p>
          )}
        </>
      )}
    </div>
  )
}