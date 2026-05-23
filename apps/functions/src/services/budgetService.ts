import { prisma } from '../lib/prisma'
import { CreateBudgetSchema } from '@shared/schemas/finance'
import { CreateBudgetInput } from '@shared/schemas/finance'
import { z } from 'zod'

export async function createBudget(data: CreateBudgetInput, actorUid: string) {
  // Explicit spread instead of ...data to satisfy TS strict spread check
  return prisma.budget.create({
    data: {
      academicYear: data.academicYear,
      term: data.term,
      department: data.department,
      category: data.category,
      allocated: data.allocated,
      description: data.description,
      createdByUid: actorUid,
    },
  })
}

export async function getBudgets(academicYear: string) {
  return prisma.budget.findMany({
    where: { academicYear },
    orderBy: [{ department: 'asc' }, { category: 'asc' }],
  })
}

export async function getBudgetVsActual(academicYear: string, term?: number) {
  const budgets = await prisma.budget.findMany({
    where: { academicYear, ...(term ? { term } : {}) },
  })
  const actuals = await prisma.expense.groupBy({
    by: ['category'],
    where: { academicYear, status: 'APPROVED', ...(term ? { term } : {}) },
    _sum: { amount: true },
  })
  const byCategory = Object.fromEntries(
    actuals.map((a) => [a.category, Number(a._sum.amount ?? 0)])
  )
  return budgets.map((b) => ({
    department: b.department,
    category: b.category,
    allocated: Number(b.allocated),
    spent: byCategory[b.category] ?? 0,
    remaining: Number(b.allocated) - (byCategory[b.category] ?? 0),
  }))
}

export async function updateBudgetSpent(category: string, academicYear: string, amount: number) {
  await prisma.budget.updateMany({
    where: { academicYear, category },
    data: { spent: { increment: amount } },
  })
}
