/*
 * apps/web/src/server/services/budgetWindowService.ts
 *
 * [CHANGE TYPE]: NEW FILE (R22)
 * [PURPOSE]: BudgetWindow CRUD, plus the shared BudgetCommitment
 *   reserve/consume/release logic used by procurementService.
 *
 *   Duplicate reservation of the same obligation is prevented here at the
 *   service layer (inside the same transaction that creates the
 *   commitment) — Artefact 6 §13 / Artefact 8 §14 call for this; it can't
 *   be a DB constraint because purchaseRequisitionId/purchaseOrderId are
 *   both nullable, which would make a DB unique constraint silently inert
 *   for the common single-FK case under Postgres NULL semantics.
 *
 *   `Budget.spent` is never touched here. Availability is computed as
 *   allocated - active commitments - spent, matching Artefact 6 §34's
 *   formula, without double counting.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (BudgetWindow, BudgetCommitment — R22)
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import * as auditService from '@/server/services/auditService'
import type { UserRole } from '@shared/types/roles'

type Tx = Prisma.TransactionClient

// ─── BUDGET WINDOWS ───────────────────────────────────────

export async function listBudgetWindows(filters: { academicYear?: string; status?: string }) {
  return prisma.budgetWindow.findMany({
    where: { academicYear: filters.academicYear, status: filters.status as never },
    orderBy: [{ academicYear: 'desc' }, { term: 'asc' }],
  })
}

export async function createBudgetWindow(
  input: {
    name: string; academicYear: string; term?: number; type: string
    submissionStart: string; submissionEnd: string
    reviewStart?: string; reviewEnd?: string; approvalStart?: string; approvalEnd?: string
    departmentId?: string
  },
  actorUid: string, actorRole: UserRole,
) {
  const window = await prisma.budgetWindow.create({
    data: {
      name: input.name,
      academicYear: input.academicYear,
      term: input.term,
      type: input.type as never,
      submissionStart: new Date(input.submissionStart),
      submissionEnd: new Date(input.submissionEnd),
      reviewStart: input.reviewStart ? new Date(input.reviewStart) : undefined,
      reviewEnd: input.reviewEnd ? new Date(input.reviewEnd) : undefined,
      approvalStart: input.approvalStart ? new Date(input.approvalStart) : undefined,
      approvalEnd: input.approvalEnd ? new Date(input.approvalEnd) : undefined,
      departmentId: input.departmentId,
      status: 'DRAFT',
      createdByUid: actorUid,
    },
  })
  await auditService.log({
    action: 'finance.budgetWindow.create', entityType: 'BudgetWindow', entityId: window.id,
    actorUid, actorRole, metadata: { context: { academicYear: window.academicYear, term: window.term } },
  })
  return window
}

export async function setBudgetWindowStatus(
  id: string, status: 'DRAFT' | 'OPEN' | 'REVIEW' | 'CLOSED' | 'ARCHIVED',
  actorUid: string, actorRole: UserRole,
) {
  const existing = await prisma.budgetWindow.findUnique({ where: { id } })
  if (!existing) throw Object.assign(new Error('Budget window not found.'), { status: 404 })

  const window = await prisma.budgetWindow.update({ where: { id }, data: { status } })
  await auditService.log({
    action: 'finance.budgetWindow.setStatus', entityType: 'BudgetWindow', entityId: id,
    actorUid, actorRole, metadata: { context: { from: existing.status, to: status } },
  })
  return window
}

/** The single currently-open window for a department (or school-wide), if any. */
export async function getOpenBudgetWindow(departmentId: string | null, academicYear: string) {
  return prisma.budgetWindow.findFirst({
    where: {
      academicYear,
      status: 'OPEN',
      OR: [{ departmentId }, { departmentId: null }],
    },
    orderBy: { departmentId: 'desc' }, // department-specific window wins over a school-wide one
  })
}

// ─── AVAILABILITY ─────────────────────────────────────────

export async function getBudgetAvailability(budgetId: string) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } })
  if (!budget) throw Object.assign(new Error('Budget not found.'), { status: 404 })

  const activeCommitments = await prisma.budgetCommitment.aggregate({
    where: { budgetId, status: { in: ['RESERVED', 'COMMITTED'] } },
    _sum: { amount: true },
  })
  const committed = Number(activeCommitments._sum.amount ?? 0)
  const allocated = Number(budget.allocated)
  const spent = Number(budget.spent)

  return {
    budgetId,
    allocated,
    spent,
    activeCommitments: committed,
    available: allocated - committed - spent,
  }
}

// ─── COMMITMENTS (called from procurementService inside its own transactions) ──

/**
 * Reserves `amount` against `budgetId` for a given obligation (a
 * requisition, ahead of PO issuance). Throws if an active (RESERVED or
 * COMMITTED) commitment already exists for the same obligation, or if the
 * reservation would exceed what's available.
 */
export async function reserveCommitment(
  tx: Tx,
  input: { budgetId: string; budgetWindowId?: string | null; purchaseRequisitionId?: string; purchaseOrderId?: string; amount: number },
  actorUid: string,
) {
  const dupe = await tx.budgetCommitment.findFirst({
    where: {
      status: { in: ['RESERVED', 'COMMITTED'] },
      OR: [
        input.purchaseRequisitionId ? { purchaseRequisitionId: input.purchaseRequisitionId } : undefined,
        input.purchaseOrderId ? { purchaseOrderId: input.purchaseOrderId } : undefined,
      ].filter(Boolean) as Prisma.BudgetCommitmentWhereInput[],
    },
  })
  if (dupe) throw Object.assign(new Error('An active budget commitment already exists for this obligation.'), { status: 409 })

  const budget = await tx.budget.findUnique({ where: { id: input.budgetId } })
  if (!budget) throw Object.assign(new Error('Budget not found.'), { status: 400 })

  const activeSum = await tx.budgetCommitment.aggregate({
    where: { budgetId: input.budgetId, status: { in: ['RESERVED', 'COMMITTED'] } },
    _sum: { amount: true },
  })
  const available = Number(budget.allocated) - Number(activeSum._sum.amount ?? 0) - Number(budget.spent)
  if (input.amount > available) {
    throw Object.assign(new Error(`Requested amount (MK ${input.amount.toFixed(2)}) exceeds available budget (MK ${available.toFixed(2)}).`), { status: 409 })
  }

  return tx.budgetCommitment.create({
    data: {
      budgetId: input.budgetId,
      budgetWindowId: input.budgetWindowId ?? undefined,
      purchaseRequisitionId: input.purchaseRequisitionId,
      purchaseOrderId: input.purchaseOrderId,
      amount: input.amount,
      status: 'RESERVED',
      createdByUid: actorUid,
    },
  })
}

/** Moves a RESERVED commitment to COMMITTED (e.g. once a PO is approved). */
export async function commitCommitment(tx: Tx, commitmentId: string) {
  const commitment = await tx.budgetCommitment.findUnique({ where: { id: commitmentId } })
  if (!commitment) throw Object.assign(new Error('Budget commitment not found.'), { status: 404 })
  if (commitment.status !== 'RESERVED') throw Object.assign(new Error('Only a RESERVED commitment can be committed.'), { status: 409 })
  return tx.budgetCommitment.update({ where: { id: commitmentId }, data: { status: 'COMMITTED' } })
}

/** Moves a COMMITTED commitment to CONSUMED and links the resulting Expense. */
export async function consumeCommitment(tx: Tx, commitmentId: string, expenseId: string) {
  const commitment = await tx.budgetCommitment.findUnique({ where: { id: commitmentId } })
  if (!commitment) throw Object.assign(new Error('Budget commitment not found.'), { status: 404 })
  if (commitment.status !== 'COMMITTED') throw Object.assign(new Error('Only a COMMITTED commitment can be consumed.'), { status: 409 })
  return tx.budgetCommitment.update({ where: { id: commitmentId }, data: { status: 'CONSUMED', expenseId } })
}

/** Releases a RESERVED/COMMITTED commitment without spending it (rejection, cancellation). */
export async function releaseCommitment(commitmentId: string, actorUid: string, actorRole: UserRole) {
  const commitment = await prisma.budgetCommitment.findUnique({ where: { id: commitmentId } })
  if (!commitment) throw Object.assign(new Error('Budget commitment not found.'), { status: 404 })
  if (!['RESERVED', 'COMMITTED'].includes(commitment.status)) {
    throw Object.assign(new Error('Only an active commitment can be released.'), { status: 409 })
  }
  const updated = await prisma.budgetCommitment.update({ where: { id: commitmentId }, data: { status: 'RELEASED' } })
  await auditService.log({
    action: 'finance.budgetCommitment.release', entityType: 'BudgetCommitment', entityId: commitmentId,
    actorUid, actorRole, metadata: { context: { budgetId: commitment.budgetId, amount: Number(commitment.amount) } },
  })
  return updated
}
