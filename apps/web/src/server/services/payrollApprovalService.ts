/*
 * apps/web/src/server/services/payrollApprovalService.ts — Phase D13
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
 *   Reconciliation
 * [PURPOSE]: Every one of this file's 8 exported functions referenced a
 *   `PayrollRun` shape (field names and a six-state status enum) that
 *   shared nothing with the real Prisma model — `grossTotal`/`netTotal`/
 *   `period`/`totalStaff`/`submittedByUid`-on-a-model-that-lacked-it, a
 *   fictional `DRAFT`/`PROCESSED`/`ROLLED_BACK` status vocabulary, and
 *   fields (`journalEntryId`, `rollbackReason`, `lockedByUid`, `notes`,
 *   etc.) that do not exist on `PayrollRun`. Rebuilt against the real,
 *   now-extended model (`totalGross`/`totalNet`/`month`/`year`/
 *   `runByUid`, status `PROCESSING | PENDING_APPROVAL | APPROVED | LOCKED
 *   | COMPLETED | FAILED`).
 *
 *   Real lifecycle (verified against payrollService.ts's
 *   processMonthlyPayroll(), unchanged by this phase's own fix #2 to that
 *   function's status handling):
 *     PROCESSING (generation in progress, transient)
 *       → COMPLETED (payslips generated — the real "ready for review"
 *         resting state; there is no separate DRAFT status to add)
 *       → PENDING_APPROVAL (submitForApproval)
 *       → APPROVED (approve)
 *       → LOCKED (lock — posts the payroll journal entry)
 *     LOCKED → PENDING_APPROVAL (rollback — voids the journal entry;
 *       modeled as a transition back to PENDING_APPROVAL with an audit
 *       trail entry, per this phase's explicit schema decision, rather
 *       than a distinct ROLLED_BACK terminal status)
 *
 *   Reduced from 8 exports to 4 — kept exactly the workflow functions this
 *   phase's own routes mount (submitForApproval/approve/lock/rollback),
 *   matching the roadmap's own CODE STRUCTURE FRAMEWORK exactly. Dropped
 *   rejectPayrollRun, markPayrollProcessed, listPayrollRuns, and
 *   getPayrollRunSummary: the first two have no coherent real-schema
 *   counterpart (no DRAFT to reject back to short of reusing COMPLETED,
 *   and no PROCESSED state distinct from LOCKED); the latter two would
 *   have no route calling them, since the existing, already-correct
 *   GET /payroll (payrollService.getPayrollHistory(), role-list-fixed
 *   this phase) already serves PayrollApprovalPanel.tsx's run list.
 *   Adding new, technically-correct-but-uncalled functions here would
 *   recreate this exact file's own root defect one level down — a
 *   "well-built, zero callers" function — which this audit treats as a
 *   finding, not a pattern to reproduce.
 *
 *   Preserved unchanged: the accountingService integration (posting a
 *   journal entry on lock, voiding on rollback) — already confirmed
 *   correct, and the account codes it uses (5000/2100/2000) all exist in
 *   accountingService.ts's seeded chart of accounts. This becomes the
 *   second live caller of the ledger, after R9's payment-recording fix.
 *
 *   No `journalEntryId` column exists on `PayrollRun` (not authorized by
 *   this phase's schema.prisma change, which adds only
 *   submittedByUid/approvedByUid/approvedAt) — rollback locates the
 *   journal entry to void by its deterministic reference string
 *   (`PAY-{year}-{month}`, the same one lock() creates it with) rather
 *   than a stored foreign key.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (PayrollStatus extension +
 *   PayrollRun.submittedByUid/approvedByUid/approvedAt, same phase),
 *   accountingService.ts (unchanged), auditService.ts
 */

import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import { createJournalEntry, postEntry, voidEntry } from '@/server/services/accountingService'
import type { UserRole } from '@shared/types/roles'
import type { PayrollRun, PayrollStatus } from '@prisma/client'

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic journal-entry reference for a payroll run — used both to
 *  create the entry (lock) and to find it again (rollback), since no
 *  journalEntryId column exists on PayrollRun. */
function journalReference(month: number, year: number): string {
  return `PAY-${year}-${String(month).padStart(2, '0')}`
}

function assertStatus(run: PayrollRun, expected: PayrollStatus, action: string) {
  if (run.status !== expected) {
    throw Object.assign(
      new Error(`Cannot ${action} payroll run ${run.id}: status is ${run.status}, expected ${expected}.`),
      { status: 409 },
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Finance staff submits a generated (COMPLETED) run for high_rank approval. */
export async function submitForApproval(
  runId:      string,
  actorUid:   string,
  actorRole:  UserRole,
): Promise<PayrollRun> {
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })
  assertStatus(run, 'COMPLETED', 'submit for approval')

  const updated = await prisma.payrollRun.update({
    where: { id: runId },
    data:  { status: 'PENDING_APPROVAL', submittedByUid: actorUid },
  })

  await auditService.log({
    action:     'payroll.submitForApproval',
    entityType: 'PayrollRun',
    entityId:   runId,
    actorUid,
    actorRole,
    metadata:   { before: { status: run.status }, after: { status: 'PENDING_APPROVAL' } },
  })
  logger.info({ event: 'payroll.submitted', runId, actorUid })
  return updated
}

/** high_rank approves a submitted run. */
export async function approve(
  runId:      string,
  actorUid:   string,
  actorRole:  UserRole,
): Promise<PayrollRun> {
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })
  assertStatus(run, 'PENDING_APPROVAL', 'approve')

  const updated = await prisma.payrollRun.update({
    where: { id: runId },
    data:  { status: 'APPROVED', approvedByUid: actorUid, approvedAt: new Date() },
  })

  await auditService.log({
    action:     'payroll.approve',
    entityType: 'PayrollRun',
    entityId:   runId,
    actorUid,
    actorRole,
    metadata:   { before: { status: run.status }, after: { status: 'APPROVED' } },
  })
  logger.info({ event: 'payroll.approved', runId, actorUid })
  return updated
}

/**
 * finance locks an approved run — no further edits are possible after
 * this point. Posts the payroll journal entry:
 *   DR 5000 Staff Salaries Expense   (gross payroll)
 *   CR 2100 Salaries Payable         (net payroll)
 *   CR 2000 Accounts Payable         (deductions — PAYE, pension, loans)
 */
export async function lock(
  runId:      string,
  actorUid:   string,
  actorRole:  UserRole,
): Promise<PayrollRun> {
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })
  assertStatus(run, 'APPROVED', 'lock')

  const grossPayroll = Number(run.totalGross)
  const netPayroll   = Number(run.totalNet)
  const deductions   = grossPayroll - netPayroll

  const entryId = await createJournalEntry({
    reference:   journalReference(run.month, run.year),
    description: `Payroll run — ${run.month}/${run.year}`,
    entryDate:   new Date(),
    actorUid,
    lines: [
      { accountCode: '5000', debit: grossPayroll, description: 'Gross staff salaries' },
      { accountCode: '2100', credit: netPayroll, description: 'Net payroll payable' },
      ...(deductions > 0.01
        ? [{ accountCode: '2000', credit: deductions, description: 'PAYE tax, pension, loans' }]
        : []),
    ],
  })
  await postEntry(entryId, actorUid)

  const updated = await prisma.payrollRun.update({
    where: { id: runId },
    data:  { status: 'LOCKED' },
  })

  await auditService.log({
    action:     'payroll.lock',
    entityType: 'PayrollRun',
    entityId:   runId,
    actorUid,
    actorRole,
    metadata:   { before: { status: run.status }, after: { status: 'LOCKED', journalEntryId: entryId } },
  })
  logger.info({ event: 'payroll.locked', runId, entryId, actorUid })
  return updated
}

/**
 * finance rolls back a LOCKED payroll run — voids the accounting journal
 * entry and returns the run to PENDING_APPROVAL (not a distinct terminal
 * status; the audit log is the durable record of the rollback and its
 * reason).
 */
export async function rollback(
  runId:      string,
  reason:     string,
  actorUid:   string,
  actorRole:  UserRole,
): Promise<PayrollRun> {
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })
  assertStatus(run, 'LOCKED', 'roll back')

  const reference = journalReference(run.month, run.year)
  const entry = await prisma.journalEntry.findFirst({
    where:   { reference, isPosted: true },
    orderBy: { createdAt: 'desc' },
  })
  if (entry) {
    await voidEntry(entry.id, actorUid)
  } else {
    logger.warn({ event: 'payroll.rollback_no_journal_entry', runId, reference })
  }

  const updated = await prisma.payrollRun.update({
    where: { id: runId },
    data:  { status: 'PENDING_APPROVAL' },
  })

  await auditService.log({
    action:     'payroll.rollback',
    entityType: 'PayrollRun',
    entityId:   runId,
    actorUid,
    actorRole,
    metadata:   { before: { status: run.status }, after: { status: 'PENDING_APPROVAL', reason } },
  })
  logger.info({ event: 'payroll.rolled_back', runId, reason, actorUid })
  return updated
}
