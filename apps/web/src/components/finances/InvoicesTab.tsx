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

import { useState, useRef, useEffect, useCallback } from 'react'
import { getAuth } from 'firebase/auth'
import { useInvoices, useStudentBalance, useRecordPayment, useGenerateInvoice } from '@/hooks/useFinances'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { formatMWK } from '@shared/constants/malawi'
import { PlusCircle, Loader2, X as XIcon, FileText } from 'lucide-react'
import { InvoiceNotes } from '@/components/finances/InvoiceNotes'
import { BulkInvoiceGenerator } from '@/components/finances/BulkInvoiceGenerator'
import type { ApiInvoice } from '@shared/types/api'
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

interface StudentHit {
  id: string
  fullName: string
  sublabel: string
}

// Same /api/search/fallback endpoint the library page's borrower picker
// already uses — students only, staff hits dropped.
async function searchStudents(query: string): Promise<StudentHit[]> {
  try {
    const token = await getAuth().currentUser?.getIdToken()
    const res = await fetch(`/api/search/fallback?q=${encodeURIComponent(query)}`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
    if (!res.ok) return []
    const data = await res.json() as {
      students: { id: string; fullName: string; registrationNo: string; className: string | null }[]
    }
    return data.students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      sublabel: `${s.registrationNo}${s.className ? ` · ${s.className}` : ''}`,
    }))
  } catch {
    return []
  }
}

function StudentPicker({ value, onChange }: { value: StudentHit | null; onChange: (hit: StudentHit | null) => void }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<StudentHit[]>([])
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback((v: string) => {
    setQuery(v)
    onChange(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length < 2) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setResults(await searchStudents(v))
      setOpen(true)
      setLoading(false)
    }, 300)
  }, [onChange])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  return (
    <div className="relative">
      <input
        value={value ? value.fullName : query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search student by name…"
        className="input w-full"
        autoComplete="off"
      />
      {loading && <Loader2 className="w-4 h-4 animate-spin text-muted absolute right-3 top-1/2 -translate-y-1/2" />}
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-surface border border-base rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {results.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => { onChange(hit); setQuery(''); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-page text-sm"
            >
              <p className="font-medium text-body">{hit.fullName}</p>
              <p className="text-xs text-muted">{hit.sublabel}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// [PRODUCTION FIX] The backend (feeService.generateInvoice, via POST
// /finances/invoices/generate) already computes the invoice amount from
// the student's applicable fee structure and applies any scholarship
// discount, and already refuses a duplicate for the same student/term
// with a clear error — this form just needs to collect who/when.
function NewInvoiceModal({
  defaultAcademicYear, defaultTerm, onClose,
}: {
  defaultAcademicYear: string
  defaultTerm: number
  onClose: () => void
}) {
  const generateInvoice = useGenerateInvoice()
  const [student, setStudent] = useState<StudentHit | null>(null)
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear)
  const [term, setTerm] = useState(defaultTerm)
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    setError(null)
    if (!student || !dueDate) return
    const parsed = GenerateInvoiceSchema.safeParse({ studentId: student.id, academicYear, term, dueDate })
    if (!parsed.success) return setError(parsed.error.errors[0]?.message ?? 'Please check the form.')
    generateInvoice.mutate(parsed.data, {
      onSuccess: onClose,
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to generate invoice.'),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-surface rounded-2xl shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-base">
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
            <StudentPicker value={student} onChange={setStudent} />
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

          {error && <p className="text-sm text-brand-coral">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={generateInvoice.isPending || !student || !dueDate}
            className="w-full bg-brand-navy text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 min-h-11"
          >
            {generateInvoice.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {generateInvoice.isPending ? 'Generating…' : 'Generate Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}