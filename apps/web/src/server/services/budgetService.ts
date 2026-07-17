/**
 * apps/web/src/server/services/budgetService.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R9 — Finance I: Invoicing, Fees & the Accounting Ledger
 *   Reconnection
 * [PURPOSE]: `updateBudgetSpent()`'s writes to `Budget.spent` were
 *   confirmed unread by this file's own `getBudgetVsActual()`, which
 *   instead recomputed "spent" live via a separate `Expense.groupBy`
 *   aggregation — two disconnected representations of the same number.
 *   Before removing the write, verified whether `Budget.spent` has any
 *   other confirmed reader: it does —
 *   `analyticsService.getFinanceBudgetVsActual()`, reachable via a real,
 *   mounted route (`GET /analytics/...`), reads `_sum.spent` as its
 *   fallback value. Per that finding, `getBudgetVsActual()` here is
 *   repointed to read the maintained `Budget.spent` column directly
 *   (grouped by `category`, matching `updateBudgetSpent()`'s own
 *   `category`-keyed increment — unlike analyticsService's separate,
 *   out-of-scope `department`-vs-`category` key mismatch) instead of
 *   re-aggregating, rather than removing `updateBudgetSpent()`'s write
 *   entirely and leaving that other reader permanently stale. Added
 *   `import 'server-only'`.
 *
 *   [R14 — Analytics & Reports Domain] Budget.category is now the
 *   ExpenseCategory Prisma enum rather than free text (schema.prisma +
 *   CreateBudgetSchema, same phase). updateBudgetSpent()'s `category`
 *   parameter is retyped from `string` to that enum accordingly — its only
 *   caller (finances.ts's expense-approval handler) already passes
 *   `expense.category`, which has always been an ExpenseCategory, so this
 *   is a tightening of an already-correct call, not a behaviour change.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (Budget.category enum)
 */

import 'server-only'
import { prisma } from '@/lib/prisma'
import type { ExpenseCategory } from '@prisma/client'
import type { CreateBudgetInput } from '@shared/schemas/finance'

export async function createBudget(data: CreateBudgetInput, actorUid: string) {
  return prisma.budget.create({
    data: {
      academicYear: data.academicYear,
      term: data.term ?? null,              // nullable field — null not undefined
      department: data.department,
      category: data.category,
      allocated: data.allocated,
      description: data.description ?? null, // nullable field
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
  return budgets.map((b) => ({
    department: b.department,
    category: b.category,
    allocated: Number(b.allocated),
    spent: Number(b.spent),
    remaining: Number(b.allocated) - Number(b.spent),
  }))
}

export async function updateBudgetSpent(
  category: ExpenseCategory,
  academicYear: string,
  amount: number,
) {
  await prisma.budget.updateMany({
    where: { academicYear, category },
    data: { spent: { increment: amount } },
  })
}
