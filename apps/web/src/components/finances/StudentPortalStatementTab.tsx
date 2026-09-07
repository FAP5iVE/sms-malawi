"use client"

/**
 * apps/web/src/components/finances/StudentPortalStatementTab.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: This is the "Student Portal Statement" screen from the
 *   requested redesign — the exclusively student-facing view of the
 *   Finances tab, replacing the temporary StudentBalanceBridge that
 *   InvoicesTab.tsx used as a placeholder while this was being built (see
 *   that file's header comment). Directly answers what the original
 *   request asked for: "student should also have a tab of all the fees
 *   structure" (Approved Standard Term Fee Schedule, below) and "a tab
 *   where all receipts will be listed... with an option to review the
 *   document or download" (Student Invoices & Receipts, below).
 *
 *   Section structure (verified profile header + current balance,
 *   approved fee schedule table, invoices & receipts list) is adopted
 *   from the reference; visuals are this app's own. Unlike the reference
 *   mockup, there is no student-search dropdown here — this screen is
 *   exclusively the signed-in student's own record (GET /students/me,
 *   GET /finances/balance/:studentId and GET /finances/fee-structures
 *   with role 'student' all resolve from the caller's own Firebase UID
 *   server-side and cannot be pointed at another student — see
 *   useStudentMe()'s and finances.ts's own comments on that pattern).
 * [DEPENDS ON]: useStudents.ts (useStudentMe), useFinances.ts
 *   (useStudentBalance/useFeeStructures/useFetchReceipt)
 */

import { useMemo } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useStudentMe } from '@/hooks/useStudents'
import { useStudentBalance, useFeeStructures, useFetchReceipt } from '@/hooks/useFinances'
import { formatMWK, FEE_SCHEDULE_LABELS } from '@shared/constants/malawi'
import {
  Printer, GraduationCap, Phone, CheckCircle2, Receipt as ReceiptIcon,
  ExternalLink, Loader2, FileX,
} from 'lucide-react'

export function StudentPortalStatementTab({ academicYear, term }: { academicYear: string; term: number }) {
  const { user } = useAuthStore()
  const { data: me, isLoading: meLoading } = useStudentMe()
  const { data: balanceData, isLoading: balanceLoading } = useStudentBalance(user?.uid ?? '', academicYear, !!user?.uid)
  const { data: feeSchedule = [], isLoading: scheduleLoading } = useFeeStructures(academicYear, undefined, term)
  const fetchReceipt = useFetchReceipt()

  const currentBalance = balanceData?.totalBalance ?? 0

  const payments = useMemo(
    () => {
      const invoices = balanceData?.invoices ?? []

      return invoices
        .flatMap((inv) => (inv.payments ?? []).map((p) => ({ ...p, term: inv.term })))
        .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
    },
    [balanceData?.invoices]
  )

  const isLoading = meLoading || balanceLoading

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h2 className="font-heading font-semibold text-body">Student Fee Structure &amp; Financial Statement Portal</h2>
          <p className="text-xs text-muted mt-0.5">
            Your approved term fee schedule, verified payment receipts, and real-time account balance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 border border-base rounded-lg px-3.5 py-2 text-sm font-medium text-body hover:bg-page min-h-11"
        >
          <Printer className="w-4 h-4" /> Print Statement
        </button>
      </div>

      {/* Verified profile + current account state */}
      <div className="bg-surface border border-base rounded-xl p-4">
        {isLoading ? (
          <div className="h-16 rounded-lg bg-page animate-pulse" />
        ) : !me ? (
          <p className="text-sm text-muted">We couldn&rsquo;t verify your student record. Please contact the school office.</p>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/25 dark:text-blue-400 dark:border-blue-800/50 mb-1.5">
                Verified Student Profile
              </span>
              <h3 className="font-heading font-bold text-lg text-body">{me.firstName} {me.lastName}</h3>
              <p className="text-xs text-muted mt-0.5 flex items-center gap-3 flex-wrap">
                <span>ID: <span className="font-mono">{me.registrationNo}</span></span>
                <span className="inline-flex items-center gap-1"><GraduationCap className="w-3 h-3" /> {me.className ?? 'Unassigned'}</span>
                <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> Guardian: {me.guardianName}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted mb-0.5">Current Account State</p>
              <p className={`font-heading font-bold text-xl tabular ${currentBalance > 0 ? 'text-brand-coral' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {formatMWK(currentBalance)}
              </p>
              {currentBalance <= 0 && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 justify-end">
                  <CheckCircle2 className="w-3 h-3" /> Fees Fully Settled
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Approved Standard Term Fee Schedule */}
      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-base flex items-center justify-between">
          <h3 className="font-heading text-sm font-semibold text-body">Approved Standard Term Fee Schedule</h3>
          <span className="text-xs text-muted">Academic Year {academicYear}</span>
        </div>
        {scheduleLoading ? (
          <div className="p-4"><div className="h-24 rounded-lg bg-page animate-pulse" /></div>
        ) : feeSchedule.length === 0 ? (
          <p className="p-8 text-sm text-muted text-center">No approved fee schedule found for this term yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-130">
              <thead>
                <tr className="border-b border-base bg-page">
                  <th className="text-left px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold">Fee Line Particulars</th>
                  <th className="text-left px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold hidden sm:table-cell">Classification</th>
                  <th className="text-left px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold hidden md:table-cell">Billing Frequency</th>
                  <th className="text-right px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold">Standard Rate</th>
                </tr>
              </thead>
              <tbody>
                {feeSchedule.map((f) => (
                  <tr key={f.id} className="border-b border-base last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-body">{f.name}</p>
                      {f.description && <p className="text-xs text-muted">{f.description}</p>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-heading font-semibold border ${
                          f.mandatory
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/25 dark:text-amber-400 dark:border-amber-800/50'
                            : 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/25 dark:text-blue-400'
                        }`}
                      >
                        {f.mandatory ? 'Mandatory Statutory' : 'Enrolled Add-on'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted hidden md:table-cell">
                      {FEE_SCHEDULE_LABELS[f.schedule as keyof typeof FEE_SCHEDULE_LABELS] ?? f.schedule}
                    </td>
                    <td className="px-4 py-3 text-right tabular font-semibold">{formatMWK(f.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Student Invoices & Receipts */}
      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-base">
          <h3 className="font-heading text-sm font-semibold text-body">
            Student Invoices &amp; Receipts ({payments.length} document{payments.length === 1 ? '' : 's'})
          </h3>
        </div>
        {balanceLoading ? (
          <div className="p-4"><div className="h-16 rounded-lg bg-page animate-pulse" /></div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted flex flex-col items-center gap-2">
            <FileX className="w-6 h-6 text-muted/60" />
            No invoices or payment receipts have been issued yet for this student.
          </div>
        ) : (
          <ul className="divide-y divide-base print:hidden">
            {payments.map((p) => (
              <li key={p.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm">
                  <p className="font-medium text-body tabular">{formatMWK(p.amount)} <span className="font-normal text-muted">&middot; Term {p.term}</span></p>
                  <p className="text-xs text-muted">{new Date(p.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>
                <button
                  type="button"
                  disabled={fetchReceipt.isPending}
                  onClick={() => fetchReceipt.mutate(p.id, { onSuccess: (r) => window.open(r.url, '_blank', 'noopener') })}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-teal hover:underline disabled:opacity-50"
                >
                  {fetchReceipt.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptIcon className="w-4 h-4" />}
                  View / Download <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
