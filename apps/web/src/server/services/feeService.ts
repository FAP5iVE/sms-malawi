// apps/web/src/server/services/feeService.ts
//
// [CHANGE TYPE]: TARGETED EDIT, two fixes (a third — the "joined student
//   name on list functions" fix — applies to GET /invoices and
//   GET /scholarships directly in finances.ts, since that is where the
//   real list logic lives; see finances.ts's header comment)
// [R-PHASE]: R9 — Finance I: Invoicing, Fees & the Accounting Ledger
//   Reconnection
// [PURPOSE]:
//   1. checkBalanceGate() now resolves the incoming identifier through
//      studentService.resolveStudentFromUid() before querying. Its sole
//      caller, examService.getStudentResults(), is reached with a Firebase
//      UID in its confirmed caller chain — previously that UID was passed
//      straight through to this function's `studentId` param, which
//      queries Invoice.studentId (a Prisma FK, never a Firebase UID). No
//      invoice would ever match, so `!invoice` was always true and the
//      gate reported open (no outstanding balance) unconditionally —
//      genuinely-indebted students were never actually blocked. A UID
//      that fails to resolve to a Student record is treated as gate-open
//      (fee status cannot be evaluated for an unlinked account, so this
//      function does not itself deny access — see caller for the actual
//      403).
//   2. recordPayment() — THIS PHASE'S HEADLINE FIX — now calls
//      accountingService.recordPaymentEntry() immediately after the
//      payment row is persisted, reconnecting real tuition revenue to the
//      double-entry ledger for the first time. accountingService's own
//      functions use the global prisma singleton rather than accepting an
//      external transaction client, so this call cannot be nested inside
//      the payment/invoice-update $transaction above it; it runs
//      immediately after that transaction commits, wrapped in the same
//      try/catch-and-log-compensating-error pattern this function already
//      uses for receipt generation directly below it — a ledger-posting
//      failure is logged for reconciliation rather than rolling back an
//      already-committed, real payment.
// Fixed: Promise on checkBalanceGate (was empty Promise<>)
// Fixed: removed empty Promise<> from $transaction return (let TypeScript infer)
// Fixed: payment.paidAt (not recordedAt — actual Prisma field name)
//
// [2026-09-05 ADDITION] Invoice Entry & Allocation / Bulk Invoice Generator /
//   Finance Fee Structure redesign:
//   - generateInvoice() now assigns a real, sequential, human-readable
//     Invoice.invoiceNumber via invoiceNumberService.withInvoiceNumber()
//     instead of the bare cuid id being the only identifier.
//   - addInvoiceLineItem() (new) — append one more fee type to an
//     EXISTING invoice (the "+ Add a line" case), recomputing the
//     invoice's subtotal/totalAmount/balance/status in one transaction.
//   - getEligibleFeeStructuresForStudent() (new) — the single source of
//     truth for "which fee types apply to this student right now"
//     (mandatory-by-class/term, plus any actively COMMITTED optional
//     add-ons), now shared by GET /finances/fee-structures (when
//     studentId is given) and bulkInvoiceService — previously each
//     re-implemented the same where-clause independently.
//   - listStudentFeeCommitments() / upsertStudentFeeCommitment() /
//     updateStudentFeeCommitmentStatus() (new) — the Finance Fee
//     Structure workstation's "Enrolled Add-ons" / "Edit Add-on
//     Commitments" action.
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import type {
  GenerateInvoiceInput,
  RecordPaymentInput,
  AddInvoiceLineItemInput,
  CreateStudentFeeCommitmentInput,
  UpdateStudentFeeCommitmentInput,
} from '@shared/schemas/finance'
import { generateReceipt } from '@/server/services/receiptService'
import * as accountingService from '@/server/services/accountingService'
import { resolveStudentFromUid } from '@/server/services/studentService'
import { getSchoolBranding } from '@/server/services/notificationService'
import * as settingsService from '@/server/services/settingsService'
import { SETTING_KEYS } from '@shared/types/settings'
import { withInvoiceNumber } from '@/server/services/invoiceNumberService'

export async function checkBalanceGate(
  studentId: string,
  term: number,
  academicYear: string
): Promise<boolean> {
  // [R9] The incoming identifier may be a Firebase UID (confirmed live via
  // examService.getStudentResults()'s caller chain) rather than a Prisma
  // Student.id — resolve it first so the Invoice.studentId lookup below
  // actually matches a real row instead of silently matching nothing.
  const resolved = await resolveStudentFromUid(studentId)
  const realStudentId = resolved?.id ?? studentId

  const invoice = await prisma.invoice.findUnique({
    where: { studentId_academicYear_term: { studentId: realStudentId, academicYear, term } },
    select: { balance: true, status: true },
  })
  if (!invoice) return true
  const balance = Number(invoice.balance)
  const gateOpen = balance <= 0
  logger.info({ event: 'fee_gate_check', studentId: realStudentId, academicYear, term, balance, gateOpen })
  return gateOpen
}

// [PRODUCTION FIX 2026-09-05] Now includes each invoice's lineItems (so a
// caller can show per-fee-type status -- "Balance Cleared" vs still owing
// -- without a second round trip) and payments (receiptKey included) so
// the Student Portal Statement's "Student Invoices & Receipts" list has
// everything it needs in this one call. Previously returned bare Invoice
// rows with neither relation, which is what left that section of the
// student finance view permanently empty.
export async function getStudentBalance(studentId: string, academicYear: string) {
  const invoices = await prisma.invoice.findMany({
    where: { studentId, academicYear },
    orderBy: { term: 'asc' },
    include: {
      lineItems: true,
      payments: { orderBy: { paidAt: 'desc' } },
    },
  })
  const totalBalance = invoices.reduce(
    (sum: number, inv: { balance: unknown }) => sum + Number(inv.balance),
    0
  )
  return { invoices, totalBalance }
}

// [PRODUCTION FIX] Full rewrite. Previously this summed every fee
// structure that happened to apply to the student's class/term into one
// undifferentiated total -- there was no way to know which fee types an
// invoice covered, pay some and not others, or track a balance per fee
// type. Now:
//   1. The caller picks specific fee types (feeStructureIds) -- sourced
//      from actual active FeeStructure rows in the UI, not free text.
//   2. Each becomes its own InvoiceLineItem, so "School Fee" and
//      "Transport" on the same invoice have independent balances.
//   3. Any scholarship + manual discount is distributed proportionally
//      across the selected line items (by each fee's share of the
//      subtotal) so sum(lineItem.amount) reconciles exactly with
//      invoice.totalAmount -- the last line item absorbs the rounding
//      remainder rather than leaving a stray kobo unaccounted for.
//   4. dueDate is no longer a manual input (it never represented real
//      negotiated payment terms) -- set automatically, net-30.
//   5. Any unapplied StudentCredit for this student (from a previous
//      overpayment -- see recordPayment()) is automatically applied here,
//      reducing the new invoice's total/balance -- this is what "carries
//      an overpayment to the next term" in practice: it's consumed the
//      next time that student is invoiced, not left inert.
// [2026-09-05 REFACTOR] The subtotal/discount/credit math below used to
// live inline in generateInvoice() only. Extracted into
// computeInvoiceCharges() -- a pure read-and-compute step with no
// persistence -- so the Bulk Invoice Generator's dry-run preview can call
// the *exact same* accounting logic to show real projected figures
// (scholarship absorbed, credit consumed, net payable) before anything is
// actually committed, instead of a second, drifting reimplementation.
// generateInvoice() itself now only adds the existing-invoice guard and
// the actual persistence step.
export interface InvoiceChargeOptions {
  /** Default true. false skips the scholarship lookup entirely --
   *  the Bulk Invoice Generator's "Apply Scholarship & Staff Discounts"
   *  checkbox. */
  applyScholarship?: boolean
  /** Default true. false skips applying any prior StudentCredit -- the
   *  Bulk Invoice Generator's "Consume Prior Advance Credit" checkbox. */
  consumeCredit?: boolean
  manualDiscount?: number
}

export async function computeInvoiceCharges(
  studentId: string,
  academicYear: string,
  feeStructureIds: string[],
  options?: InvoiceChargeOptions
) {
  const applyScholarship = options?.applyScholarship ?? true
  const consumeCredit = options?.consumeCredit ?? true

  const feeStructures = await prisma.feeStructure.findMany({
    where: { id: { in: feeStructureIds }, isActive: true },
  })
  if (feeStructures.length === 0) {
    throw new Error('Select at least one fee type.')
  }
  if (feeStructures.length !== feeStructureIds.length) {
    throw new Error('One or more selected fee types could not be found or are no longer active.')
  }

  const subtotal = feeStructures.reduce((sum, f) => sum + Number(f.amount), 0)

  const scholarship = applyScholarship
    ? await prisma.scholarship.findFirst({ where: { studentId, academicYear, isActive: true } })
    : null
  let discount = 0
  if (scholarship) {
    discount = scholarship.discountType === 'PERCENTAGE'
      ? subtotal * (Number(scholarship.value) / 100)
      : Number(scholarship.value)
  }
  // Manual discount stacks on top of any scholarship discount rather than
  // replacing it -- a scholarship and a one-off manual adjustment are
  // independent reasons a family might owe less.
  if (options?.manualDiscount) discount += options.manualDiscount
  discount = Math.min(discount, subtotal) // never a negative total from discount alone

  // Distribute the discount proportionally across line items so each
  // fee type's own "amount owed" reflects its fair share -- the last
  // item absorbs whatever rounding remainder is left so the sum is exact.
  let allocatedDiscount = 0
  const lineItemsData = feeStructures.map((f, idx) => {
    const full = Number(f.amount)
    const isLast = idx === feeStructures.length - 1
    let share = subtotal > 0 ? Math.round((full / subtotal) * discount * 100) / 100 : 0
    if (isLast) share = Math.round((discount - allocatedDiscount) * 100) / 100
    allocatedDiscount += share
    const amount = Math.max(0, Math.round((full - share) * 100) / 100)
    return {
      feeStructureId: f.id,
      feeName: f.name,
      amount,
      paidAmount: 0,
      balance: amount,
    }
  })

  let totalAmount = Math.max(0, subtotal - discount)

  // [PRODUCTION FIX] Auto-apply any unapplied credit from a prior
  // overpayment (see recordPayment()) -- oldest first, applied against
  // this new invoice's total before it's even created, so a family that
  // overpaid last term sees it reflected immediately rather than needing
  // a separate manual step.
  const availableCredits = consumeCredit
    ? await prisma.studentCredit.findMany({
        where: { studentId, amount: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      })
    : []
  const creditApplications: { id: string; amountUsed: number; remaining: number }[] = []
  let remainingToCover = totalAmount
  for (const credit of availableCredits) {
    if (remainingToCover <= 0) break
    const available = Number(credit.amount)
    const used = Math.min(available, remainingToCover)
    remainingToCover -= used
    creditApplications.push({ id: credit.id, amountUsed: used, remaining: available - used })
  }
  const creditApplied = creditApplications.reduce((sum, c) => sum + c.amountUsed, 0)
  totalAmount = Math.max(0, Math.round((totalAmount - creditApplied) * 100) / 100)

  return { feeStructures, subtotal, scholarship, discount, lineItemsData, totalAmount, creditApplications, creditApplied }
}

export async function generateInvoice(
  data: GenerateInvoiceInput,
  actorUid: string,
  actorRole: string,
  chargeOptions?: Pick<InvoiceChargeOptions, 'applyScholarship' | 'consumeCredit'>
) {
  const existing = await prisma.invoice.findUnique({
    where: { studentId_academicYear_term: { studentId: data.studentId, academicYear: data.academicYear, term: data.term } },
  })
  if (existing) throw new Error('Invoice already exists for this term')

  const {
    feeStructures, subtotal, scholarship, discount,
    lineItemsData, totalAmount, creditApplications, creditApplied,
  } = await computeInvoiceCharges(data.studentId, data.academicYear, data.feeStructureIds, {
    applyScholarship: chargeOptions?.applyScholarship,
    consumeCredit: chargeOptions?.consumeCredit,
    manualDiscount: data.manualDiscount,
  })

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 30) // net-30, not user-configurable per invoice

  const invoice = await withInvoiceNumber(data.academicYear, (invoiceNumber) =>
    prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          studentId: data.studentId,
          academicYear: data.academicYear,
          term: data.term,
          subtotal,
          discount,
          latePenalty: 0,
          totalAmount,
          paidAmount: 0,
          balance: totalAmount,
          status: totalAmount <= 0 ? 'PAID' : 'UNPAID',
          dueDate,
          scholarshipId: scholarship?.id ?? null,
          lineItems: { create: lineItemsData },
        },
        include: { lineItems: true },
      })
      for (const c of creditApplications) {
        await tx.studentCredit.update({
          where: { id: c.id },
          data: { amount: c.remaining, lastAppliedAt: new Date() },
        })
      }
      return created
    })
  )

  logger.info({
    event: 'invoice.generated', invoiceId: invoice.id, studentId: data.studentId,
    totalAmount, feeTypes: feeStructures.map((f) => f.name), creditApplied, actorUid, actorRole,
  })
  return invoice
}

// [PRODUCTION FIX] Thrown when one or more allocations in a payment would
// exceed that specific line item's own remaining balance. The route layer
// catches this by name and returns it as a 409 with the overpayment
// breakdown, rather than a generic 500/400 -- the client shows a
// confirmation dialog ("this pays off Transport and leaves MWK X as
// credit -- continue?") and resubmits with confirmOverpayment: true once
// the person has actually seen and accepted that.
export class OverpaymentConfirmationRequiredError extends Error {
  constructor(public readonly overpayments: { lineItemId: string; feeName: string; excess: number }[]) {
    super('This payment exceeds the balance on one or more fees and will create a credit. Confirmation required.')
    this.name = 'OverpaymentConfirmationRequiredError'
  }
}

// [PRODUCTION FIX] Full rewrite. A payment previously applied as one
// undifferentiated amount against the whole invoice. It now allocates
// across specific fee-type line items (data.allocations), which is what
// makes "pay MWK 30,000 toward School Fee and MWK 5,000 toward Transport
// in the same transaction" possible, and what makes overpayment on one
// specific fee (rather than the invoice as a whole) detectable at all.
//
// Accounting rules enforced here, matching the actual request:
//   1. sum(allocations) must not exceed data.amount (the total actually
//      being paid in this transaction) -- you cannot allocate money you
//      are not paying. Any genuine unallocated remainder (amount minus
//      what was allocated to real line items) becomes a StudentCredit,
//      same as case 2 below, since it isn't tied to any specific fee.
//   2. If one allocation exceeds that line item's own remaining balance,
//      the excess does NOT create a negative balance or silently
//      overpay -- it becomes a StudentCredit against the student's
//      account, auto-applied to their next invoice (see
//      generateInvoice()). This requires confirmOverpayment: true on the
//      request; the first submission without it throws
//      OverpaymentConfirmationRequiredError so the client can warn and
//      get explicit confirmation first, exactly as requested.
export async function recordPayment(data: RecordPaymentInput, actorUid: string, actorRole: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: data.invoiceId },
    include: { payments: true, lineItems: true },
  })

  const allocationTotal = Math.round(data.allocations.reduce((sum, a) => sum + a.amount, 0) * 100) / 100
  if (allocationTotal > data.amount + 0.01) {
    throw new Error(
      `Allocated amount MWK ${allocationTotal.toLocaleString()} cannot exceed the total payment MWK ${data.amount.toLocaleString()}.`
    )
  }

  const lineItemsById = new Map(invoice.lineItems.map((li) => [li.id, li]))
  for (const a of data.allocations) {
    const li = lineItemsById.get(a.lineItemId)
    if (!li) throw new Error('One or more allocated fees do not belong to this invoice.')
    if (li.invoiceId !== invoice.id) throw new Error('One or more allocated fees do not belong to this invoice.')
  }

  // Detect per-line-item overpayment (allocation > that fee's own balance).
  const overpayments = data.allocations
    .map((a) => {
      const li = lineItemsById.get(a.lineItemId)!
      const excess = Math.round((a.amount - Number(li.balance)) * 100) / 100
      return excess > 0.01 ? { lineItemId: a.lineItemId, feeName: li.feeName, excess } : null
    })
    .filter((x): x is { lineItemId: string; feeName: string; excess: number } => x !== null)

  // The unallocated remainder (paid but not assigned to any fee) is also
  // effectively an overpayment against nothing in particular.
  const unallocatedRemainder = Math.round((data.amount - allocationTotal) * 100) / 100
  if (unallocatedRemainder > 0.01) {
    overpayments.push({ lineItemId: '', feeName: 'Unallocated', excess: unallocatedRemainder })
  }

  if (overpayments.length > 0 && !data.confirmOverpayment) {
    throw new OverpaymentConfirmationRequiredError(overpayments)
  }

  const totalCreditToCreate = overpayments.reduce((sum, o) => sum + o.excess, 0)
  const appliedToInvoice = Math.round((data.amount - totalCreditToCreate) * 100) / 100

  const [payment, updatedInvoice] = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        recordedByUid: actorUid,
      },
    })

    // Apply each allocation to its line item, capped at that item's own
    // balance -- the capped portion is what actually reduces the
    // invoice's total balance; anything beyond the cap became credit above.
    for (const a of data.allocations) {
      const li = lineItemsById.get(a.lineItemId)!
      const appliedToLine = Math.min(a.amount, Number(li.balance))
      await tx.paymentAllocation.create({
        data: { paymentId: p.id, lineItemId: a.lineItemId, amount: a.amount },
      })
      await tx.invoiceLineItem.update({
        where: { id: a.lineItemId },
        data: {
          paidAmount: Number(li.paidAmount) + appliedToLine,
          balance: Math.max(0, Number(li.balance) - appliedToLine),
        },
      })
    }

    if (totalCreditToCreate > 0) {
      await tx.studentCredit.create({
        data: {
          studentId: invoice.studentId,
          amount: totalCreditToCreate,
          originalAmount: totalCreditToCreate,
          sourcePaymentId: p.id,
          reason: `Overpayment on ${invoice.academicYear} Term ${invoice.term}: ${overpayments.map((o) => o.feeName).join(', ')}`,
        },
      })
    }

    const newPaid = Number(invoice.paidAmount) + appliedToInvoice
    const newBalance = Math.max(0, Number(invoice.totalAmount) - newPaid)
    const newStatus = newBalance <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID'
    const inv = await tx.invoice.update({
      where: { id: data.invoiceId },
      data: { paidAmount: newPaid, balance: newBalance, status: newStatus },
    })
    return [p, inv] as const
  })

  const student = await prisma.student.findUnique({
    where: { id: invoice.studentId },
    select: { firstName: true, lastName: true, registrationNo: true },
  })

  // [R9] HEADLINE FIX — reconnect real tuition revenue to the double-entry
  // accounting ledger. accountingService.recordPaymentEntry() already
  // existed, fully correct, but nothing ever called it — every
  // AccountingLedgerTab.tsx view showed near-zero revenue regardless of
  // how much tuition had actually been collected. A posting failure here
  // must not roll back an already-committed, real payment — logged for
  // reconciliation instead, matching the receipt-generation pattern
  // immediately below.
  try {
    await accountingService.recordPaymentEntry({
      invoiceId:   data.invoiceId,
      studentName: student ? `${student.firstName} ${student.lastName}` : invoice.studentId,
      amount:      data.amount,
      paymentRef:  payment.reference ?? payment.id,
      actorUid,
    })
  } catch (err) {
    logger.error({ event: 'accounting.payment_posting_failed', paymentId: payment.id, invoiceId: data.invoiceId, err })
  }

  let receiptKey: string | undefined
  try {
    if (student) {
      const [branding, receiptPrefix] = await Promise.all([
        getSchoolBranding(),
        settingsService.get(SETTING_KEYS.RECEIPT_PREFIX),
      ])
      receiptKey = await generateReceipt(
        payment.id,
        { id: invoice.id, studentId: invoice.studentId, academicYear: invoice.academicYear, term: invoice.term },
        {
          amount: Number(payment.amount),
          method: String(payment.method),
          reference: payment.reference ?? null,
          recordedAt: payment.paidAt,    // Prisma field is paidAt, not recordedAt
        },
        { firstName: student.firstName, lastName: student.lastName, registrationNo: student.registrationNo },
        {
          schoolName: branding.schoolName,
          schoolAddress: branding.schoolAddress,
          schoolPhone: branding.schoolPhone,
          schoolEmail: branding.schoolEmail,
        },
        receiptPrefix,
      )
      await prisma.payment.update({ where: { id: payment.id }, data: { receiptKey } })
    }
  } catch (err) {
    logger.error({ event: 'receipt.generation_failed', paymentId: payment.id, err })
  }

  logger.info({ event: 'payment.recorded', paymentId: payment.id, invoiceId: data.invoiceId, amount: data.amount, method: data.method, actorUid, actorRole })
  return { payment: { ...payment, receiptKey }, invoice: updatedInvoice }
}

// R19: the late-payment penalty rate is an admin-configurable percentage
// exposed in FinanceSettings.tsx and persisted as the `late_payment_penalty_pct`
// SystemSettings row by the /settings/finance route (a raw, string-keyed
// setting outside the typed SETTING_KEYS map). Reading it here — instead of a
// hardcoded 0.05 — makes the admin control actually take effect. Value is a
// percentage (e.g. 5 => 5%); we convert to a fraction. Falls back to 5% to
// match the FinanceSettings default when the row is absent or invalid.
const LATE_PENALTY_PCT_SETTING_KEY = 'late_payment_penalty_pct'
const DEFAULT_LATE_PENALTY_RATE = 0.05

async function resolveLatePenaltyRate(): Promise<number> {
  const row = await prisma.systemSettings.findUnique({
    where: { key: LATE_PENALTY_PCT_SETTING_KEY },
  })
  if (!row) return DEFAULT_LATE_PENALTY_RATE
  const pct = Number(row.value)
  if (!Number.isFinite(pct) || pct < 0) return DEFAULT_LATE_PENALTY_RATE
  return pct / 100
}

export async function applyLatePenalties(penaltyRate?: number): Promise<number> {
  const rate = penaltyRate ?? (await resolveLatePenaltyRate())
  const overdue = await prisma.invoice.findMany({
    where: { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lt: new Date() }, latePenalty: { equals: 0 } },
  })
  for (const inv of overdue) {
    const penalty = Number(inv.balance) * rate
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { latePenalty: { increment: penalty }, totalAmount: { increment: penalty }, balance: { increment: penalty }, status: 'OVERDUE' },
    })
  }
  logger.info({ event: 'late_penalties.applied', count: overdue.length, rate })
  return overdue.length
}

export async function getFinanceSummary(academicYear: string, term: number) {
  const invoices = await prisma.invoice.findMany({
    where: { academicYear, term },
    select: { totalAmount: true, paidAmount: true, balance: true },
  })
  const totalCollected = invoices.reduce((s: number, i: { paidAmount: unknown }) => s + Number(i.paidAmount), 0)
  const totalOutstanding = invoices.reduce((s: number, i: { balance: unknown }) => s + Number(i.balance), 0)
  const collectionTarget = invoices.reduce((s: number, i: { totalAmount: unknown }) => s + Number(i.totalAmount), 0)
  const collectionPercent = collectionTarget > 0 ? Math.round((totalCollected / collectionTarget) * 100) : 0
  const expenses = await prisma.expense.aggregate({
    where: { academicYear, term, status: 'APPROVED' },
    _sum: { amount: true },
  })
  return { totalCollected, totalOutstanding, totalExpenses: Number(expenses._sum.amount ?? 0), collectionTarget, collectionPercent }
}
// ─── ADD LINE TO EXISTING INVOICE ────────────────────────
// [NEW] Append one more fee type to an EXISTING invoice -- the Invoice
// Entry screen's "+ Add a line" affordance for a student who already has
// an invoice this term (e.g. joining Transport partway through). Added at
// the fee's full standard rate: the original invoice's scholarship/manual
// discount was computed once, at generation time, over the line items
// that existed then (see generateInvoice()) -- it is not retroactively
// redistributed onto a line added afterward. A discount on this specific
// addition would need its own adjustment, which is out of scope here,
// exactly as GenerateInvoiceSchema documents for manualDiscount.
export async function addInvoiceLineItem(
  data: AddInvoiceLineItemInput,
  actorUid: string,
  actorRole: string
) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: data.invoiceId },
    include: { lineItems: true },
  })

  if (invoice.lineItems.some((li) => li.feeStructureId === data.feeStructureId)) {
    throw new Error('This fee type is already on this invoice.')
  }

  const feeStructure = await prisma.feeStructure.findUnique({ where: { id: data.feeStructureId } })
  if (!feeStructure || !feeStructure.isActive) {
    throw new Error('This fee type could not be found or is no longer active.')
  }

  const amount = Number(feeStructure.amount)

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.create({
      data: {
        invoiceId: invoice.id,
        feeStructureId: feeStructure.id,
        feeName: feeStructure.name,
        amount,
        paidAmount: 0,
        balance: amount,
      },
    })
    const newSubtotal = Math.round((Number(invoice.subtotal) + amount) * 100) / 100
    const newTotal = Math.round((Number(invoice.totalAmount) + amount) * 100) / 100
    const newBalance = Math.round((Number(invoice.balance) + amount) * 100) / 100
    const newStatus = newBalance <= 0 ? 'PAID' : Number(invoice.paidAmount) > 0 ? 'PARTIAL' : 'UNPAID'
    return tx.invoice.update({
      where: { id: invoice.id },
      data: { subtotal: newSubtotal, totalAmount: newTotal, balance: newBalance, status: newStatus },
      include: { lineItems: true },
    })
  })

  logger.info({
    event: 'invoice.line_item_added', invoiceId: invoice.id,
    feeStructureId: feeStructure.id, amount, actorUid, actorRole,
  })
  return updated
}

// ─── ELIGIBLE FEE STRUCTURES FOR A STUDENT ───────────────
// [NEW] Single source of truth for "which fee types apply to this student
// right now": every active, mandatory FeeStructure matching their class
// and this term (applies automatically -- no commitment row needed), plus
// any OPTIONAL fee type they have an active COMMITTED StudentFeeCommitment
// for this academic year. Replaces two independent, near-identical
// where-clauses that used to live separately in GET
// /finances/fee-structures (studentId branch) and bulkInvoiceService.ts --
// both now call this instead. The `options` flags map directly onto the
// Bulk Invoice Generator's "Include Mandatory Core Levies" / "Include
// Enrolled Optional Services" checkboxes.
export async function getEligibleFeeStructuresForStudent(
  studentId: string,
  academicYear: string,
  term: number,
  options?: { includeMandatory?: boolean; includeOptionalCommitted?: boolean }
) {
  const includeMandatory = options?.includeMandatory ?? true
  const includeOptionalCommitted = options?.includeOptionalCommitted ?? true

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { classId: true },
  })

  const results: Awaited<ReturnType<typeof prisma.feeStructure.findMany>> = []
  const seen = new Set<string>()

  if (includeMandatory) {
    const where: Prisma.FeeStructureWhereInput = {
      academicYear,
      isActive: true,
      mandatory: true,
      OR: [{ classId: null }, ...(student?.classId ? [{ classId: student.classId }] : [])],
      AND: [{ OR: [{ term: null }, { term }] }],
    }
    const mandatoryFees = await prisma.feeStructure.findMany({ where, orderBy: { name: 'asc' } })
    for (const f of mandatoryFees) {
      results.push(f)
      seen.add(f.id)
    }
  }

  if (includeOptionalCommitted) {
    const commitments = await prisma.studentFeeCommitment.findMany({
      where: { studentId, academicYear, status: 'COMMITTED' },
      include: { feeStructure: true },
    })
    for (const c of commitments) {
      const f = c.feeStructure
      if (!seen.has(f.id) && f.isActive && f.academicYear === academicYear) {
        results.push(f)
        seen.add(f.id)
      }
    }
  }

  return results
}

// ─── STUDENT FEE COMMITMENTS (enrolled add-ons) ──────────
// [NEW] The Finance Fee Structure workstation's "Enrolled Add-ons" list
// and "Edit Add-on Commitments" action -- see StudentFeeCommitment in
// schema.prisma.
export async function listStudentFeeCommitments(studentId: string, academicYear: string) {
  return prisma.studentFeeCommitment.findMany({
    where: { studentId, academicYear },
    include: {
      feeStructure: {
        select: { id: true, name: true, code: true, category: true, amount: true, mandatory: true, schedule: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function upsertStudentFeeCommitment(
  data: CreateStudentFeeCommitmentInput,
  actorUid: string
) {
  const feeStructure = await prisma.feeStructure.findUnique({ where: { id: data.feeStructureId } })
  if (!feeStructure) throw new Error('Fee type not found.')
  if (feeStructure.mandatory) {
    throw new Error('Mandatory fees apply automatically and cannot be committed to individually.')
  }
  if (!feeStructure.isActive) {
    throw new Error('This fee type has been archived and can no longer be committed to.')
  }

  // Reactivate an existing (possibly WAIVED) row for this exact triple
  // instead of creating a duplicate -- see @@unique([studentId,
  // feeStructureId, academicYear]) on StudentFeeCommitment.
  const existing = await prisma.studentFeeCommitment.findUnique({
    where: {
      studentId_feeStructureId_academicYear: {
        studentId: data.studentId,
        feeStructureId: data.feeStructureId,
        academicYear: data.academicYear,
      },
    },
  })

  const commitment = existing
    ? await prisma.studentFeeCommitment.update({
        where: { id: existing.id },
        data: { status: 'COMMITTED', notes: data.notes ?? existing.notes },
      })
    : await prisma.studentFeeCommitment.create({
        data: {
          studentId: data.studentId,
          feeStructureId: data.feeStructureId,
          academicYear: data.academicYear,
          notes: data.notes ?? null,
          createdByUid: actorUid,
        },
      })

  logger.info({
    event: 'studentFeeCommitment.upserted', studentId: data.studentId,
    feeStructureId: data.feeStructureId, academicYear: data.academicYear, actorUid,
  })
  return commitment
}

export async function updateStudentFeeCommitmentStatus(
  id: string,
  data: UpdateStudentFeeCommitmentInput
) {
  const commitment = await prisma.studentFeeCommitment.update({
    where: { id },
    data: { status: data.status, ...(data.notes !== undefined ? { notes: data.notes } : {}) },
  })
  logger.info({ event: 'studentFeeCommitment.statusChanged', id, status: data.status })
  return commitment
}
