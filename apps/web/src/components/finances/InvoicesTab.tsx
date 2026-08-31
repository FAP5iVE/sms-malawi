/**
 * [CHANGE TYPE]: TARGETED EDIT, three fixes (listed below)
 * [FILE]: apps/web/src/components/finances/InvoicesTab.tsx
 * [R-PHASE]: R9 — Finance I: Invoicing, Fees & the Accounting Ledger
 *   Reconnection
 * [PURPOSE]:
 *   1. Student self-service invoice viewing now calls
 *      GET /finances/balance/:studentId (ownership-checked, reachable by
 *      the `student` role) via the new useStudentBalance() hook, instead
 *      of GET /finances/invoices (whose role list excludes `student`
 *      entirely, so a student rendering this tab under the old code
 *      always saw an empty table).
 *   2. "Student" column now renders the joined student name
 *      (inv.student.firstName/lastName, added to ApiInvoice this phase)
 *      instead of `inv.studentId.slice(-8)`.
 *   3. "Pay" button now gates on usePermissions().can('finance.recordPayment')
 *      instead of the previous `role !== 'student'` check, which
 *      incorrectly showed the button to every staff role (including
 *      admin, high_rank, library, hr — none of which hold this
 *      permission by design; recording a payment is a `finance`-role
 *      business operation) rather than just the one role that holds it.
 * [DEPENDS ON]: W/hooks/useFinances.ts (useStudentBalance), W/hooks/usePermissions.ts
 */
'use client'

import { useState, useEffect } from 'react'
import { useInvoices, useStudentBalance, useRecordPayment, useGenerateInvoice } from '@/hooks/useFinances'
import { useStudents } from '@/hooks/useStudents'
import { useClasses } from '@/hooks/useClasses'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { formatMWK } from '@shared/constants/malawi'
import { PlusCircle, Loader2, X as XIcon, FileText, Search } from 'lucide-react'
import { InvoiceNotes } from '@/components/finances/InvoiceNotes'
import { BulkInvoiceGenerator } from '@/components/finances/BulkInvoiceGenerator'
import type { ApiInvoice, ApiStudent } from '@shared/types/api'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { PaymentMethodSchema, GenerateInvoiceSchema } from '@shared/schemas/finance'
import { useSearchParams } from 'next/navigation'
import { z } from 'zod'

type PaymentMethodType = z.infer<typeof PaymentMethodSchema>
const STATUS_COLORS: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-blue-50 text-blue-700 border-blue-200',
  UNPAID: 'bg-brand-amber/10 text-brand-amber border-brand-amber/30',
  OVERDUE: 'bg-brand-coral/10 text-brand-coral border-brand-coral/30',
}

function studentDisplayName(inv: ApiInvoice, isOwnRecord: boolean): string {
  if (inv.student) return `${inv.student.firstName} ${inv.student.lastName}`
  return isOwnRecord ? 'You' : '—'
}

export function InvoicesTab({ academicYear, term }: { academicYear: string; term: number }) {
  const { role, user } = useAuthStore()
  const { can } = usePermissions()
  const isStudent = role === 'student'
  const canRecordPayment = can('finance.recordPayment')
  const canGenerateInvoice = can('finance.generateInvoice')

  const [statusFilter, setStatusFilter] = useState('')
  const [payingInvoice, setPayingInvoice] = useState<ApiInvoice | null>(null)
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)

  // [PRODUCTION FIX] Dashboard's "Generate Invoice" quick action
  // (FinanceDashboard.tsx) linked here with no way to actually act once
  // arrived — deep-linking with ?action=new now opens this modal directly
  // on load, same ?tab= convention finances/page.tsx already uses.
  const searchParams = useSearchParams()
  const [showNewInvoice, setShowNewInvoice] = useState(searchParams.get('action') === 'new')
  const [showBulkGenerator, setShowBulkGenerator] = useState(searchParams.get('action') === 'bulk')

  const filters: Record<string, string | number> = { academicYear, term }
  if (statusFilter) filters.status = statusFilter

  const { data: staffInvoices = [], isLoading: staffLoading } = useInvoices(filters, !isStudent)
  const { data: balanceData, isLoading: balanceLoading } = useStudentBalance(
    user?.uid ?? '',
    academicYear,
    isStudent
  )

  const invoices = isStudent ? (balanceData?.invoices ?? []) : staffInvoices
  const isLoading = isStudent ? balanceLoading : staffLoading

  const { mutate: recordPayment, isPending } = useRecordPayment()
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethodType>('CASH')
  const [payRef, setPayRef] = useState('')
  function submitPayment() {
    if (!payingInvoice || !payAmount) return
    recordPayment(
      {
        invoiceId: payingInvoice.id,
        amount: Number(payAmount),
        method: payMethod,
        reference: payRef || undefined,
      },
      {
        onSuccess: () => {
          setPayingInvoice(null)
          setPayAmount('')
          setPayRef('')
        },
      }
    )
  }
  return (
    <div className="space-y-4">
      {/* Status chips + New Invoice */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {['', 'UNPAID', 'PARTIAL', 'PAID', 'OVERDUE'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                statusFilter === s
                  ? 'bg-brand-navy text-white border-brand-navy'
                  : 'bg-surface border-base text-muted hover:border-brand-navy',
              ].join(' ')}
              aria-label={s || 'All statuses'}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
        {/* [PRODUCTION FIX] Neither of these existed — POST
            /finances/invoices/generate and POST
            /finances/invoices/bulk-generate both already worked (the
            latter via BulkInvoiceGenerator.tsx, a fully-built component
            that was never mounted on any page). Only student-fee-balance
            invoices (auto-generated elsewhere) ever appeared in this tab
            as a result. */}
        {canGenerateInvoice && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowBulkGenerator(true)}
              className="inline-flex items-center gap-2 border border-brand-navy text-brand-navy rounded-xl px-4 py-2 text-sm font-semibold hover:bg-brand-navy/5 transition-colors min-h-[40px]"
            >
              <FileText className="w-4 h-4" aria-hidden /> Bulk Generate
            </button>
            <button
              type="button"
              onClick={() => setShowNewInvoice(true)}
              className="inline-flex items-center gap-2 bg-brand-teal text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-brand-teal-light transition-colors min-h-[40px]"
            >
              <PlusCircle className="w-4 h-4" aria-hidden /> New Invoice
            </button>
          </div>
        )}
      </div>
      {/* Invoices table */}
      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-base bg-page">
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Student
              </th>
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Term
              </th>
              <th className="text-right px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Total
              </th>
              <th className="text-right px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Paid
              </th>
              <th className="text-right px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Balance
              </th>
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Status
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-base">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="skeleton h-4 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                  No invoices found
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <>
                  <tr
                    key={inv.id}
                    onClick={() =>
                      !isStudent &&
                      setExpandedInvoiceId(expandedInvoiceId === inv.id ? null : inv.id)
                    }
                    className={[
                      'border-b border-base hover:bg-page',
                      !isStudent ? 'cursor-pointer' : '',
                    ].join(' ')}
                  >
                    <td className="px-4 py-3 text-sm font-medium">
                      {studentDisplayName(inv, isStudent)}
                    </td>
                    <td className="px-4 py-3">Term {inv.term}</td>
                    <td className="px-4 py-3 text-right tabular font-medium">
                      {formatMWK(inv.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-emerald-600">
                      {formatMWK(inv.paidAmount)}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular font-semibold"
                      style={{
                        color:
                          inv.balance > 0 ? 'var(--color-brand-coral)' : 'var(--color-brand-teal)',
                      }}
                    >
                      {formatMWK(inv.balance)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[inv.status] ?? ''}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canRecordPayment && inv.status !== 'PAID' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setPayingInvoice(inv)
                          }}
                          className="flex items-center gap-1 text-xs text-brand-teal hover:underline font-medium"
                          aria-label={`Record payment for invoice ${inv.id}`}
                        >
                          <PlusCircle className="w-3.5 h-3.5" /> Pay
                        </button>
                      )}
                    </td>
                  </tr>
                  {!isStudent && expandedInvoiceId === inv.id && (
                    <tr key={`${inv.id}-notes`} className="border-b border-base bg-page">
                      <td colSpan={7} className="px-6 py-4">
                        <InvoiceNotes invoiceId={inv.id} />
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
      {/* Record Payment Modal */}
      {payingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg text-brand-navy">Record Payment</h3>
            <p className="text-sm text-muted">
              Balance:{' '}
              <strong className="text-brand-coral">{formatMWK(payingInvoice.balance)}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Amount (MWK)</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="input w-full"
                  placeholder="Enter amount"
                  max={payingInvoice.balance}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethodType)}
                  className="input w-full"
                  aria-label="Payment method"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Reference (optional)</label>
                <input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="input w-full"
                  placeholder="Transaction ID, receipt number…"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPayingInvoice(null)}
                className="flex-1 border border-base px-4 py-2 rounded-lg text-sm hover:bg-page"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={submitPayment}
                disabled={isPending || !payAmount}
                className="flex-1 bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                type="button"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewInvoice && (
        <NewInvoiceModal
          defaultAcademicYear={academicYear}
          defaultTerm={term}
          onClose={() => setShowNewInvoice(false)}
        />
      )}

      {showBulkGenerator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="absolute inset-0" onClick={() => setShowBulkGenerator(false)} />
          <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
            <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
              <h2 className="font-heading font-bold text-brand-navy">Bulk Generate Invoices</h2>
              <button onClick={() => setShowBulkGenerator(false)} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
                <XIcon className="w-4 h-4 text-muted" />
              </button>
            </div>
            <div className="p-6">
              <BulkInvoiceGenerator />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

// [PRODUCTION FIX] Deliberately not the library page's autocomplete-dropdown
// pattern — an invoice entry needs to find one specific student among
// hundreds confidently, not just guess a name. This is a real search-and-
// filter panel: registration number or name, narrowable by class, with
// results shown as a proper list (including each student's current fee
// balance for context) rather than a single-line typeahead.
function StudentSearchPanel({
  selectedId, onSelect,
}: {
  selectedId: string | null
  onSelect: (student: ApiStudent) => void
}) {
  const [search, setSearch] = useState('')
  const [classId, setClassId] = useState('')
  const { data: classes = [] } = useClasses()
  const { data, isLoading } = useStudents({
    search: search.length >= 2 ? search : undefined,
    classId: classId || undefined,
    status: 'ACTIVE',
  })
  const students = data?.students ?? []

  return (
    <div className="border border-base rounded-xl overflow-hidden">
      <div className="p-3 border-b border-base bg-page/50 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or registration number…"
            className="input w-full pl-8"
          />
        </div>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="input w-full">
          <option value="">All classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="max-h-56 overflow-y-auto divide-y divide-base">
        {isLoading ? (
          <p className="text-xs text-muted text-center py-6">Searching…</p>
        ) : students.length === 0 ? (
          <p className="text-xs text-muted text-center py-6">
            {search.length >= 2 || classId ? 'No matching students.' : 'Type at least 2 characters or pick a class to search.'}
          </p>
        ) : (
          students.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s)}
              className={[
                'w-full text-left px-3 py-2.5 hover:bg-page transition-colors flex items-center justify-between gap-3',
                selectedId === s.id ? 'bg-brand-teal/10' : '',
              ].join(' ')}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-body truncate">{s.firstName} {s.lastName}</p>
                <p className="text-xs text-muted">{s.registrationNo}{s.class ? ` · ${s.class.name}` : ''}</p>
              </div>
              {typeof s.feeBalance === 'number' && s.feeBalance > 0 && (
                <span className="shrink-0 text-xs font-semibold text-brand-coral">{formatMWK(s.feeBalance)} due</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// [PRODUCTION FIX] Every real field this endpoint accepts is wired here —
// studentId/academicYear/term/dueDate (the original four), plus
// manualDiscount (new — see GenerateInvoiceSchema/feeService.generateInvoice
// this same phase) and an initial note (via the existing invoice-notes
// endpoint, called right after creation succeeds). subtotal/discount-from-
// scholarship/totalAmount/balance/status are NOT inputs here because
// they're genuinely computed server-side from the student's fee structure
// and any active scholarship — exposing fake editable copies of those
// would just let the form lie about what's actually going to happen.
function NewInvoiceModal({
  defaultAcademicYear, defaultTerm, onClose,
}: {
  defaultAcademicYear: string
  defaultTerm: number
  onClose: () => void
}) {
  const qc = useQueryClient()
  const generateInvoice = useGenerateInvoice()
  const [student, setStudent] = useState<ApiStudent | null>(null)
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear)
  const [term, setTerm] = useState(defaultTerm)
  const [dueDate, setDueDate] = useState('')
  const [manualDiscount, setManualDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savingNote, setSavingNote] = useState(false)

  async function handleSubmit() {
    setError(null)
    if (!student || !dueDate) return
    const parsed = GenerateInvoiceSchema.safeParse({
      studentId: student.id,
      academicYear,
      term,
      dueDate,
      manualDiscount: manualDiscount ? Number(manualDiscount) : undefined,
    })
    if (!parsed.success) return setError(parsed.error.errors[0]?.message ?? 'Please check the form.')

    generateInvoice.mutate(parsed.data, {
      onSuccess: async (invoice) => {
        const created = invoice as ApiInvoice
        if (notes.trim()) {
          setSavingNote(true)
          try {
            await apiFetch(`/finances/invoices/${created.id}/notes`, {
              method: 'POST',
              body: JSON.stringify({ body: notes.trim() }),
            })
            void qc.invalidateQueries({ queryKey: queryKeys.finances.invoiceNotes(created.id) })
          } finally {
            setSavingNote(false)
          }
        }
        onClose()
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to generate invoice.'),
    })
  }

  const isBusy = generateInvoice.isPending || savingNote

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy flex items-center gap-2">
            <FileText className="w-4 h-4" aria-hidden /> New Invoice
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs text-muted mb-1 block">Student</label>
            {student ? (
              <div className="flex items-center justify-between gap-3 border border-brand-teal/30 bg-brand-teal/5 rounded-xl px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-body">{student.firstName} {student.lastName}</p>
                  <p className="text-xs text-muted">{student.registrationNo}{student.class ? ` · ${student.class.name}` : ''}</p>
                </div>
                <button type="button" onClick={() => setStudent(null)} className="text-xs font-semibold text-brand-teal hover:underline shrink-0">
                  Change
                </button>
              </div>
            ) : (
              <StudentSearchPanel selectedId={null} onSelect={setStudent} />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="inv-year" className="text-xs text-muted mb-1 block">Academic Year</label>
              <input
                id="inv-year"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2025/2026"
                className="input w-full"
              />
            </div>
            <div>
              <label htmlFor="inv-term" className="text-xs text-muted mb-1 block">Term</label>
              <select id="inv-term" value={term} onChange={(e) => setTerm(Number(e.target.value))} className="input w-full">
                {[1, 2, 3].map((t) => <option key={t} value={t}>Term {t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="inv-due" className="text-xs text-muted mb-1 block">Due Date</label>
            <input
              id="inv-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="input w-full"
            />
          </div>

          <div>
            <label htmlFor="inv-discount" className="text-xs text-muted mb-1 block">
              Additional Discount (MWK, optional)
            </label>
            <input
              id="inv-discount"
              type="number"
              min="0"
              step="0.01"
              value={manualDiscount}
              onChange={(e) => setManualDiscount(e.target.value)}
              placeholder="0"
              className="input w-full"
            />
            <p className="text-xs text-muted mt-1">
              Applied on top of any active scholarship — for a one-off adjustment, not a standing discount.
            </p>
          </div>

          <div>
            <label htmlFor="inv-notes" className="text-xs text-muted mb-1 block">Note (optional)</label>
            <textarea
              id="inv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Visible to finance staff on this invoice"
              className="input w-full resize-none"
            />
          </div>

          <p className="text-xs text-muted">
            The invoice amount is calculated automatically from this student&apos;s class fee structure for the
            selected year and term, minus any active scholarship and the discount above.
          </p>

          {error && <p className="text-sm text-brand-coral">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isBusy || !student || !dueDate}
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 min-h-11"
          >
            {isBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isBusy ? 'Generating…' : 'Generate Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}