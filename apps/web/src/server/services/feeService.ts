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
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { GenerateInvoiceInput, RecordPaymentInput } from '@shared/schemas/finance'
import { generateReceipt } from '@/server/services/receiptService'
import * as accountingService from '@/server/services/accountingService'
import { resolveStudentFromUid } from '@/server/services/studentService'
import { getSchoolBranding } from '@/server/services/notificationService'
import * as settingsService from '@/server/services/settingsService'
import { SETTING_KEYS } from '@shared/types/settings'

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

export async function getStudentBalance(studentId: string, academicYear: string) {
  const invoices = await prisma.invoice.findMany({
    where: { studentId, academicYear },
    orderBy: { term: 'asc' },
  })
  const totalBalance = invoices.reduce(
    (sum: number, inv: { balance: unknown }) => sum + Number(inv.balance),
    0
  )
  return { invoices, totalBalance }
}

export async function generateInvoice(
  data: GenerateInvoiceInput,
  actorUid: string,
  actorRole: string
) {
  const existing = await prisma.invoice.findUnique({
    where: { studentId_academicYear_term: { studentId: data.studentId, academicYear: data.academicYear, term: data.term } },
  })
  if (existing) throw new Error('Invoice already exists for this term')

  const student = await prisma.student.findUniqueOrThrow({
    where: { id: data.studentId },
    select: { classId: true },
  })

  const feeStructures = await prisma.feeStructure.findMany({
    where: {
      academicYear: data.academicYear,
      isActive: true,
      ...(student.classId
        ? { OR: [{ classId: null }, { classId: student.classId }] }
        : { classId: null }),
      AND: [{ OR: [{ term: null }, { term: data.term }] }],
    },
  })
  const subtotal = feeStructures.reduce(
    (sum: number, f: { amount: unknown }) => sum + Number(f.amount), 0
  )

  const scholarship = await prisma.scholarship.findFirst({
    where: { studentId: data.studentId, academicYear: data.academicYear, isActive: true },
  })
  let discount = 0
  if (scholarship) {
    discount = scholarship.discountType === 'PERCENTAGE'
      ? subtotal * (Number(scholarship.value) / 100)
      : Number(scholarship.value)
  }
  const totalAmount = Math.max(0, subtotal - discount)

  const invoice = await prisma.invoice.create({
    data: {
      studentId: data.studentId,
      academicYear: data.academicYear,
      term: data.term,
      subtotal,
      discount,
      latePenalty: 0,
      totalAmount,
      paidAmount: 0,
      balance: totalAmount,
      status: 'UNPAID',
      dueDate: new Date(data.dueDate),
      scholarshipId: scholarship?.id ?? null,
    },
  })
  logger.info({ event: 'invoice.generated', invoiceId: invoice.id, studentId: data.studentId, totalAmount, actorUid, actorRole })
  return invoice
}

export async function recordPayment(data: RecordPaymentInput, actorUid: string, actorRole: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: data.invoiceId },
    include: { payments: true },
  })

  if (data.amount > Number(invoice.balance)) {
    throw new Error(`Payment MWK ${data.amount} exceeds outstanding balance MWK ${invoice.balance}`)
  }

  // No explicit return type annotation on $transaction — let TypeScript infer
  // (explicit Promise<> with wrong generics was causing the TS2314 error)
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
    const newPaid = Number(invoice.paidAmount) + data.amount
    const newBalance = Number(invoice.totalAmount) - newPaid
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