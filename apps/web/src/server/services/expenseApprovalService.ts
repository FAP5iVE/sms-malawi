/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/expenseApprovalService.ts
 * [PURPOSE]: Expense approve / reject logic, extracted out of the two inline
 *   handlers in routes/finances.ts so the Finances page and the Approvals Hub
 *   run the SAME code. Behaviour is unchanged (approve updates the row, bumps
 *   the budget's spent figure and posts a balanced journal entry) with one
 *   deliberate fix: both operations now refuse anything that is not PENDING.
 *   The old handlers had no status check, so approving an already-approved
 *   expense a second time (double-click, two reviewers, a retried request)
 *   posted a second journal entry and counted the spend against the budget
 *   twice.
 * [DEPENDS ON]: budgetService, accountingService, auditService
 */

import 'server-only'
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import * as budgetService from '@/server/services/budgetService'
import * as accountingService from '@/server/services/accountingService'
import * as auditService from '@/server/services/auditService'

// [R9] Maps each ExpenseCategory to the chart-of-accounts expense code
// accountingService.seedChartOfAccounts() seeds. LIBRARY and TRANSPORT
// have no dedicated seeded account — mapped to 5900 Miscellaneous Expense
// rather than adding new accounts, since this phase makes no change to
// accountingService.ts's own ledger logic (the seeded chart is untouched).
const EXPENSE_CATEGORY_ACCOUNT: Record<string, string> = {
  SALARIES: '5000',
  UTILITIES: '5100',
  MAINTENANCE: '5200',
  PROCUREMENT: '5300',
  LIBRARY: '5900',
  TRANSPORT: '5900',
  MISCELLANEOUS: '5900',
}

function conflict(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 409 })
}

/**
 * @param paidImmediately decides which ledger account the approval posts
 *   against: Cash (already paid) or Accounts Payable (owed — cleared later
 *   via mark-paid). Defaults to true so callers that don't send the field
 *   keep today's behaviour (approval = paid).
 */
export async function approveExpense(
  id: string,
  actorUid: string,
  actorRole: string,
  paidImmediately = true,
) {
  const now = new Date()
  // Conditional claim: only one caller can move PENDING → APPROVED.
  const claim = await prisma.expense.updateMany({
    where: { id, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      approvedByUid: actorUid,
      approvedAt: now,
      ...(paidImmediately ? { paidAt: now, paidByUid: actorUid } : {}),
    },
  })
  if (claim.count === 0) {
    const existing = await prisma.expense.findUnique({ where: { id }, select: { status: true } })
    if (!existing) throw Object.assign(new Error('Expense not found.'), { status: 404 })
    throw conflict(`This expense is already ${existing.status.toLowerCase()}.`)
  }

  const expense = await prisma.expense.findUniqueOrThrow({ where: { id } })
  await budgetService.updateBudgetSpent(expense.category, expense.academicYear, Number(expense.amount))

  // [R9] Reconnect approved expenses to the double-entry ledger. A posting
  // failure is logged for reconciliation rather than reverting the
  // already-applied approval, matching feeService.recordPayment()'s
  // identical pattern.
  try {
    const accountCode = EXPENSE_CATEGORY_ACCOUNT[expense.category] ?? '5900'
    const entryId = await accountingService.createJournalEntry({
      reference: `EXP-${expense.id.slice(-8).toUpperCase()}`,
      description: `Expense approved — ${expense.description} (${expense.category})`,
      entryDate: new Date(),
      actorUid,
      lines: paidImmediately
        ? [
            { accountCode, debit: Number(expense.amount), description: expense.description },
            { accountCode: '1000', credit: Number(expense.amount), description: 'Cash paid for expense' },
          ]
        : [
            { accountCode, debit: Number(expense.amount), description: expense.description },
            { accountCode: '2000', credit: Number(expense.amount), description: `Owed — ${expense.description}` },
          ],
    })
    await accountingService.postEntry(entryId, actorUid)
  } catch (err) {
    // Best-effort secondary write — the approval itself already succeeded.
    // Captured to Sentry so a record with no posted journal entry (a real
    // financial-integrity gap) is not invisible.
    logger.error({ event: 'accounting.expense_posting_failed', expenseId: expense.id, err })
    Sentry.captureException(err, { tags: { module: 'finances', event: 'accounting.expense_posting_failed' } })
  }

  await auditService.log({
    action: 'finance.expense_approved',
    entityType: 'Expense',
    entityId: id,
    actorUid,
    actorRole,
    metadata: { context: { amount: Number(expense.amount), category: expense.category, paidImmediately } },
  })

  return expense
}

/**
 * No ledger posting — only an APPROVED expense reaches accountingService.
 * The reason (when given) goes to the audit trail; Expense has no notes column.
 */
export async function rejectExpense(id: string, actorUid: string, actorRole: string, reason?: string) {
  const claim = await prisma.expense.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: 'REJECTED' },
  })
  if (claim.count === 0) {
    const existing = await prisma.expense.findUnique({ where: { id }, select: { status: true } })
    if (!existing) throw Object.assign(new Error('Expense not found.'), { status: 404 })
    throw conflict(`This expense is already ${existing.status.toLowerCase()}.`)
  }

  await auditService.log({
    action: 'finance.expense_rejected',
    entityType: 'Expense',
    entityId: id,
    actorUid,
    actorRole,
    metadata: { context: { reason: reason ?? null } },
  })

  return prisma.expense.findUniqueOrThrow({ where: { id } })
}
