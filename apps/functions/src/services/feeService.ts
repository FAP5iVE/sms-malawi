import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import type { GenerateInvoiceInput, RecordPaymentInput } from '@shared/schemas/finance'
import { generateReceipt } from './receiptService'
import type { Prisma } from '@prisma/client'

// ---------------------------------------------------------
// CRITICAL: FEE GATE — called by examService before every
// result query. Returns true if student can see results.
// Returns false if balance > 0 for the given term/year.
// ---------------------------------------------------------
export async function checkBalanceGate(
  studentId: string,
  term: number,
  academicYear: string
): Promise<boolean> {
  const invoice = await prisma.invoice.findUnique({
    where: { studentId_academicYear_term: { studentId, academicYear, term } },
    select: { balance: true, status: true },
  })
  // No invoice found → no fees charged → gate is open
  if (!invoice) return true
  // Balance must be exactly 0 to pass the gate
  const balance = Number(invoice.balance)
  const gateOpen = balance <= 0
  logger.info({
    event: 'fee_gate_check',
    studentId,
    academicYear,
    term,
    balance,
    gateOpen,
  })
  return gateOpen
}

// --- GET STUDENT BALANCE ---------------------------------
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

// --- GENERATE INVOICE FOR STUDENT/TERM -------------------
export async function generateInvoice(
  data: GenerateInvoiceInput,
  actorUid: string,
  actorRole: string
) {
  // Check for existing invoice
  const existing = await prisma.invoice.findUnique({
    where: {
      studentId_academicYear_term: {
        studentId: data.studentId,
        academicYear: data.academicYear,
        term: data.term,
      },
    },
  })
  if (existing) throw new Error('Invoice already exists for this term')

  // Get applicable fee structures for this student's class + year + term
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: data.studentId },
    select: { classId: true },
  })
  const feeStructures = await prisma.feeStructure.findMany({
    where: {
      academicYear: data.academicYear,
      isActive: true,
      OR: [{ classId: null }, { classId: student.classId ?? undefined }],
      AND: [{ OR: [{ term: null }, { term: data.term }] }],
    },
  })
  const subtotal = feeStructures.reduce(
    (sum: number, f: { amount: unknown }) => sum + Number(f.amount),
    0
  )

  // Apply scholarship if exists
  const scholarship = await prisma.scholarship.findFirst({
    where: { studentId: data.studentId, academicYear: data.academicYear, isActive: true },
  })
  let discount = 0
  if (scholarship) {
    discount =
      scholarship.discountType === 'PERCENTAGE'
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
      scholarshipId: scholarship?.id,
    },
  })
  logger.info({
    event: 'invoice.generated',
    invoiceId: invoice.id,
    studentId: data.studentId,
    totalAmount,
    actorUid,
    actorRole,
  })
  return invoice
}

// --- RECORD PAYMENT --------------------------------------
export async function recordPayment(data: RecordPaymentInput, actorUid: string, actorRole: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: data.invoiceId },
    include: { payments: true },
  })

  // Validate amount doesn't exceed outstanding balance
  if (data.amount > Number(invoice.balance)) {
    throw new Error(`Payment MWK ${data.amount} exceeds outstanding balance MWK ${invoice.balance}`)
  }

  // Create payment record in transaction
  const [payment, updatedInvoice] = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
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
    return [p, inv]
  })

  // Generate receipt PDF — non-critical: log failure but don't rethrow
  let receiptKey: string | undefined
  try {
    receiptKey = await generateReceipt(payment.id, invoice, data.amount, actorUid)
    await prisma.payment.update({
      where: { id: payment.id },
      data: { receiptKey },
    })
  } catch (err) {
    logger.error({ event: 'receipt.generation_failed', paymentId: payment.id, err })
  }

  logger.info({
    event: 'payment.recorded',
    paymentId: payment.id,
    invoiceId: data.invoiceId,
    amount: data.amount,
    method: data.method,
    actorUid,
    actorRole,
  })
  return { payment: { ...payment, receiptKey }, invoice: updatedInvoice }
}

// --- APPLY LATE PENALTY ----------------------------------
// Called by Cloud Scheduler daily (scheduledJobs.ts).
// Penalises outstanding balance (not gross total) and guards
// against double-penalising via latePenalty: { equals: 0 }.
// penaltyRate: 0.05 = 5%
export async function applyLatePenalties(penaltyRate = 0.05): Promise<number> {
  const overdue = await prisma.invoice.findMany({
    where: {
      status: { in: ['UNPAID', 'PARTIAL'] },
      dueDate: { lt: new Date() },
      latePenalty: { equals: 0 }, // prevents double-penalising if job runs twice
    },
  })
  for (const inv of overdue) {
    const penalty = Number(inv.balance) * penaltyRate // penalise outstanding, not gross
    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        latePenalty: { increment: penalty }, // safe for concurrent writes
        totalAmount: { increment: penalty },
        balance: { increment: penalty },
        status: 'OVERDUE',
      },
    })
  }
  logger.info({ event: 'late_penalties.applied', count: overdue.length, rate: penaltyRate })
  return overdue.length
}

// --- FINANCE SUMMARY (dashboard widget) ------------------
export async function getFinanceSummary(academicYear: string, term: number) {
  const invoices = await prisma.invoice.findMany({
    where: { academicYear, term },
    select: { totalAmount: true, paidAmount: true, balance: true },
  })
  const totalCollected = invoices.reduce(
    (s: number, i: { paidAmount: unknown }) => s + Number(i.paidAmount),
    0
  )
  const totalOutstanding = invoices.reduce(
    (s: number, i: { balance: unknown }) => s + Number(i.balance),
    0
  )
  const collectionTarget = invoices.reduce(
    (s: number, i: { totalAmount: unknown }) => s + Number(i.totalAmount),
    0
  )
  const collectionPercent =
    collectionTarget > 0 ? Math.round((totalCollected / collectionTarget) * 100) : 0

  const expenses = await prisma.expense.aggregate({
    where: { academicYear, term, status: 'APPROVED' },
    _sum: { amount: true },
  })
  return {
    totalCollected,
    totalOutstanding,
    totalExpenses: Number(expenses._sum.amount ?? 0),
    collectionTarget,
    collectionPercent,
  }
}
