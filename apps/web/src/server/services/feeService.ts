// apps/web/src/server/services/feeService.ts
// Fixed: Promise on checkBalanceGate (was empty Promise<>)
// Fixed: removed empty Promise<> from $transaction return (let TypeScript infer)
// Fixed: payment.paidAt (not recordedAt — actual Prisma field name)
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { GenerateInvoiceInput, RecordPaymentInput } from '@shared/schemas/finance'
import { generateReceipt } from '@/server/services/receiptService'

export async function checkBalanceGate(
  studentId: string,
  term: number,
  academicYear: string
): Promise<boolean> {
  const invoice = await prisma.invoice.findUnique({
    where: { studentId_academicYear_term: { studentId, academicYear, term } },
    select: { balance: true, status: true },
  })
  if (!invoice) return true
  const balance = Number(invoice.balance)
  const gateOpen = balance <= 0
  logger.info({ event: 'fee_gate_check', studentId, academicYear, term, balance, gateOpen })
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

  let receiptKey: string | undefined
  try {
    if (student) {
      receiptKey = await generateReceipt(
        payment.id,
        { id: invoice.id, studentId: invoice.studentId, academicYear: invoice.academicYear, term: invoice.term },
        {
          amount: Number(payment.amount),
          method: String(payment.method),
          reference: payment.reference ?? null,
          recordedAt: payment.paidAt,    // Prisma field is paidAt, not recordedAt
        },
        { firstName: student.firstName, lastName: student.lastName, registrationNo: student.registrationNo }
      )
      await prisma.payment.update({ where: { id: payment.id }, data: { receiptKey } })
    }
  } catch (err) {
    logger.error({ event: 'receipt.generation_failed', paymentId: payment.id, err })
  }

  logger.info({ event: 'payment.recorded', paymentId: payment.id, invoiceId: data.invoiceId, amount: data.amount, method: data.method, actorUid, actorRole })
  return { payment: { ...payment, receiptKey }, invoice: updatedInvoice }
}

export async function applyLatePenalties(penaltyRate = 0.05): Promise<number> {
  const overdue = await prisma.invoice.findMany({
    where: { status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lt: new Date() }, latePenalty: { equals: 0 } },
  })
  for (const inv of overdue) {
    const penalty = Number(inv.balance) * penaltyRate
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { latePenalty: { increment: penalty }, totalAmount: { increment: penalty }, balance: { increment: penalty }, status: 'OVERDUE' },
    })
  }
  logger.info({ event: 'late_penalties.applied', count: overdue.length, rate: penaltyRate })
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