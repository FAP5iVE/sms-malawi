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

import { useEffect, useMemo, useRef, useState } from 'react'
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
  useStudentBalance,
  useStudentCredits,
} from '@/hooks/useFinances'
import { ApiError } from '@/lib/api-client'
import { formatMWK, FEE_CATEGORY_LABELS, PAYMENT_METHOD_OPTIONS, PAYMENT_METHOD_LABELS } from '@shared/constants/malawi'
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
  
  ExternalLink,
  Boxes,
  ArrowRight
} from 'lucide-react'
import { Modal, MODAL_BTN_SECONDARY } from '@/components/shared/Modal'

const STATUS_COLORS: Record<string, string> = {
  PAID: 'text-status-success',
  PARTIAL:
    'text-status-info',
  UNPAID:
    'text-status-warning',
  OVERDUE:
    'text-status-danger',
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

// Remembers what a half-finished submit already created on the server (the
// invoice, its line items) so that a retry -- e.g. after the overpayment
// confirmation -- continues the SAME transaction instead of generating a
// second invoice or adding the same fee line twice.
interface SubmitFlow {
  studentId: string
  invoiceId: string
  lineItemIdByFee: Map<string, string>
}

// All money maths on this screen goes through cents-rounding so floating
// point noise (0.1 + 0.2) can never show up as a phantom balance or credit.
const round2 = (n: number): number => Math.round(n * 100) / 100

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

  // submitLockRef closes the gap between a click and React re-rendering the
  // button as disabled -- a fast double-click / Enter-key repeat could
  // otherwise fire submit() twice and record the same payment twice.
  const submitLockRef = useRef(false)
  const lastSeededStudentRef = useRef<string | null>(null)
  const flowRef = useRef<SubmitFlow | null>(null)

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
  const {
    data: studentInvoices = [],
    isLoading: invoicesLoading,
    isFetching: invoicesFetching,
  } = useInvoices({ studentId: selectedStudentId ?? undefined, academicYear, term }, !!selectedStudentId)
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
  const isNewInvoice = !existingInvoice
  const isBusy = generateInvoice.isPending || recordPayment.isPending || addLineItem.isPending

  // ── Ledger identity ──
  // [FIXED 2026-10-22] The ledger used to be keyed on `studentId:invoiceId`
  // only. After recording a payment against an EXISTING invoice that key never
  // changed, so (a) it was rebuilt once from the not-yet-refetched, pre-payment
  // invoice and (b) never rebuilt again when the fresh invoice arrived -- the
  // Balance column and Arrears stayed red until a manual refresh, inviting the
  // same payment to be recorded twice. The key now includes a fingerprint of
  // the server numbers the ledger is built from (status, balance, every line's
  // amount and balance), so ANY server-side change re-syncs it automatically.
  const invoiceFingerprint = existingInvoice
    ? [
        existingInvoice.id,
        existingInvoice.status,
        Number(existingInvoice.balance),
        ...existingInvoice.lineItems.map(
          (li) => `${li.id}:${Number(li.amount)}:${Number(li.balance)}`
        ),
      ].join('|')
    : `new:${eligibleFees.map((f) => f.id).join(',')}`
  const initKey = selectedStudent ? `${selectedStudent.id}:${invoiceFingerprint}` : null

  // True while the invoice / fee queries that decide what the ledger shows
  // have not answered yet. Without this the screen briefly behaved as a
  // "new invoice" for a student who already has one (and, with eligible fees
  // still loading, could seed an empty ledger that never filled in).
  const ledgerLoading =
    !!selectedStudentId && (invoicesLoading || (isNewInvoice && eligibleLoading))
  // True whenever what is on screen may not match the server: still loading,
  // a refetch in flight, or the ledger not yet rebuilt from the latest data.
  // Submitting is blocked during this window so nothing can be recorded
  // against stale balances.
  const ledgerSyncing =
    ledgerLoading || invoicesFetching || (!!initKey && initKey !== rowsInitializedFor)

  useEffect(() => {
    if (!selectedStudent || !initKey || ledgerLoading || initKey === rowsInitializedFor) return

    const studentId = selectedStudent.id
    const nextRows: Row[] = existingInvoice
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
      const sameStudent = lastSeededStudentRef.current === studentId
      lastSeededStudentRef.current = studentId

      setRows((prev) => {
        // A different student gets a clean form. The SAME student only gets
        // fresh server numbers -- what the cashier already typed (e.g. while
        // the overpayment confirmation is open after the invoice was just
        // created) and any not-yet-saved "+ Add a line" rows are kept.
        if (!sameStudent) return nextRows
        const prevByFee = new Map(prev.map((r) => [r.feeStructureId, r]))
        const merged = nextRows.map((r) => ({
          ...r,
          allocation: prevByFee.get(r.feeStructureId)?.allocation ?? '',
        }))
        const unsaved = prev.filter(
          (r) => !r.lineItemId && !merged.some((m) => m.feeStructureId === r.feeStructureId)
        )
        return [...merged, ...unsaved]
      })
      if (!sameStudent) {
        setPaymentAmount('')
        setPaymentReference('')
        setPaymentNotes('')
        setAdditionalDiscount('')
        setSubmitError(null)
        setSuccessMessage(null)
      }
      setRowsInitializedFor(initKey)
    })
  }, [initKey, selectedStudent, existingInvoice, eligibleFees, feesById, rowsInitializedFor, ledgerLoading])

  // ── Live totals — recalculate on every keystroke ──
  const scholarshipPreview = 0 // server computes the real figure at generateInvoice() time; see discountApplied below for the manual portion this screen actually controls
  const manualDiscountValue = Math.max(0, Number(additionalDiscount) || 0)
  const totalFixedFees = round2(rows.reduce((sum, r) => sum + r.fixedAmount, 0))
  const netFeesDue = isNewInvoice
    ? Math.max(0, round2(totalFixedFees - scholarshipPreview - manualDiscountValue))
    : round2(rows.reduce((sum, r) => sum + r.balance, 0))
  // A new invoice's discount is spread proportionally over its lines by the
  // server (computeInvoiceCharges); mirror that so per-line figures match.
  const discountFactor =
    isNewInvoice && totalFixedFees > 0 ? Math.min(1, netFeesDue / totalFixedFees) : 1

  // One derived row per fee line. `owed` is what the line can still absorb;
  // anything allocated beyond it is `excess` -- exactly the per-line rule
  // feeService.recordPayment() applies (applied = min(allocation, balance),
  // the rest becomes advance credit).
  const ledger = rows.map((r) => {
    const alloc = Math.max(0, Number(r.allocation) || 0)
    const owed = isNewInvoice ? round2(r.balance * discountFactor) : r.balance
    return {
      ...r,
      alloc,
      owed,
      applied: Math.min(alloc, owed),
      excess: Math.max(0, round2(alloc - owed)),
      remaining: Math.max(0, round2(owed - alloc)),
    }
  })

  const totalAllocated = round2(ledger.reduce((sum, r) => sum + r.alloc, 0))
  const appliedToFees = round2(ledger.reduce((sum, r) => sum + r.applied, 0))
  const lineExcess = round2(ledger.reduce((sum, r) => sum + r.excess, 0))

  const paymentCommitted = Math.max(0, Number(paymentAmount) || 0)
  const unallocatedCash = Math.max(0, round2(paymentCommitted - totalAllocated))
  const allocationExceedsCommitted = totalAllocated > paymentCommitted + 0.01

  // [FIXED 2026-10-22] Overpayment, live. Money that will NOT reduce the
  // invoice and instead becomes advance credit = cash entered but not
  // allocated to any fee, plus anything allocated beyond a line's own
  // balance. Previously only the first part was visible (as a small grey
  // "Unallocated" figure) while Arrears showed a reassuring 0.00 -- nothing
  // said how much the family was overpaying until the server's 409 popup.
  const overpaymentTotal = round2(lineExcess + unallocatedCash)
  const hasOverpayment = overpaymentTotal > 0.01
  const overpaymentBreakdown = [
    ...ledger
      .filter((r) => r.excess > 0.01)
      .map((r) => ({ key: r.key, label: r.feeName, amount: r.excess })),
    ...(unallocatedCash > 0.01
      ? [{ key: 'unallocated', label: 'Unallocated cash', amount: unallocatedCash }]
      : []),
  ]

  // [FIXED 2026-10-22] Arrears used to be `netFeesDue - totalAllocated`, which
  // counted money allocated BEYOND a line's balance as if it paid another
  // line: Tuition over-allocated by 50,000 hid 50,000 still owed on Levy.
  // Only what each line can really absorb reduces what is owed.
  const arrearsBalance = Math.max(0, round2(netFeesDue - appliedToFees))

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
  const needsAllocation = paymentCommitted > 0 && totalAllocated <= 0
  const hasUnsavedLines = !isNewInvoice && rows.some((r) => !r.lineItemId)
  // [FIXED 2026-10-22] On an existing invoice with nothing typed, the button
  // read "Save Changes" and was enabled although there was nothing to save.
  const hasWorkToSave = isNewInvoice ? rows.length > 0 : paymentCommitted > 0 || hasUnsavedLines
  const canSubmit =
    !!selectedStudent &&
    hasWorkToSave &&
    !allocationExceedsCommitted &&
    !needsAllocation &&
    !isBusy &&
    !ledgerSyncing &&
    canOperateScreen

  function resetForm() {
    setRows([])
    setPaymentAmount('')
    setPaymentReference('')
    setPaymentNotes('')
    setAdditionalDiscount('')
    setSubmitError(null)
    setSuccessMessage(null)
    setOverpaymentPrompt(null)
    setRowsInitializedFor(null)
    lastSeededStudentRef.current = null
    flowRef.current = null
  }

  function selectStudent(id: string) {
    resetForm()
    setSelectedStudentId(id)
    setStudentSearch('')
  }

  function changeStudent() {
    resetForm()
    setSelectedStudentId(null)
    router.replace('/finances?tab=invoices')
  }

  function updateAllocation(key: string, value: string) {
    setSuccessMessage(null)
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

  // [FIXED 2026-10-22] The running `pool` used to be mutated INSIDE the
  // setRows updater. React may call an updater twice (StrictMode in dev,
  // concurrent re-runs), and the second call started with an already-drained
  // pool -- leaving every allocation blank. The distribution is now computed
  // once, from the rendered ledger, and the finished result is set.
  function autoDistribute() {
    let pool = paymentCommitted
    setSuccessMessage(null)
    setRows(
      rows.map((r, i) => {
        if (pool <= 0) return { ...r, allocation: '' }
        const take = Math.min(ledger[i]?.owed ?? r.balance, pool)
        pool = round2(pool - take)
        return { ...r, allocation: take > 0 ? String(take) : '' }
      })
    )
  }

  async function submit(confirmOverpayment = false) {
    if (!selectedStudent || submitLockRef.current) return
    submitLockRef.current = true
    setSubmitError(null)
    setSuccessMessage(null)

    const studentId = selectedStudent.id
    const studentName = `${selectedStudent.firstName} ${selectedStudent.lastName}`
    const amount = paymentCommitted // snapshot -- the inputs are locked while saving, but be explicit

    try {
      // Continue a half-finished attempt for this student (invoice already
      // created, overpayment awaiting confirmation) rather than starting over.
      const resumed = flowRef.current?.studentId === studentId ? flowRef.current : null
      let invoiceId = existingInvoice?.id ?? resumed?.invoiceId
      const createdNow = !invoiceId
      const lineItemIdByFee = resumed?.lineItemIdByFee ?? new Map<string, string>()
      for (const li of existingInvoice?.lineItems ?? []) {
        lineItemIdByFee.set(li.feeStructureId ?? '', li.id)
      }
      const remember = (id: string) => {
        flowRef.current = { studentId, invoiceId: id, lineItemIdByFee }
      }

      if (!invoiceId) {
        const created = await generateInvoice.mutateAsync({
          studentId,
          academicYear,
          term,
          feeStructureIds: rows.map((r) => r.feeStructureId),
          manualDiscount: manualDiscountValue > 0 ? manualDiscountValue : undefined,
        })
        invoiceId = created.id
        for (const li of created.lineItems) lineItemIdByFee.set(li.feeStructureId ?? '', li.id)
        remember(invoiceId)
      } else {
        for (const r of rows) {
          // Already on the invoice (or added by an earlier attempt) -- never add twice.
          if (r.lineItemId || lineItemIdByFee.has(r.feeStructureId)) continue
          const updated = await addLineItem.mutateAsync({
            invoiceId,
            feeStructureId: r.feeStructureId,
          })
          const newLi = updated.lineItems.find((li) => li.feeStructureId === r.feeStructureId)
          if (newLi) lineItemIdByFee.set(r.feeStructureId, newLi.id)
          remember(invoiceId)
        }
      }

      // Defensive, and also what lets TypeScript narrow invoiceId to a
      // definite string below -- it was assigned inside the `if
      // (!invoiceId)` branch above, and this guard removes any ambiguity
      // about that narrowing surviving the merge point after the if/else.
      if (!invoiceId)
        throw new Error('Could not resolve an invoice to record this payment against.')

      if (amount > 0) {
        const allocations = rows
          .map((r) => ({
            lineItemId: lineItemIdByFee.get(r.feeStructureId) ?? '',
            amount: Number(r.allocation) || 0,
          }))
          .filter((a) => a.lineItemId && a.amount > 0)
        if (allocations.length === 0) {
          throw new Error('Allocate this payment to at least one fee before recording it.')
        }

        await recordPayment.mutateAsync({
          invoiceId,
          amount,
          method: paymentMethod,
          reference: paymentReference.trim() || undefined,
          notes: paymentNotes.trim() || undefined,
          allocations,
          confirmOverpayment,
        })
      }

      // Credit actually created: only ever non-zero on the confirmed
      // resubmission, and taken from the server's own breakdown when we have it.
      const promptTotal = round2((overpaymentPrompt ?? []).reduce((sum, i) => sum + i.excess, 0))
      const creditSaved = confirmOverpayment ? (promptTotal > 0 ? promptTotal : overpaymentTotal) : 0

      // Clear everything that described THIS payment, right now, instead of
      // relying on a re-seed: an overpayment on an already-PAID invoice leaves
      // every line balance unchanged, so nothing else would clear the form --
      // and a form still holding the old amount is how a payment gets
      // recorded twice.
      flowRef.current = null
      setOverpaymentPrompt(null)
      setPaymentAmount('')
      setPaymentReference('')
      setPaymentNotes('')
      setAdditionalDiscount('')
      setRows((prev) => prev.map((r) => ({ ...r, allocation: '' })))
      setSuccessMessage(
        amount > 0
          ? `Payment of ${formatMWK(amount)} recorded for ${studentName}.${
              creditSaved > 0
                ? ` ${formatMWK(creditSaved)} was saved as advance credit for their next invoice.`
                : ''
            }`
          : createdNow
            ? `Invoice created for ${studentName}.`
            : `Fee lines added to the invoice for ${studentName}.`
      )
    } catch (err) {
      const details =
        err instanceof ApiError && err.status === 409 && err.details && typeof err.details === 'object'
          ? (err.details as { overpayments?: unknown })
          : null
      if (details && Array.isArray(details.overpayments)) {
        setOverpaymentPrompt(details.overpayments as OverpaymentItem[])
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Something went wrong recording this.')
      }
    } finally {
      submitLockRef.current = false
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
      <div className="divide-y divide-base">
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
                    className={`inline-flex text-xs font-semibold ${STATUS_COLORS[existingInvoice.status] ?? ''}`}
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
                  disabled={paymentCommitted <= 0 || isBusy}
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
                    onChange={(e) => {
                      setSuccessMessage(null)
                      setPaymentAmount(e.target.value)
                    }}
                    disabled={isBusy}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11 tabular disabled:opacity-60"
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
                    disabled={isBusy}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11 disabled:opacity-60"
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
                    disabled={isBusy}
                    className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11 disabled:opacity-60"
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
                  disabled={isBusy}
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
              {hasOverpayment && !allocationExceedsCommitted && (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/20 px-3.5 py-3 space-y-1.5"
                >
                  <p className="flex items-center justify-between gap-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
                    <span className="inline-flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Overpayment
                    </span>
                    <span className="tabular">{formatMWK(overpaymentTotal)}</span>
                  </p>
                  <p className="text-xs text-amber-800/90 dark:text-amber-300/90">
                    {arrearsBalance <= 0
                      ? 'The fees on this invoice will be fully settled. '
                      : 'This is more than the fee lines below can absorb. '}
                    The extra {formatMWK(overpaymentTotal)} will be saved as an advance credit and
                    applied automatically to this student&rsquo;s next invoice. You will be asked to
                    confirm when you save.
                  </p>
                  {overpaymentBreakdown.length > 0 && (
                    <ul className="text-xs text-amber-800/90 dark:text-amber-300/90 space-y-0.5">
                      {overpaymentBreakdown.map((b) => (
                        <li key={b.key} className="flex items-center justify-between gap-3">
                          <span>{b.label}</span>
                          <span className="tabular font-medium">+{formatMWK(b.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {unallocatedCash > 0.01 && arrearsBalance > 0 && (
                    <p className="text-xs text-amber-800/90 dark:text-amber-300/90">
                      Fees are still owed &mdash; use Auto-Distribute or allocate this cash to them
                      to avoid creating credit.
                    </p>
                  )}
                </div>
              )}
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
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-heading text-sm font-semibold text-body">
                  Fee Line Items Ledger ({rows.length})
                </h3>
                {ledgerSyncing && (
                  <span
                    role="status"
                    aria-live="polite"
                    className="inline-flex items-center gap-1.5 text-xs text-muted"
                  >
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating balances…
                  </span>
                )}
              </div>
              {ledgerLoading && rows.length === 0 ? (
                <div className="h-24 rounded-lg bg-page animate-pulse" />
              ) : (
                <div
                  aria-busy={ledgerSyncing}
                  className={`border border-base rounded-lg overflow-hidden transition-opacity ${
                    ledgerSyncing ? 'opacity-60' : ''
                  }`}
                >
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
                          ledger.map((row) => {
                            const overBalance = row.excess > 0.01
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
                                    disabled={isBusy}
                                    placeholder="0"
                                    className={`w-28 border rounded-lg px-2 py-1.5 text-sm bg-page tabular text-right ml-auto block min-h-11 disabled:opacity-60 ${
                                      overBalance
                                        ? 'border-amber-400 dark:border-amber-600'
                                        : 'border-base'
                                    }`}
                                  />
                                  {overBalance && (
                                    <p className="text-[11px] text-amber-600 dark:text-amber-400 text-right mt-0.5">
                                      +{formatMWK(row.excess)} over balance — becomes credit
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-right tabular font-semibold">
                                  {formatMWK(row.remaining)}
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
                      disabled={isBusy}
                      className="flex-1 min-w-11 border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11 disabled:opacity-60"
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
                      disabled={!addLineValue || isBusy}
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
                    disabled={isBusy}
                    className="w-32 border border-base rounded-lg px-2 py-1 text-sm bg-page tabular text-right min-h-9 disabled:opacity-60"
                  />
                </div>
              )}
              <TotalRow label="Net Total Fees Due" value={formatMWK(netFeesDue)} />
              <TotalRow label="Total Payment Committed" value={formatMWK(paymentCommitted)} />
              <TotalRow label="Total Payment Allocated" value={formatMWK(totalAllocated)} />
              {paymentCommitted > 0 && (
                <TotalRow label="Applied to Fees" value={formatMWK(appliedToFees)} />
              )}
              {hasOverpayment && (
                <TotalRow
                  label="Overpayment → Advance Credit"
                  value={`+${formatMWK(overpaymentTotal)}`}
                  tone="warn"
                />
              )}
              <div className="border-t border-base pt-2 mt-1 flex items-center justify-between">
                <span className="font-heading font-semibold text-body">Arrears / Balance Due</span>
                <span
                  className={`font-heading font-bold text-lg tabular ${arrearsBalance > 0 ? 'text-brand-coral' : 'text-emerald-600 dark:text-emerald-400'}`}
                >
                  {formatMWK(arrearsBalance)}
                </span>
              </div>
              {hasOverpayment && arrearsBalance <= 0 && (
                <p className="text-xs text-right text-amber-700 dark:text-amber-400">
                  Fully settled &mdash; with {formatMWK(overpaymentTotal)} overpaid, carried
                  forward as credit
                </p>
              )}
            </div>

            {/* Submit */}
            <div className="p-4 sm:p-6 space-y-3">
              {submitError && (
                <p className="text-brand-coral text-sm flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {submitError}
                </p>
              )}
              {needsAllocation && !allocationExceedsCommitted && (
                <p className="text-sm text-muted flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                  Allocate this payment to at least one fee — or use Auto-Distribute.
                </p>
              )}
              {successMessage && (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMessage}
                </p>
              )}
              {canOperateScreen ? (
                <button
                  type="button"
                  onClick={() => submit(false)}
                  disabled={!canSubmit}
                  className="inline-flex items-center gap-2 bg-brand-deep text-white rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50 min-h-11"
                >
                  {isBusy || ledgerSyncing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  {isBusy
                    ? 'Saving…'
                    : ledgerSyncing
                      ? 'Updating balances…'
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

      {/* Finance: the selected student's complete fee payment history (all
          terms and years), not just this term's invoice. */}
      {selectedStudent && <StudentPaymentHistory studentId={selectedStudent.id} />}

      {existingInvoice && (
        <div className="space-y-4">
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

// ─────────────────────────────────────────────────────────────────────────
// FEE PAYMENT HISTORY — finance staff: every payment a student has made, across
// all terms and years, with the invoice it settled, which fee lines it paid,
// who recorded it and a link to its receipt. Replaces the old "Payments &
// Receipts" list, which only showed the current term's invoice. Data comes from
// the existing GET /finances/balance/:studentId (academicYear=all).
// ─────────────────────────────────────────────────────────────────────────

function StudentPaymentHistory({ studentId }: { studentId: string }) {
  const { data, isLoading, isError } = useStudentBalance(studentId, 'all')
  const { data: credits = [] } = useStudentCredits(studentId)
  const fetchReceipt = useFetchReceipt()
  const [yearFilter, setYearFilter] = useState('all')

  const invoices = useMemo(() => data?.invoices ?? [], [data?.invoices])
  const years = useMemo(
    () => [...new Set(invoices.map((i) => i.academicYear))].sort().reverse(),
    [invoices],
  )
  const shownInvoices = useMemo(
    () => (yearFilter === 'all' ? invoices : invoices.filter((i) => i.academicYear === yearFilter)),
    [invoices, yearFilter],
  )
  const payments = useMemo(
    () =>
      shownInvoices
        .flatMap((inv) =>
          (inv.payments ?? []).map((p) => ({
            ...p,
            invoiceNumber: inv.invoiceNumber,
            academicYear: inv.academicYear,
            term: inv.term,
          })),
        )
        .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()),
    [shownInvoices],
  )

  const billed = shownInvoices.reduce((sum, i) => sum + Number(i.totalAmount), 0)
  const paid = shownInvoices.reduce((sum, i) => sum + Number(i.paidAmount), 0)
  const outstanding = shownInvoices.reduce((sum, i) => sum + Number(i.balance), 0)
  const creditTotal = credits.reduce((sum, c) => sum + Number(c.amount), 0)

  return (
    <div className="overflow-hidden space-y-4">
      <div className="px-4 py-3 border-b border-base flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-heading text-sm font-semibold text-body">
          Fee Payment History ({payments.length} payment{payments.length === 1 ? '' : 's'})
        </h3>
        {years.length > 1 && (
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            aria-label="Filter payment history by academic year"
            className="border border-base rounded-lg px-2.5 py-1.5 text-xs bg-surface text-body min-h-9"
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="px-4"><div className="h-24 rounded-lg bg-page animate-pulse" /></div>
      ) : isError ? (
        <p className="px-4 text-sm text-status-danger">Could not load this student&rsquo;s payment history.</p>
      ) : invoices.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">No invoices have been issued to this student yet.</p>
      ) : (
        <>
          <div className="px-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total billed', value: billed },
              { label: 'Total paid', value: paid },
              { label: 'Outstanding', value: outstanding },
              { label: 'Advance credit', value: creditTotal },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-base px-3 py-2">
                <p className="text-xs text-muted">{c.label}</p>
                <p className="font-heading font-semibold text-body tabular">{formatMWK(c.value)}</p>
              </div>
            ))}
          </div>

          {payments.length === 0 ? (
            <p className="px-4 text-sm text-muted">No payments recorded{yearFilter === 'all' ? '' : ` for ${yearFilter}`}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-170">
                <thead>
                  <tr className="border-b border-base bg-page text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-2.5 font-semibold">Date</th>
                    <th className="px-4 py-2.5 font-semibold">Invoice</th>
                    <th className="px-4 py-2.5 font-semibold">Method / Ref</th>
                    <th className="px-4 py-2.5 font-semibold">Applied to</th>
                    <th className="px-4 py-2.5 font-semibold">Recorded by</th>
                    <th className="px-4 py-2.5 font-semibold text-right">Amount</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-b border-base last:border-0 align-top">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {new Date(p.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs">{p.invoiceNumber}</p>
                        <p className="text-xs text-muted">{p.academicYear} &middot; Term {p.term}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p>{PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS] ?? p.method}</p>
                        {p.reference && <p className="text-xs text-muted font-mono">{p.reference}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted">
                        {p.allocations && p.allocations.length > 0
                          ? p.allocations.map((a) => (
                              <p key={a.id}>{a.lineItem?.feeName ?? 'Fee'}: {formatMWK(Number(a.amount))}</p>
                            ))
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">{p.recordedByName ?? '—'}</td>
                      <td className="px-4 py-3 text-right tabular font-semibold whitespace-nowrap">
                        {formatMWK(Number(p.amount))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={fetchReceipt.isPending}
                          onClick={() => fetchReceipt.mutate(p.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-teal hover:underline disabled:opacity-50 whitespace-nowrap"
                        >
                          <ReceiptIcon className="w-3.5 h-3.5" /> View Receipt <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-4 pb-4">
            <p className="text-xs uppercase tracking-wide text-muted font-semibold mb-2">Invoices</p>
            <ul className="divide-y divide-base border border-base rounded-lg">
              {shownInvoices.map((inv) => (
                <li key={inv.id} className="px-3 py-2 flex items-center justify-between gap-3 flex-wrap text-xs">
                  <span>
                    <span className="font-mono">{inv.invoiceNumber}</span>
                    <span className="text-muted"> &middot; {inv.academicYear} Term {inv.term}</span>
                  </span>
                  <span className="tabular">
                    {formatMWK(Number(inv.paidAmount))} of {formatMWK(Number(inv.totalAmount))}
                    <span className={`ml-2 font-semibold ${STATUS_COLORS[inv.status] ?? ''}`}>{inv.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
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

function TotalRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'warn'
}) {
  const warn = tone === 'warn'
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={warn ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-muted'}>
        {label}
      </span>
      <span
        className={`font-medium tabular ${warn ? 'text-amber-700 dark:text-amber-400' : 'text-body'}`}
      >
        {value}
      </span>
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
    <Modal
      title={<span className="flex items-center gap-2"><AlertTriangle className="w-4.5 h-4.5 text-amber-500" /> Confirm Overpayment</span>}
      onClose={onCancel}
      size="sm"
      busy={isPending}
      bodyClassName="space-y-3"
      footer={
        <>
        <button
          type="button"
          onClick={onCancel}
          className={MODAL_BTN_SECONDARY}
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
        </>
      }
    >
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
    </Modal>
  )
}
