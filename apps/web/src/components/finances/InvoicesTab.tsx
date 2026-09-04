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
import { useInvoices, useInvoiceDetail, useStudentBalance, useRecordPayment, useGenerateInvoice, useFeeStructures } from '@/hooks/useFinances'
import { useStudents } from '@/hooks/useStudents'
import { useClasses } from '@/hooks/useClasses'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { formatMWK } from '@shared/constants/malawi'
import { PlusCircle, Loader2, X as XIcon, FileText, Search, AlertTriangle } from 'lucide-react'
import { InvoiceNotes } from '@/components/finances/InvoiceNotes'
import { BulkInvoiceGenerator } from '@/components/finances/BulkInvoiceGenerator'
import type { ApiInvoice, ApiStudent } from '@shared/types/api'
import { apiFetch, queryKeys, ApiError } from '@/lib/api-client'
import { useQueryClient } from '@tanstack/react-query'
import { PaymentMethodSchema, GenerateInvoiceSchema, RecordPaymentSchema } from '@shared/schemas/finance'
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

  // Payment recording now lives entirely in PaymentModal below, which
  // manages its own useRecordPayment() call and the full allocation flow.
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
        <PaymentModal invoice={payingInvoice} onClose={() => setPayingInvoice(null)} />
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
// [PRODUCTION FIX] Full rewrite of the fee-selection part of this modal.
// Previously the "amount" was computed silently server-side from every
// fee structure that happened to apply to the student's class/term, with
// no way to choose which fee types this particular invoice should cover.
// Fee types are now a real multi-select sourced from active FeeStructure
// rows for this student (useFeeStructures) — School Fee, Transport,
// Uniform, etc. — matching how they're actually configured in Settings,
// and several can be selected onto one invoice at once. Due Date is
// removed entirely: it never represented a real negotiated payment term
// in this system, and feeService.generateInvoice() now sets it
// automatically (net-30).
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
  const [selectedFeeIds, setSelectedFeeIds] = useState<string[]>([])
  const [manualDiscount, setManualDiscount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savingNote, setSavingNote] = useState(false)

  const { data: feeStructures = [], isLoading: feesLoading } = useFeeStructures(
    academicYear, student?.id, term,
  )

  function toggleFee(id: string) {
    setSelectedFeeIds((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]))
  }

  const selectedFees = feeStructures.filter((f) => selectedFeeIds.includes(f.id))
  const subtotal = selectedFees.reduce((sum, f) => sum + f.amount, 0)
  const discountNum = manualDiscount ? Number(manualDiscount) : 0
  const estimatedTotal = Math.max(0, subtotal - discountNum)

  async function handleSubmit() {
    setError(null)
    if (!student || selectedFeeIds.length === 0) return
    const parsed = GenerateInvoiceSchema.safeParse({
      studentId: student.id,
      academicYear,
      term,
      feeStructureIds: selectedFeeIds,
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
                <button type="button" onClick={() => { setStudent(null); setSelectedFeeIds([]) }} className="text-xs font-semibold text-brand-teal hover:underline shrink-0">
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
                onChange={(e) => { setAcademicYear(e.target.value); setSelectedFeeIds([]) }}
                placeholder="2025/2026"
                className="input w-full"
              />
            </div>
            <div>
              <label htmlFor="inv-term" className="text-xs text-muted mb-1 block">Term</label>
              <select
                id="inv-term"
                value={term}
                onChange={(e) => { setTerm(Number(e.target.value)); setSelectedFeeIds([]) }}
                className="input w-full"
              >
                {[1, 2, 3].map((t) => <option key={t} value={t}>Term {t}</option>)}
              </select>
            </div>
          </div>

          {/* [PRODUCTION FIX] Fee types — sourced from active FeeStructure
              rows for this student's class/term (set up under Settings →
              Fee Structures), not free text. Several can be selected onto
              one invoice — e.g. School Fee + Transport in the same
              transaction. */}
          <div>
            <label className="text-xs text-muted mb-1 block">Fee Types</label>
            {!student ? (
              <p className="text-xs text-muted border border-base rounded-xl px-3 py-2.5">
                Select a student first to see the fee types that apply to them.
              </p>
            ) : feesLoading ? (
              <p className="text-xs text-muted border border-base rounded-xl px-3 py-2.5">Loading fee types…</p>
            ) : feeStructures.length === 0 ? (
              <p className="text-xs text-muted border border-base rounded-xl px-3 py-2.5">
                No fee types are configured for this student&apos;s class/term yet — set them up under Settings → Fee Structures.
              </p>
            ) : (
              <div className="border border-base rounded-xl divide-y divide-base overflow-hidden">
                {feeStructures.map((f) => (
                  <label key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer hover:bg-page">
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={selectedFeeIds.includes(f.id)}
                        onChange={() => toggleFee(f.id)}
                        className="accent-brand-teal"
                      />
                      <span className="text-sm text-body">{f.name}</span>
                    </span>
                    <span className="text-sm font-medium text-muted">{formatMWK(f.amount)}</span>
                  </label>
                ))}
              </div>
            )}
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

          {/* [PRODUCTION FIX] Real-time total, not just descriptive text —
              recalculates instantly as fee types and discount change. Any
              active scholarship is applied server-side on top of this
              estimate (not known client-side until submission), so this
              is labelled as an estimate rather than the final figure. */}
          {selectedFees.length > 0 && (
            <div className="border-t border-base pt-3 text-sm space-y-1">
              {selectedFees.map((f) => (
                <div key={f.id} className="flex justify-between text-muted">
                  <span>{f.name}</span>
                  <span>{formatMWK(f.amount)}</span>
                </div>
              ))}
              {discountNum > 0 && (
                <div className="flex justify-between text-brand-coral">
                  <span>Discount</span>
                  <span>-{formatMWK(discountNum)}</span>
                </div>
              )}
              <div className="flex justify-between font-heading font-semibold text-body pt-1 border-t border-base mt-1">
                <span>Estimated Total</span>
                <span>{formatMWK(estimatedTotal)}</span>
              </div>
              <p className="text-xs text-muted pt-1">
                Final total may differ slightly if an active scholarship applies — calculated automatically on generation.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-brand-coral">{error}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isBusy || !student || selectedFeeIds.length === 0}
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

// ─────────────────────────────────────────────────────────────────────────────

// [PRODUCTION FIX] New component — previously "Record Payment" was one
// undifferentiated amount against the whole invoice. This allocates a
// single payment transaction across the invoice's own fee-type line items
// (School Fee, Transport, ...), validates in real time as amounts are
// typed, and enforces the two accounting rules requested:
//   1. What's allocated across fee types can never exceed the total
//      amount actually being paid (hard block, not just a warning).
//   2. If one fee type's allocation exceeds ITS OWN remaining balance,
//      that's allowed but requires explicit confirmation first — the
//      excess becomes a credit on the student's account (see
//      OverpaymentConfirmationRequiredError in feeService.ts), carried
//      forward and auto-applied to their next invoice.
function PaymentModal({ invoice: invoiceSummary, onClose }: { invoice: ApiInvoice; onClose: () => void }) {
  const { data: invoice, isLoading } = useInvoiceDetail(invoiceSummary.id)
  const recordPayment = useRecordPayment()

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethodType>('CASH')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ lineItemId: string; feeName: string; excess: number }[] | null>(null)

  const lineItems = invoice?.lineItems ?? []
  const totalAmount = Number(amount) || 0

  function setAllocation(lineItemId: string, value: string) {
    setAllocations((prev) => ({ ...prev, [lineItemId]: value }))
    setError(null)
  }

  // [PRODUCTION FIX] Instant calculation as amounts are typed — no submit
  // step needed to see whether allocations add up.
  const allocatedTotal = lineItems.reduce((sum, li) => sum + (Number(allocations[li.id]) || 0), 0)
  const remaining = Math.round((totalAmount - allocatedTotal) * 100) / 100
  const overAllocated = remaining < -0.01

  function buildAllocationsPayload() {
    return lineItems
      .map((li) => ({ lineItemId: li.id, amount: Number(allocations[li.id]) || 0 }))
      .filter((a) => a.amount > 0)
  }

  function submit(confirmOverpayment: boolean) {
    if (!invoice) return
    setError(null)
    const allocationsPayload = buildAllocationsPayload()
    if (allocationsPayload.length === 0) {
      setError('Enter an amount against at least one fee.')
      return
    }
    if (overAllocated) {
      setError('The amount allocated to fees cannot be more than the total payment.')
      return
    }
    const parsed = RecordPaymentSchema.safeParse({
      invoiceId: invoice.id,
      amount: totalAmount,
      method,
      reference: reference || undefined,
      notes: notes || undefined,
      allocations: allocationsPayload,
      confirmOverpayment,
    })
    if (!parsed.success) return setError(parsed.error.errors[0]?.message ?? 'Please check the form.')

    recordPayment.mutate(parsed.data, {
      onSuccess: () => {
        setConfirming(null)
        onClose()
      },
      onError: (err) => {
        // [PRODUCTION FIX] 409 here means "needs confirmation," not a
        // failure — see api-client.ts's ApiError.details and
        // OverpaymentConfirmationRequiredError in feeService.ts. Show the
        // breakdown and let the person explicitly accept it rather than
        // silently retrying or just showing a generic error.
        if (err instanceof ApiError && err.status === 409) {
          const details = err.details as { overpayments?: { lineItemId: string; feeName: string; excess: number }[] }
          setConfirming(details.overpayments ?? [])
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to record payment.')
      },
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">Record Payment</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-page rounded-lg">
            <XIcon className="w-4 h-4 text-muted" />
          </button>
        </div>

        {isLoading || !invoice ? (
          <p className="text-sm text-muted text-center py-10">Loading invoice…</p>
        ) : confirming ? (
          // ── Overpayment confirmation step ─────────────────────────────
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <div className="text-sm space-y-1.5">
                <p className="font-medium">This payment is more than what&apos;s owed:</p>
                <ul className="space-y-0.5">
                  {confirming.map((o) => (
                    <li key={o.lineItemId || 'unallocated'}>
                      {o.feeName}: <strong>{formatMWK(o.excess)}</strong> over balance
                    </li>
                  ))}
                </ul>
                <p>
                  The extra {formatMWK(confirming.reduce((s, o) => s + o.excess, 0))} will be saved as credit on this
                  student&apos;s account and used automatically on their next invoice.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="flex-1 border border-base px-4 py-2.5 rounded-lg text-sm hover:bg-page min-h-11"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={recordPayment.isPending}
                className="flex-1 bg-brand-navy text-white px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 min-h-11"
              >
                {recordPayment.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm &amp; Record
              </button>
            </div>
          </div>
        ) : (
          // ── Main entry form ────────────────────────────────────────────
          <div className="p-6 space-y-4">
            <div className="text-sm text-body">
              {invoice.student && <p className="font-medium">{invoice.student.firstName} {invoice.student.lastName}</p>}
              <p className="text-muted">{invoice.academicYear} · Term {invoice.term} · Balance owed: <strong className="text-brand-coral">{formatMWK(invoice.balance)}</strong></p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pay-amount" className="text-xs text-muted mb-1 block">Total Amount Paid (MWK)</label>
                <input
                  id="pay-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="input w-full"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label htmlFor="pay-method" className="text-xs text-muted mb-1 block">Payment Method</label>
                <select
                  id="pay-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as PaymentMethodType)}
                  className="input w-full"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
            </div>

            {/* [PRODUCTION FIX] Allocation table — split this one payment
                across the invoice's fee types, with each field's own
                remaining balance shown for reference and instant
                per-field over-balance flagging. */}
            <div>
              <label className="text-xs text-muted mb-1 block">Allocate To</label>
              <div className="border border-base rounded-xl divide-y divide-base overflow-hidden">
                {lineItems.map((li) => {
                  const allocated = Number(allocations[li.id]) || 0
                  const exceedsBalance = allocated > li.balance + 0.01
                  return (
                    <div key={li.id} className="px-3 py-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-body">{li.feeName}</p>
                          <p className="text-xs text-muted">Balance: {formatMWK(li.balance)}</p>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={allocations[li.id] ?? ''}
                          onChange={(e) => setAllocation(li.id, e.target.value)}
                          placeholder="0.00"
                          className="input w-32 text-right"
                        />
                      </div>
                      {exceedsBalance && (
                        <p className="text-xs text-brand-amber">
                          Exceeds balance by {formatMWK(allocated - li.balance)} — will be saved as credit.
                        </p>
                      )}
                    </div>
                  )
                })}
                {lineItems.length === 0 && (
                  <p className="text-xs text-muted px-3 py-4 text-center">This invoice has no fee lines.</p>
                )}
              </div>
            </div>

            {/* [PRODUCTION FIX] Real-time running total — updates on every
                keystroke, no submit needed to see it. */}
            <div className="flex items-center justify-between text-sm px-1">
              <span className="text-muted">Allocated: {formatMWK(allocatedTotal)} of {formatMWK(totalAmount)}</span>
              <span className={overAllocated ? 'font-semibold text-brand-coral' : 'text-muted'}>
                {overAllocated
                  ? `${formatMWK(Math.abs(remaining))} over — reduce an allocation`
                  : `${formatMWK(remaining)} unallocated`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pay-ref" className="text-xs text-muted mb-1 block">Reference (optional)</label>
                <input
                  id="pay-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="input w-full"
                  placeholder="Transaction ID…"
                />
              </div>
              <div>
                <label htmlFor="pay-notes" className="text-xs text-muted mb-1 block">Note (optional)</label>
                <input
                  id="pay-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input w-full"
                />
              </div>
            </div>

            {error && <p className="text-sm text-brand-coral">{error}</p>}

            <button
              type="button"
              onClick={() => submit(false)}
              disabled={recordPayment.isPending || !amount || overAllocated || allocatedTotal === 0}
              className="w-full bg-brand-teal text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2 min-h-11"
            >
              {recordPayment.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Record Payment
            </button>
          </div>
        )}
      </div>
    </div>
  )
}