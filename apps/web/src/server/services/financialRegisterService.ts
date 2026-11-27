/**
 * apps/web/src/server/services/financialRegisterService.ts
 *
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-06 (D-09; spec Part 3 §4.1, SM-02).
 *
 * The central register: ONE row per money event, written in the same transaction as the business record and its
 * journal entry. `(sourceType, sourceId, eventKey)` can exist once (UQ-04), so the same event cannot be booked
 * twice whatever route, retry or job asks for it.
 *
 *   recordAndPost()   — the normal case: register row + journal entry + balances, all in the caller's transaction.
 *   reverseAndPost()  — claim the original row, add the reversal row, reverse its journal entry.
 *
 * Every function takes the caller's transaction (`runFinancialTransaction`); none opens its own.
 */
import 'server-only'
import type {
  FinancialDirection, FinancialSourceType, FinancialTransactionType, PartyType,
} from '@prisma/client'
import { createJournalEntry, postEntry, voidEntry, type JournalLineInput } from '@/server/services/accountingService'
import { FinancialError, type FinancialTx, type IdempotencyContext } from '@/server/lib/financialUnitOfWork'
import { round2, lt, ZERO, type MoneyLike } from '@/lib/money'
import { logger } from '@/lib/logger'

export interface RegisterEvent {
  type: FinancialTransactionType
  sourceType: FinancialSourceType
  sourceId: string
  /** What happened to the source, e.g. RECEIPT, PAYMENT, RECOGNITION:v1. */
  eventKey: string
  direction: FinancialDirection
  amount: MoneyLike
  /** Business date. It becomes the journal entry's date. */
  occurredAt: Date
  actorUid: string
  actorRole?: string
  approvedByUid?: string | null
  partyType?: PartyType
  partyId?: string
  financialAccountId?: string
  idempotency?: IdempotencyContext
}

export interface PostingPlan {
  reference: string
  description: string
  lines: JournalLineInput[]
}

export interface RegisteredEntry {
  transactionId: string
  transactionNumber: string
  journalEntryId: string
}

/** Insert the register row (status PENDING_POSTING). Posting it is the caller's next step. */
export async function record(
  tx: FinancialTx,
  event: RegisterEvent,
  extra: { reversalOfId?: string; postingPlan?: PostingPlan } = {},
): Promise<{ id: string; transactionNumber: string }> {
  const amount = round2(event.amount)
  if (lt(amount, ZERO)) {
    throw new FinancialError('VALIDATION_ERROR', 400, 'A register amount cannot be negative.')
  }
  try {
    const row = await tx.financialTransaction.create({
      data: {
        type: event.type,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        eventKey: event.eventKey,
        direction: event.direction,
        amount,
        occurredAt: event.occurredAt,
        status: 'PENDING_POSTING',
        actorUid: event.actorUid,
        actorRole: event.actorRole,
        approvedByUid: event.approvedByUid ?? undefined,
        partyType: event.partyType,
        partyId: event.partyId,
        financialAccountId: event.financialAccountId,
        reversalOfId: extra.reversalOfId,
        idempotencyKey: event.idempotency?.key,
        requestFingerprint: event.idempotency?.requestHash,
        // JSON column: the plan is plain data (account codes and numbers).
        postingPlan: extra.postingPlan ? JSON.parse(JSON.stringify(extra.postingPlan)) : undefined,
      },
    })
    if (event.idempotency) {
      await tx.idempotencyRecord.updateMany({
        where: { scope: event.idempotency.scope, key: event.idempotency.key },
        data: { financialTransactionId: row.id },
      })
    }
    return { id: row.id, transactionNumber: row.transactionNumber }
  } catch (err) {
    const e = err as { code?: string; meta?: { target?: unknown } }
    if (e.code === 'P2002') {
      if (String(e.meta?.target ?? '').includes('reversalOfId')) {
        throw new FinancialError('ALREADY_REVERSED', 409, 'This transaction has already been reversed.')
      }
      throw new FinancialError(
        'ALREADY_POSTED', 409, 'This has already been recorded in the finance register.',
        { sourceType: event.sourceType, sourceId: event.sourceId, eventKey: event.eventKey },
      )
    }
    throw err
  }
}

/** PENDING_POSTING / POSTING_FAILED → POSTED, once. */
export async function markPosted(tx: FinancialTx, transactionId: string, journalEntryId: string): Promise<void> {
  const claim = await tx.financialTransaction.updateMany({
    where: { id: transactionId, status: { in: ['PENDING_POSTING', 'POSTING_FAILED'] } },
    data: { status: 'POSTED', journalEntryId, postedAt: new Date(), lastError: null, nextRetryAt: null },
  })
  if (claim.count !== 1) {
    throw new FinancialError('ALREADY_POSTED', 409, 'This transaction has already been posted.')
  }
}

/** Create and post the journal entry of an existing register row, then mark the row POSTED. */
export async function postRegistered(
  tx: FinancialTx,
  transactionId: string,
  event: Pick<RegisterEvent, 'sourceType' | 'sourceId' | 'occurredAt' | 'actorUid'>,
  plan: PostingPlan,
): Promise<string> {
  const journalEntryId = await createJournalEntry(
    {
      reference: plan.reference,
      description: plan.description,
      entryDate: event.occurredAt,
      lines: plan.lines,
      actorUid: event.actorUid,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      financialTransactionId: transactionId,
    },
    tx,
  )
  await postEntry(journalEntryId, event.actorUid, tx)
  await markPosted(tx, transactionId, journalEntryId)
  return journalEntryId
}

/** Register a money event and post it, as one unit with the caller's own writes. */
export async function recordAndPost(
  tx: FinancialTx,
  event: RegisterEvent,
  plan: PostingPlan,
): Promise<RegisteredEntry> {
  const row = await record(tx, event)
  const journalEntryId = await postRegistered(tx, row.id, event, plan)
  logger.info({ event: 'register.posted', transactionNumber: row.transactionNumber, journalEntryId, type: event.type })
  return { transactionId: row.id, transactionNumber: row.transactionNumber, journalEntryId }
}

/**
 * Reverse a posted event, at most once. `originalTransactionId` is absent only for entries posted before the
 * register existed: their journal entry is still reversed once (UQ-02) and the reversal is registered.
 */
export async function reverseAndPost(
  tx: FinancialTx,
  input: {
    originalTransactionId?: string
    journalEntryId: string
    reason: string
    event: RegisterEvent
  },
): Promise<RegisteredEntry> {
  const { originalTransactionId, journalEntryId, reason, event } = input
  if (originalTransactionId) {
    const claim = await tx.financialTransaction.updateMany({
      where: { id: originalTransactionId, status: 'POSTED' },
      data: { status: 'REVERSED' },
    })
    if (claim.count !== 1) {
      throw new FinancialError('ALREADY_REVERSED', 409, 'This transaction has already been reversed.')
    }
  }
  const row = await record(tx, event, { reversalOfId: originalTransactionId })
  const mirrorId = await voidEntry(journalEntryId, event.actorUid, reason, tx, {
    financialTransactionId: row.id,
    sourceType: event.sourceType,
    sourceId: event.sourceId,
  })
  await markPosted(tx, row.id, mirrorId)
  logger.info({ event: 'register.reversed', transactionNumber: row.transactionNumber, journalEntryId: mirrorId })
  return { transactionId: row.id, transactionNumber: row.transactionNumber, journalEntryId: mirrorId }
}
