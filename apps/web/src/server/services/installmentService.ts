import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { addMonths, addWeeks } from 'date-fns'

export type InstallmentFrequency = 'MONTHLY' | 'TERM_WISE'

// Create an installment plan for an invoice
export async function createInstallmentPlan(
  invoiceId: string,
  frequency: InstallmentFrequency,
  count: number, // number of installments e.g. 3 for term-wise, 6 for bi-monthly
  startDate: Date,
  actorUid: string
): Promise<string> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
  })

  if (invoice.status === 'PAID') {
    throw new Error('Cannot create installment plan for a fully paid invoice')
  }

  // Check no plan already exists
  const existing = await prisma.installmentPlan.findUnique({ where: { invoiceId } })
  if (existing) throw new Error('Installment plan already exists for this invoice')

  const totalAmount = Number(invoice.balance)
  const baseAmount = Math.floor((totalAmount / count) * 100) / 100
  const lastAmount = totalAmount - baseAmount * (count - 1) // absorb rounding diff

  const plan = await prisma.installmentPlan.create({
    data: { invoiceId, totalAmount, createdByUid: actorUid },
  })

  const installmentData = Array.from({ length: count }, (_, i) => {
    const dueDate = frequency === 'MONTHLY' ? addMonths(startDate, i) : addWeeks(startDate, i * 16) // ~term length

    return {
      planId: plan.id,
      dueDate,
      amount: i === count - 1 ? lastAmount : baseAmount,
      status: 'PENDING' as const,
    }
  })

  await prisma.installment.createMany({ data: installmentData })

  logger.info({
    event: 'installment_plan.created',
    planId: plan.id,
    invoiceId,
    count,
    frequency,
    actorUid,
  })

  return plan.id
}

export async function getInstallmentPlan(invoiceId: string) {
  return prisma.installmentPlan.findUnique({
    where: { invoiceId },
    include: { installments: { orderBy: { dueDate: 'asc' } } },
  })
}

// Mark overdue installments — called by Cloud Scheduler daily
export async function markOverdueInstallments(): Promise<number> {
  const result = await prisma.installment.updateMany({
    where: {
      status: 'PENDING',
      dueDate: { lt: new Date() },
    },
    data: { status: 'OVERDUE' },
  })
  logger.info({ event: 'installments.overdue_marked', count: result.count })
  return result.count
}