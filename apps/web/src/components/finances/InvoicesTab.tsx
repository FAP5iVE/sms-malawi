'use client'

/**
 * apps/web/src/components/finances/InvoicesTab.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]: This is the "Invoice Entry & Allocation" screen from the
 *   requested redesign — the centerpiece of this project. Replaces the
 *   previous two-popup-modal flow (a bare invoice list + a separate "New
 *   Invoice" modal + a separate "Record Payment" modal) with one unified,
 *   QuickBooks-style entry screen: search/select a student, see (or build)
 *   their fee line items, enter the payment being made today, allocate it
 *   across those lines, and submit in one action — with every figure
 *   (totals, balance, arrears) recalculating live as you type, exactly as
 *   requested.
 *
 *   Table/section structure (Bill To, Payment Committed & Remittance
 *   Particulars, Fee Line Items Ledger, auto-distribute, totals) is
 *   adopted from the reference; visual styling is this app's own. The
 *   underlying accounting model is NOT the reference's mock data — it is
 *   this project's real, already-production feeService.ts engine:
 *     - Invoice number: auto-generated only (INV-2026-0042 style, see
 *       invoiceNumberService.ts) — no manual entry. A real accounting
 *       ledger's numbering should never have manually-chosen gaps or
 *       collisions; auto-only is standard internal-control practice for
 *       exactly the reason a bursar can't accidentally reuse or skip one.
 *     - Due date: intentionally absent (see GenerateInvoiceSchema — this
 *       system doesn't negotiate per-invoice payment terms; every invoice
 *       is net-30 from generation automatically).
 *     - Fee type picker: sourced live from Settings & Fee Catalog via
 *       getEligibleFeeStructuresForStudent() (mandatory fees for this
 *       student's class/term, plus anything they're actively enrolled in
 *       via Finance Fee Structure) — never hardcoded.
 *     - Allocation cannot exceed the payment being made this transaction
 *       (RecordPaymentSchema — sum(allocations) > amount is rejected
 *       outright), and any amount allocated beyond a specific fee's own
 *       balance becomes an advance credit — carried forward automatically
 *       to that student's next invoice — but only after the person
 *       explicitly confirms it (the real 409
 *       OverpaymentConfirmationRequiredError flow, shown here with the
 *       exact fee-by-fee breakdown the server computed, not a client-side
 *       guess).
 *     - The two real accounting cases this screen actually handles:
 *       (a) no invoice exists yet for this student/term — the line items
 *           chosen here create it (feeService.generateInvoice()) and the
 *           payment is recorded against the fresh line items in the same
 *           submit; (b) an invoice already exists — its real line items
 *           and real remaining balances are shown, "+ Add a line" can
 *           append one more fee type mid-term (addInvoiceLineItem()), and
 *           the payment is recorded against real balances
 *           (recordPayment()).
 *
 *   Student search/selection is preserved (and extended: a `studentId`
 *   query param, e.g. from Finance Fee Structure's "Bill Now" button, now
 *   pre-selects a student on load). The former ?action=new / ?action=bulk
 *   deep-links are retired along with the modals they used to open — bulk
 *   generation is now its own top-level tab (see finances/page.tsx).
 *
 * [DEPENDS ON]: useFinances.ts, useStudents.ts, usePermissions.ts,
 *   InvoiceNotes.tsx (preserved, unchanged, re-mounted here)
 */

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useStudents, useStudent } from '@/hooks/useStudents'
import {
  useInvoices,
  useFeeStructures,
  useGenerateInvoice,
  useRecordPayment,
  useAddInvoiceLineItem,
  useFetchReceipt,
} from '@/hooks/useFinances'
import { ApiError } from '@/lib/api-client'
import { formatMWK, FEE_CATEGORY_LABELS, PAYMENT_METHOD_OPTIONS } from '@shared/constants/malawi'
import type { ApiInvoice, ApiFeeStructure } from '@shared/types/api'
import { InvoiceNotes } from '@/components/finances/InvoiceNotes'
import { StudentPortalStatementTab } from '@/components/finances/StudentPortalStatementTab'
import {
  Search,
  Loader2,
  Plus,
  Trash2,
  Wand2,
  AlertTriangle,
  CheckCircle2,
  Receipt as ReceiptIcon,
  X,
  ExternalLink,
  Boxes,
  ArrowRight,
} from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/25 dark:text-emerald-400 dark:border-emerald-800/50',
  PARTIAL:
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/25 dark:text-blue-400 dark:border-blue-800/50',
  UNPAID:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/25 dark:text-amber-400 dark:border-amber-800/50',
  OVERDUE:
    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/25 dark:text-rose-400 dark:border-rose-800/50',
}

type PaymentMethodValue = (typeof PAYMENT_METHOD_OPTIONS)[number]['value']

interface Row {
  key: string
  feeStructureId: string
  lineItemId: string | null
  feeName: string
  code: string
  category: string
  mandatory: boolean
  fixedAmount: number
  balance: number
  allocation: string
}

interface OverpaymentItem {
  lineItemId: string
  feeName: string
  excess: number
}

// ─────────────────────────────────────────────────────────────────────────
// ENTRY POINT — routes staff to Invoice Entry & Allocation, students to
// the dedicated Student Portal Statement screen (this used to be a small
// temporary bridge component pending that screen's build; now replaced
// with the real thing).
// ─────────────────────────────────────────────────────────────────────────

export function InvoicesTab({ academicYear, term }: { academicYear: string; term: number }) {
  const { role } = useAuthStore()
  const isStudent = role === 'student'

  if (isStudent) {
    return <StudentPortalStatementTab academicYear={academicYear} term={term} />
  }
  return <InvoiceEntryAllocation academicYear={academicYear} term={term} />
}

// ─────────────────────────────────────────────────────────────────────────
// INVOICE ENTRY & ALLOCATION — the real work.
// ─────────────────────────────────────────────────────────────────────────

function InvoiceEntryAllocation({ academicYear, term }: { academicYear: string; term: number }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { can } = usePermissions()
  const canRecordPayment = can('finance.recordPayment')
  const canGenerateInvoice = can('finance.generateInvoice')

  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    searchParams.get('studentId')
  )
  const [studentSearch, setStudentSearch] = useState('')

  const [rows, setRows] = useState<Row[]>([])
  const [rowsInitializedFor, setRowsInitializedFor] = useState<string | null>(null)
  const [addLineValue, setAddLineValue] = useState('')

  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>('BANK_TRANSFER')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [additionalDiscount, setAdditionalDiscount] = useState('')

  const [overpaymentPrompt, setOverpaymentPrompt] = useState<OverpaymentItem[] | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // ── Data ──
  // useStudents() returns the paginated { students, total, page, pages }
  // shape, not a bare array -- only fetch once the search string is
  // actually meaningful, matching the debounce-free but query-length-gated
  // convention GlobalSearch.tsx already uses elsewhere in this app.
  const { data: searchData, isLoading: searchLoading } = useStudents({
    search: studentSearch,
    status: 'ACTIVE',
  })
  const searchResults = studentSearch.length >= 2 ? (searchData?.students ?? []) : []
  const { data: selectedStudent } = useStudent(selectedStudentId ?? '')
  const { data: studentInvoices = [] } = useInvoices(
    { studentId: selectedStudentId ?? undefined, academicYear, term },
    !!selectedStudentId
  )
  const existingInvoice: ApiInvoice | undefined = studentInvoices[0]

  const { data: eligibleFees = [], isLoading: eligibleLoading } = useFeeStructures(
    academicYear,
    selectedStudentId ?? undefined,
    term
  )
  const { data: catalogFees = [] } = useFeeStructures(academicYear, undefined, term)

  const feesById = useMemo(() => {
    const map = new Map<string, ApiFeeStructure>()
    for (const f of [...eligibleFees, ...catalogFees]) map.set(f.id, f)
    return map
  }, [eligibleFees, catalogFees])

  const generateInvoice = useGenerateInvoice()
  const recordPayment = useRecordPayment()
  const addLineItem = useAddInvoiceLineItem()
  const fetchReceipt = useFetchReceipt()

  const isNewInvoice = !existingInvoice
  const isBusy = generateInvoice.isPending || recordPayment.isPending || addLineItem.isPending

  // ── Reset the ledger whenever the selected student or their invoice
  //    identity changes -- a fresh form for a fresh subject. ──
  const initKey = selectedStudent ? `${selectedStudent.id}:${existingInvoice?.id ?? 'new'}` : null
  useEffect(() => {
    if (!selectedStudent || !initKey || initKey === rowsInitializedFor) return

    const nextRows = existingInvoice
      ? existingInvoice.lineItems.map((li) => {
          const fee = li.feeStructureId ? feesById.get(li.feeStructureId) : undefined
          return {
            key: li.id,
            feeStructureId: li.feeStructureId ?? '',
            lineItemId: li.id,
            feeName: li.feeName,
            code: fee?.code ?? '',
            category: fee?.category ?? 'OTHER',
            mandatory: fee?.mandatory ?? true,
            // Number(...) here is defense-in-depth, not the fix itself --
            // the real fix is server-side (see lib/serialize.ts): these
            // fields are genuine numbers over the wire now. Keeping the
            // wrap costs nothing and guards against any future regression.
            fixedAmount: Number(li.amount),
            balance: Number(li.balance),
            allocation: '',
          }
        })
      : eligibleFees.map((f) => ({
          key: f.id,
          feeStructureId: f.id,
          lineItemId: null,
          feeName: f.name,
          code: f.code,
          category: f.category,
          mandatory: f.mandatory,
          fixedAmount: Number(f.amount),
          balance: Number(f.amount),
          allocation: '',
        }))

    queueMicrotask(() => {
      setRows(nextRows)
      setPaymentAmount('')
      setPaymentReference('')
      setPaymentNotes('')
      setAdditionalDiscount('')
      setSubmitError(null)
      setSuccessMessage(null)
      setRowsInitializedFor(initKey)
    })
  }, [initKey, selectedStudent, existingInvoice, eligibleFees, feesById, rowsInitializedFor])

  // ── Live totals — recalculate on every keystroke, exactly as requested ──
  const totalFixedFees = rows.reduce((sum, r) => sum + r.fixedAmount, 0)
  const totalAllocated = rows.reduce((sum, r) => sum + (Number(r.allocation) || 0), 0)
  const totalBalanceOwed = rows.reduce((sum, r) => sum + r.balance, 0)

  const scholarshipPreview = 0 // server computes the real figure at generateInvoice() time; see discountApplied below for the manual portion this screen actually controls
  const manualDiscountValue = Number(additionalDiscount) || 0
  const netFeesDue = isNewInvoice
    ? Math.max(0, totalFixedFees - scholarshipPreview - manualDiscountValue)
    : totalBalanceOwed

  const paymentCommitted = Number(paymentAmount) || 0
  const unallocatedCash = Math.max(0, Math.round((paymentCommitted - totalAllocated) * 100) / 100)
  const allocationExceedsCommitted = totalAllocated > paymentCommitted + 0.01
  // [FIXED 2026-09-06] Was `netFeesDue - paymentCommitted` -- meaning this
  // only reacted to the top "Amount of Payment Being Paid" field, and
  // ignored every fee-line allocation input entirely (Total Payment
  // Allocated could differ from Total Payment Committed whenever some of
  // the payment is left unallocated -- see the overpayment-confirmation
  // flow below). Balance Due is what's still owed on the FEES themselves,
  // so it must be driven by what's actually been allocated to them, not by
  // the raw amount handed over -- this is also what makes it update live as
  // you type into any individual fee line's allocation box, not just the
  // payment-amount field.
  const arrearsBalance = Math.max(0, Math.round((netFeesDue - totalAllocated) * 100) / 100)

  // [FIXED 2026-09-06] The button used to require canRecordPayment
  // unconditionally, even for a brand-new invoice being created with $0
  // payment today -- which needs finance.generateInvoice, not
  // finance.recordPayment. A user with generateInvoice but not
  // recordPayment (or vice versa) saw no button at all with no
  // explanation, which read as broken rather than as a permission
  // boundary. canOperateScreen is the broad "is there anything at all this
  // person could do here" check the button's visibility uses; the actual
  // security boundary is still, correctly, enforced server-side by each
  // route's own requireRole()/permission check regardless of what the
  // frontend shows.
  const canOperateScreen = canGenerateInvoice || canRecordPayment
  const canSubmit =
    !!selectedStudent &&
    rows.length > 0 &&
    !allocationExceedsCommitted &&
    !(paymentCommitted > 0 && totalAllocated <= 0) &&
    !isBusy &&
    canOperateScreen

  function selectStudent(id: string) {
    setSelectedStudentId(id)
    setStudentSearch('')
    setRowsInitializedFor(null)
  }

  function changeStudent() {
    setSelectedStudentId(null)
    setRowsInitializedFor(null)
    router.replace('/finances?tab=invoices')
  }

  function updateAllocation(key: string, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, allocation: value } : r)))
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key))
  }

  function addLine() {
    if (!addLineValue) return
    const fee = feesById.get(addLineValue)
    if (!fee || rows.some((r) => r.feeStructureId === fee.id)) return
    setRows((prev) => [
      ...prev,
      {
        key: fee.id,
        feeStructureId: fee.id,
        lineItemId: null,
        feeName: fee.name,
        code: fee.code,
        category: fee.category,
        mandatory: fee.mandatory,
        fixedAmount: Number(fee.amount),
        balance: Number(fee.amount),
        allocation: '',
      },
    ])
    setAddLineValue('')
  }

  function autoDistribute() {
    let pool = paymentCommitted
    setRows((prev) =>
      prev.map((r) => {
        if (pool <= 0) return { ...r, allocation: '' }
        const take = Math.min(r.balance, pool)
        pool = Math.round((pool - take) * 100) / 100
        return { ...r, allocation: take > 0 ? String(take) : '' }
      })
    )
  }

  async function submit(confirmOverpayment = false) {
    if (!selectedStudent) return
    setSubmitError(null)
    try {
      let invoiceId = existingInvoice?.id
      const lineItemIdByFee = new Map(
        (existingInvoice?.lineItems ?? []).map((li) => [li.feeStructureId ?? '', li.id])
      )

      if (!invoiceId) {
        const created = await generateInvoice.mutateAsync({
          studentId: selectedStudent.id,
          academicYear,
          term,
          feeStructureIds: rows.map((r) => r.feeStructureId),
          manualDiscount: manualDiscountValue > 0 ? manualDiscountValue : undefined,
        })
        invoiceId = created.id
        for (const li of created.lineItems) lineItemIdByFee.set(li.feeStructureId ?? '', li.id)
      } else {
        for (const r of rows) {
          if (r.lineItemId) continue
          const updated = await addLineItem.mutateAsync({
            invoiceId,
            feeStructureId: r.feeStructureId,
          })
          const newLi = updated.lineItems.find((li) => li.feeStructureId === r.feeStructureId)
          if (newLi) lineItemIdByFee.set(r.feeStructureId, newLi.id)
        }
      }

      // Defensive, and also what lets TypeScript narrow invoiceId to a
      // definite string below -- it was assigned inside the `if
      // (!invoiceId)` branch above, and this guard removes any ambiguity
      // about that narrowing surviving the merge point after the if/else.
      if (!invoiceId)
        throw new Error('Could not resolve an invoice to record this payment against.')

      if (paymentCommitted > 0) {
        const allocations = rows
          .map((r) => ({
            lineItemId: lineItemIdByFee.get(r.feeStructureId) ?? '',
            amount: Number(r.allocation) || 0,
          }))
          .filter((a) => a.lineItemId && a.amount > 0)

        await recordPayment.mutateAsync({
          invoiceId,
          amount: paymentCommitted,
          method: paymentMethod,
          reference: paymentReference || undefined,
          notes: paymentNotes || undefined,
          allocations,
          confirmOverpayment,
        })
      }

      setSuccessMessage(
        paymentCommitted > 0
          ? `Payment of ${formatMWK(paymentCommitted)} recorded for ${selectedStudent.firstName} ${selectedStudent.lastName}.`
          : `Invoice created for ${selectedStudent.firstName} ${selectedStudent.lastName}.`
      )
      setOverpaymentPrompt(null)
      setRowsInitializedFor(null) // reload real state (invoice now exists / balances updated)
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        err.details &&
        typeof err.details === 'object'
      ) {
        const details = err.details as { overpayments?: OverpaymentItem[] }
        setOverpaymentPrompt(details.overpayments ?? [])
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Something went wrong recording this.')
      }
    }
  }

  const todayLabel = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const addLineOptions = catalogFees.filter((f) => !rows.some((r) => r.feeStructureId === f.id))
  // Real prefix, masked sequence -- honest about what's actually knowable
  // before save (the format) vs. not (which number in the sequence).
  const pendingInvoiceNumber = `INV-${academicYear.slice(0, 4)}-\u2022\u2022\u2022\u2022`

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading font-semibold text-body">Invoice Entry &amp; Allocation</h2>
          <p className="text-xs text-muted mt-0.5">
            Bill a student and record a payment in one step.
          </p>
        </div>
        {canGenerateInvoice && (
          <button
            type="button"
            onClick={() => router.push('/finances?tab=bulkInvoiceGenerator')}
            className="inline-flex items-center gap-1.5 border border-base rounded-lg px-3.5 py-2 text-sm font-medium text-body hover:bg-page min-h-11"
          >
            <Boxes className="w-4 h-4" /> Bulk Invoice Generator
          </button>
        )}
      </div>

      {/* ONE consolidated card, well-spaced internal sections separated by
          a single hairline each -- not a stack of separately-bordered
          cards with gaps between them. */}
      <div className="bg-surface border border-base rounded-xl divide-y divide-base">
        {/* Bill To */}
        <div className="p-4 sm:p-6">
          <label className="text-xs text-muted mb-1.5 block font-semibold uppercase tracking-wide">
            Bill To (select student)
          </label>
          {!selectedStudent ? (
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search by name or admission number…"
                className="w-full border border-base rounded-lg pl-9 pr-3 py-2.5 text-sm bg-page min-h-11"
              />
              {studentSearch.length >= 2 && (
                <div className="absolute z-10 mt-1 w-full bg-surface border border-base rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {searchLoading ? (
                    <div className="p-3 flex items-center gap-2 text-sm text-muted">
                      <Loader2 className="w-4 h-4 animate-spin" /> Searching…
                    </div>
                  ) : searchResults.length === 0 ? (
                    <p className="p-3 text-sm text-muted">No students found.</p>
                  ) : (
                    searchResults.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => selectStudent(s.id)}
                        className="w-full text-left px-3 py-2.5 hover:bg-page border-b border-base last:border-0"
                      >
                        <p className="text-sm font-medium text-body">
                          {s.firstName} {s.lastName}
                        </p>
                        <p className="text-xs text-muted">
                          {s.registrationNo} &middot; {s.class?.name ?? 'Unassigned'}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="font-medium text-body">
                  Currently: {selectedStudent.firstName} {selectedStudent.lastName}
                  <span className="text-muted font-normal">
                    {' '}
                    ({selectedStudent.registrationNo} &middot;{' '}
                    {selectedStudent.class?.name ?? 'Unassigned'})
                  </span>
                </p>
                <p className="text-xs text-muted">
                  Guardian: {selectedStudent.guardianName}
                  {selectedStudent.guardianPhone ? ` · ${selectedStudent.guardianPhone}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={changeStudent}
                className="text-sm font-medium text-brand-teal hover:underline"
              >
                Change
              </button>
            </div>
          )}
        </div>

        {selectedStudent && (
          <>
            {/* Invoice meta */}
            <div className="p-4 sm:p-6 space-y-3">
              <div className="grid sm:grid-cols-3 gap-4">
                <MetaField
                  label="Invoice Number"
                  value={existingInvoice ? existingInvoice.invoiceNumber : pendingInvoiceNumber}
                  caption={existingInvoice ? undefined : 'Assigned automatically when you save'}
                  mono
                />
                <MetaField label="Invoice Date" value={todayLabel} />
                <MetaField label="Academic Year / Term" value={`${academicYear} · Term ${term}`} />
              </div>
              {existingInvoice && (
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[existingInvoice.status] ?? ''}`}
                  >
                    {existingInvoice.status}
                  </span>
                  <span className="text-muted">
                    Current balance:{' '}
                    <strong className="text-body tabular">
                      {formatMWK(existingInvoice.balance)}
                    </strong>
                  </span>
                </div>
              )}
            </div>

            {/* Payment Committed & Remittance Particulars */}
            <div className="p-4 sm:p-6 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-heading text-sm font-semibold text-body">
                  Payment Committed &amp; Remittance Particulars
                </h3>
                <button
                  type="button"
                  onClick={autoDistribute}
                  disabled={paymentCommitted <= 0}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  <Wand2 className="w-3.5 h-3.5" /> Auto-Distribute Payment
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="pay-amount" className="text-xs text-muted mb-1 block">
                    Amount of Payment Being Paid (MWK)
                  </label>
                  <input
                    id="pay-amount"
                    type="number"
                    min="0"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11 tabular"
                  />
                </div>
                <div>
                  <label htmlFor="pay-method" className="text-xs text-muted mb-1 block">
                    Mode of Payment
                  </label>
                  <select
                    id="pay-method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodValue)}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
                  >
                    {PAYMENT_METHOD_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pay-ref" className="text-xs text-muted mb-1 block">
                    Payment Reference <span className="text-muted/70">(optional)</span>
                  </label>
                  <input
                    id="pay-ref"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="pay-notes" className="text-xs text-muted mb-1 block">
                  Notes / Remarks <span className="text-muted/70">(optional)</span>
                </label>
                <textarea
                  id="pay-notes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  rows={2}
                  placeholder="Add any specific notes, payment terms, or receipt remarks here…"
                  className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page resize-none"
                />
              </div>
              <p className="text-xs text-muted">
                Committed: <strong className="text-body">{formatMWK(paymentCommitted)}</strong>
                {' · '}Allocated: <strong className="text-body">{formatMWK(totalAllocated)}</strong>
                {' · '}Unallocated:{' '}
                <strong className="text-body">{formatMWK(unallocatedCash)}</strong>
              </p>
              {allocationExceedsCommitted && (
                <p className="text-brand-coral text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Allocated amount exceeds the payment being made — reduce an allocation or increase
                  the payment above.
                </p>
              )}
            </div>

            {/* Fee Line Items Ledger */}
            <div className="p-4 sm:p-6 space-y-3">
              <h3 className="font-heading text-sm font-semibold text-body">
                Fee Line Items Ledger ({rows.length})
              </h3>
              {eligibleLoading && isNewInvoice ? (
                <div className="h-24 rounded-lg bg-page animate-pulse" />
              ) : (
                <div className="border border-base rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-140">
                      <thead>
                        <tr className="border-b border-base bg-page">
                          <th className="text-left px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                            Fee (sourced from Settings)
                          </th>
                          <th className="text-right px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                            Fixed Amount
                          </th>
                          <th className="text-right px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                            Allocated
                          </th>
                          <th className="text-right px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                            Balance
                          </th>
                          <th className="px-2 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">
                              No fee lines yet — add one below.
                            </td>
                          </tr>
                        ) : (
                          rows.map((row) => {
                            const alloc = Number(row.allocation) || 0
                            const overBalance = alloc > row.balance + 0.01
                            return (
                              <tr key={row.key} className="border-b border-base last:border-0">
                                <td className="px-4 py-2.5">
                                  <p className="font-medium text-body">{row.feeName}</p>
                                  <p className="text-xs text-muted">
                                    {row.code && <span className="font-mono">{row.code}</span>}
                                    {row.code && ' · '}
                                    {FEE_CATEGORY_LABELS[
                                      row.category as keyof typeof FEE_CATEGORY_LABELS
                                    ] ?? row.category}
                                    {!row.mandatory && ' · Enrolled add-on'}
                                  </p>
                                </td>
                                <td className="px-4 py-2.5 text-right tabular">
                                  {formatMWK(row.fixedAmount)}
                                </td>
                                <td className="px-4 py-2.5">
                                  <input
                                    type="number"
                                    min="0"
                                    value={row.allocation}
                                    onChange={(e) => updateAllocation(row.key, e.target.value)}
                                    placeholder="0"
                                    className={`w-28 border rounded-lg px-2 py-1.5 text-sm bg-page tabular text-right ml-auto block min-h-11 ${
                                      overBalance
                                        ? 'border-amber-400 dark:border-amber-600'
                                        : 'border-base'
                                    }`}
                                  />
                                  {overBalance && (
                                    <p className="text-[11px] text-amber-600 dark:text-amber-400 text-right mt-0.5">
                                      exceeds balance — becomes credit
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular font-semibold">
                                  {formatMWK(
                                    Math.max(0, Math.round((row.balance - alloc) * 100) / 100)
                                  )}
                                </td>
                                <td className="px-2 py-2.5 text-center">
                                  {!row.lineItemId && (
                                    <button
                                      type="button"
                                      onClick={() => removeRow(row.key)}
                                      className="p-1 rounded hover:bg-page text-muted hover:text-brand-coral"
                                      aria-label={`Remove ${row.feeName}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-3 border-t border-base flex items-center gap-2 flex-wrap bg-page/40">
                    <select
                      value={addLineValue}
                      onChange={(e) => setAddLineValue(e.target.value)}
                      className="flex-1 min-w-11 border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
                    >
                      <option value="">+ Add a line…</option>
                      {addLineOptions.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} — {formatMWK(f.amount)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={addLine}
                      disabled={!addLineValue}
                      className="inline-flex items-center gap-1.5 border border-base rounded-lg px-3 py-2 text-sm font-medium text-body hover:bg-surface disabled:opacity-40 min-h-11"
                    >
                      <Plus className="w-4 h-4" /> Add line
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="p-4 sm:p-6 bg-page/40 space-y-1.5 text-sm">
              <TotalRow label="Total Fixed Fees" value={formatMWK(totalFixedFees)} />
              {isNewInvoice && (
                <div className="flex items-center justify-between py-0.5">
                  <label htmlFor="discount" className="text-muted">
                    Additional Discount (MWK)
                  </label>
                  <input
                    id="discount"
                    type="number"
                    min="0"
                    value={additionalDiscount}
                    onChange={(e) => setAdditionalDiscount(e.target.value)}
                    className="w-32 border border-base rounded-lg px-2 py-1 text-sm bg-page tabular text-right min-h-9"
                  />
                </div>
              )}
              <TotalRow label="Net Total Fees Due" value={formatMWK(netFeesDue)} />
              <TotalRow label="Total Payment Committed" value={formatMWK(paymentCommitted)} />
              <TotalRow label="Total Payment Allocated" value={formatMWK(totalAllocated)} />
              <div className="border-t border-base pt-2 mt-1 flex items-center justify-between">
                <span className="font-heading font-semibold text-body">Arrears / Balance Due</span>
                <span
                  className={`font-heading font-bold text-lg tabular ${arrearsBalance > 0 ? 'text-brand-coral' : 'text-emerald-600 dark:text-emerald-400'}`}
                >
                  {formatMWK(arrearsBalance)}
                </span>
              </div>
            </div>

            {/* Submit */}
            <div className="p-4 sm:p-6 space-y-3">
              {submitError && (
                <p className="text-brand-coral text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {submitError}
                </p>
              )}
              {successMessage && (
                <p className="text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMessage}
                </p>
              )}
              {canOperateScreen ? (
                <button
                  type="button"
                  onClick={() => submit(false)}
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-2 bg-brand-navy text-white rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50 min-h-11"
                >
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  {isBusy
                    ? 'Saving…'
                    : existingInvoice
                      ? paymentCommitted > 0
                        ? 'Record Payment'
                        : 'Save Changes'
                      : paymentCommitted > 0
                        ? 'Save Invoice & Record Payment'
                        : 'Save Invoice'}
                </button>
              ) : (
                // [FIXED 2026-09-06] Was a silently-missing button with no
                // explanation whenever the signed-in role lacked
                // finance.generateInvoice AND finance.recordPayment (e.g.
                // 'admin' -- see permissions.ts: admin is deliberately
                // scoped to system administration, not day-to-day business
                // operations like recording payments; that's reserved for
                // the 'finance' role). Silently hiding the button looked
                // like a bug; this makes the boundary explicit instead.
                <p className="text-sm text-muted flex items-center gap-1.5 bg-page rounded-lg px-3 py-2.5 border border-base">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                  Your role doesn&rsquo;t have permission to generate invoices or record payments.
                  Ask a Finance user to complete this transaction.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {existingInvoice && (
        <div className="space-y-4">
          {existingInvoice.payments && existingInvoice.payments.length > 0 && (
            <div className="bg-surface border border-base rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-base">
                <h3 className="font-heading text-sm font-semibold text-body">
                  Payments &amp; Receipts
                </h3>
              </div>
              <ul className="divide-y divide-base">
                {existingInvoice.payments.map((p) => (
                  <li key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="text-sm">
                      <span className="tabular font-medium text-body">{formatMWK(p.amount)}</span>
                      <span className="text-muted">
                        {' '}
                        &middot; {new Date(p.paidAt).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={fetchReceipt.isPending}
                      onClick={() =>
                        fetchReceipt.mutate(p.id, {
                          onSuccess: (r) => window.open(r.url, '_blank', 'noopener'),
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-teal hover:underline disabled:opacity-50"
                    >
                      <ReceiptIcon className="w-3.5 h-3.5" /> View Receipt{' '}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <InvoiceNotes invoiceId={existingInvoice.id} />
        </div>
      )}

      {overpaymentPrompt && (
        <OverpaymentConfirmModal
          items={overpaymentPrompt}
          isPending={isBusy}
          onCancel={() => setOverpaymentPrompt(null)}
          onConfirm={() => submit(true)}
        />
      )}
    </div>
  )
}

function MetaField({
  label,
  value,
  caption,
  mono,
}: {
  label: string
  value: string
  caption?: string
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted mb-0.5">{label}</p>
      <p className={`text-sm font-semibold text-body ${mono ? 'font-mono' : ''}`}>{value}</p>
      {caption && <p className="text-[11px] text-muted/80 mt-0.5">{caption}</p>}
    </div>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-body tabular">{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// OVERPAYMENT CONFIRMATION — shows the exact, server-computed breakdown
// (never a client-side guess) of which fees would be overpaid and become
// an advance credit, per feeService.recordPayment()'s
// OverpaymentConfirmationRequiredError. "Unallocated" (lineItemId: '')
// means money paid but not assigned to any specific fee.
// ─────────────────────────────────────────────────────────────────────────

function OverpaymentConfirmModal({
  items,
  isPending,
  onCancel,
  onConfirm,
}: {
  items: OverpaymentItem[]
  isPending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const totalCredit = items.reduce((sum, i) => sum + i.excess, 0)
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface rounded-xl shadow-xl max-w-sm w-full">
        <div className="flex items-center justify-between px-5 py-4 border-b border-base">
          <h3 className="font-heading font-semibold text-body flex items-center gap-2">
            <AlertTriangle className="w-4.5 h-4.5 text-amber-500" /> Confirm Overpayment
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-page text-muted"
            aria-label="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-muted">
            This payment exceeds the balance owed on the fee(s) below. The excess will be saved as
            an advance credit and applied automatically to this student&rsquo;s next invoice.
          </p>
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li
                key={item.lineItemId || i}
                className="flex items-center justify-between text-sm bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2"
              >
                <span className="text-body">{item.feeName || 'Unallocated'}</span>
                <span className="tabular font-semibold text-amber-700 dark:text-amber-400">
                  +{formatMWK(item.excess)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-base">
            <span className="text-body">Total advance credit</span>
            <span className="tabular text-body">{formatMWK(totalCredit)}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-base">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-muted hover:text-body min-h-11"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex items-center gap-2 bg-amber-500 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-amber-600 disabled:opacity-60 min-h-11"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Confirm &amp; Save as Credit
          </button>
        </div>
      </div>
    </div>
  )
}
