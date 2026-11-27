/**
 * apps/web/src/server/services/accountingService.ts — Phase D6
 *
 * Double-entry accounting engine for SMS Malawi.
 *
 * Core operations:
 *   createJournalEntry()  — draft a balanced journal entry (two or more lines, debits = credits)
 *   postEntry()           — mark entry as posted, update account balances
 *   voidEntry()           — reverse a posted entry via counter-entry
 *
 * Reports:
 *   getIncomeStatement()  — Revenue minus Expenses for a period
 *   getCashFlowSummary()  — Cash receipts vs disbursements
 *   getTrialBalance()     — All accounts with running debit/credit totals
 *   getLedger()           — All posted lines for one account
 *
 * Seeded chart of accounts (ISO / school-standard):
 *   1000 Cash / Bank                ASSET
 *   1100 Accounts Receivable        ASSET
 *   1200 Library Inventory          ASSET
 *   2000 Accounts Payable           LIABILITY
 *   2100 Salaries Payable           LIABILITY
 *   3000 Retained Surplus           EQUITY
 *   4000 Tuition Fee Revenue        REVENUE
 *   4100 Boarding Fee Revenue       REVENUE
 *   4200 Exam Fee Revenue           REVENUE
 *   4300 Library Fine Revenue       REVENUE
 *   5000 Staff Salaries Expense     EXPENSE
 *   5100 Utilities Expense          EXPENSE
 *   5200 Maintenance Expense        EXPENSE
 *   5300 Procurement Expense        EXPENSE
 *   5900 Miscellaneous Expense      EXPENSE
 */

import 'server-only'
import type { Prisma, JournalEntryKind, FinancialSourceType, PartyType } from '@prisma/client'
import { prisma }     from '@/lib/prisma'
import { logger }     from '@/lib/logger'
// [P1-01] All arithmetic below uses the shared money utility (Decimal, half-up, 2 dp) instead of
// JavaScript floats (plan X-11). Amounts still leave this module as numbers where they did before.
import { add, sub, sum, round2, toNumber, eq, gt, lt, isZero, ZERO } from '@/lib/money'

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION AWARENESS  [P1-02]  (plan C-11; root cause of A1-F3)
//
// createJournalEntry, postEntry, voidEntry and recordPaymentEntry take an optional
// trailing `tx`: the client of a transaction the CALLER already opened.
//   - With `tx`, every read and write goes through it and no transaction is opened here, so the
//     ledger entry commits or rolls back together with the caller's own writes (a payment and its
//     journal entry become one unit; there is no "payment saved, journal lost" state).
//   - Without `tx`, behaviour for existing callers is unchanged, except that posting, voiding and
//     recordPaymentEntry now run in ONE transaction of their own, so a failure partway can no
//     longer leave a draft or a half-moved balance behind.
// The plan writes the signature as `fn(tx?, …)`; the position is notation, not a requirement.
// `tx` is the LAST parameter so no existing call site changes.
//
// ATOMIC POSTING  [P1-03]  (plan A1-F1, A2-F2, X-10; spec Part 3 §4)
//   - postEntry CLAIMS the entry with one conditional write (`updateMany … WHERE id AND status = 'DRAFT'`)
//     and requires a row count of exactly 1. Two concurrent posts cannot both win: the second waits on
//     the first's row lock, re-evaluates the condition when it commits, finds 0 rows and gets
//     ALREADY_POSTED (409). The old read-then-update let both through and moved every balance twice.
//   - Balancing is EXACT (debits === credits to the cent); the 0.01 tolerance (X-10) is gone. Entries
//     are balance-checked before the claim and nothing after the claim can fail in JavaScript, so a
//     caller that catches an error and keeps its transaction cannot be left with a claimed entry whose
//     balances never moved.
//   - Balances move once per ACCOUNT (net signed delta, exact Decimal) with an atomic `increment`, in
//     ascending account id, so two postings that touch the same accounts always lock them in the same
//     order and cannot deadlock each other.
//
// ONE-TIME REVERSAL  [P1-04]  (plan A1-F2, A2-F3; UQ-02): voidEntry claims the original (`status` POSTED -> REVERSED,
// row count 1), creates the mirror with a unique `reversalOfId`, and posts it, all in one transaction; a reason is
// mandatory.
//
// IMMUTABLE LEDGER  [P1-05]  (plan A1-DEL, D-12, X-09; migration 20261126130000_journal_model_immutability)
//   - An entry's state is `status`: DRAFT -> POSTED -> REVERSED, each step once. `isPosted` is kept equal to
//     "not DRAFT" (the database checks it) because the reports and the baseline checks still read it.
//   - The DATABASE refuses to change or delete a posted entry or its lines, to post an unbalanced entry or one with
//     fewer than two lines, and to store a line that is not exactly a debit or a credit (CHK-01, TRG-01/02/03).
//     The checks here exist to answer with a clear code before the database has to.
//   - `createdByUid` records who created an entry. `entryNumber` (JE-year-000000) is assigned by the database.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A ledger rule was broken. `status` and `code` follow the plan's error table (Part 4 §2): they let a
 * route answer 409 ALREADY_POSTED / 422 UNBALANCED / 404 instead of a generic 500. The message is the
 * same text the service has always used.
 */
export class LedgerError extends Error {
  constructor(
    public readonly code:
      | 'ALREADY_POSTED' | 'UNBALANCED' | 'NOT_FOUND'
      | 'NOT_POSTED' | 'ALREADY_REVERSED' | 'REASON_REQUIRED'
      | 'VALIDATION_ERROR',
    public readonly status: 400 | 404 | 409 | 422,
    message: string,
  ) {
    super(message)
    this.name = 'LedgerError'
  }
}

/** The client of a caller's open transaction (`prisma.$transaction(async (tx) => …)`). */
export type LedgerTx = Prisma.TransactionClient

/** Run `fn` on the caller's transaction when there is one, otherwise inside a new transaction. */
async function inTransaction<T>(
  tx: LedgerTx | undefined,
  fn: (db: LedgerTx) => Promise<T>,
): Promise<T> {
  if (tx) return fn(tx)
  return prisma.$transaction((db) => fn(db))
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface JournalLineInput {
  accountCode: string
  debit?:      number
  credit?:     number
  description?: string
  // [P1-05] Dimensions (spec Part 3 §3.2). Nothing fills them yet; a reversal copies them from its original.
  memo?:               string
  financialAccountId?: string
  partyType?:          PartyType
  partyId?:            string
  budgetId?:           string
  departmentId?:       string
}

export interface CreateJournalEntryInput {
  reference:   string
  description: string
  entryDate:   Date
  lines:       JournalLineInput[]
  actorUid:    string
  /** [P1-04] Set only by voidEntry: the original this entry reverses (unique in the database, UQ-02). */
  reversalOfId?: string
  /** [P1-05] Defaults to REVERSAL when `reversalOfId` is set, otherwise NORMAL. */
  entryKind?:    JournalEntryKind
  /** [P1-05] The record the entry came from. Filled by the financial register (P1-06); a reversal copies it. */
  sourceType?:   FinancialSourceType
  sourceId?:     string
  /** [P1-06] The register row this entry is written for (unique, UQ-03). A posted entry cannot gain one later. */
  financialTransactionId?: string
}

export interface IncomeStatement {
  periodStart:   Date
  periodEnd:     Date
  totalRevenue:  number
  totalExpenses: number
  netSurplus:    number
  revenueLines:  Array<{ account: string; code: string; amount: number }>
  expenseLines:  Array<{ account: string; code: string; amount: number }>
}

export interface TrialBalanceLine {
  code:    string
  name:    string
  type:    string
  debit:   number
  credit:  number
}

export interface LedgerLine {
  date:        Date
  reference:   string
  description: string
  debit:       number
  credit:      number
  balance:     number
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash / Bank',             type: 'ASSET'     as const, category: 'Current Assets'   },
  { code: '1100', name: 'Accounts Receivable',      type: 'ASSET'     as const, category: 'Current Assets'   },
  { code: '1200', name: 'Library Inventory',        type: 'ASSET'     as const, category: 'Non-Current Assets'},
  { code: '2000', name: 'Accounts Payable',         type: 'LIABILITY' as const, category: 'Current Liabilities'},
  { code: '2100', name: 'Salaries Payable',         type: 'LIABILITY' as const, category: 'Current Liabilities'},
  { code: '3000', name: 'Retained Surplus',         type: 'EQUITY'    as const, category: 'Equity'           },
  { code: '4000', name: 'Tuition Fee Revenue',      type: 'REVENUE'   as const, category: 'Operating Revenue'},
  { code: '4100', name: 'Boarding Fee Revenue',     type: 'REVENUE'   as const, category: 'Operating Revenue'},
  { code: '4200', name: 'Exam Fee Revenue',         type: 'REVENUE'   as const, category: 'Operating Revenue'},
  { code: '4300', name: 'Library Fine Revenue',     type: 'REVENUE'   as const, category: 'Other Revenue'    },
  { code: '5000', name: 'Staff Salaries Expense',   type: 'EXPENSE'   as const, category: 'Operating Expense'},
  { code: '5100', name: 'Utilities Expense',        type: 'EXPENSE'   as const, category: 'Operating Expense'},
  { code: '5200', name: 'Maintenance Expense',      type: 'EXPENSE'   as const, category: 'Operating Expense'},
  { code: '5300', name: 'Procurement Expense',      type: 'EXPENSE'   as const, category: 'Operating Expense'},
  { code: '5900', name: 'Miscellaneous Expense',    type: 'EXPENSE'   as const, category: 'Operating Expense'},
]

export async function seedChartOfAccounts(): Promise<void> {
  await prisma.$transaction(
    DEFAULT_ACCOUNTS.map((a) =>
      prisma.chartOfAccount.upsert({
        where:  { code: a.code },
        create: a,
        update: {},
      }),
    ),
  )
  logger.info({ event: 'accounting.seeded' }, 'Chart of accounts seeded')
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: CREATE ENTRY
// ─────────────────────────────────────────────────────────────────────────────

export async function createJournalEntry(
  input: CreateJournalEntryInput,
  tx?: LedgerTx,
): Promise<string> {
  const db: LedgerTx = tx ?? prisma
  // [P1-05] A journal entry has at least two lines.
  if (input.lines.length < 2) {
    throw new LedgerError('VALIDATION_ERROR', 400, 'A journal entry needs at least two lines.')
  }

  // Validate balanced entry (sum debits == sum credits)
  // [P1-01] Each line is rounded half-up to the cent first, exactly as the database column would
  // store it, so the balance test runs on the amounts that will really be written.
  // [P1-03] EXACT: no tolerance (plan A2-F2 / X-10). Debits and credits must be equal to the cent.
  const lineDebits  = input.lines.map((l) => round2(l.debit  ?? 0))
  const lineCredits = input.lines.map((l) => round2(l.credit ?? 0))
  const totalDebits  = sum(lineDebits)
  const totalCredits = sum(lineCredits)

  if (!eq(totalDebits, totalCredits)) {
    throw new LedgerError(
      'UNBALANCED', 422,
      `Journal entry is unbalanced: debits ${totalDebits.toFixed(2)} ≠ credits ${totalCredits.toFixed(2)}`,
    )
  }

  // [P1-05] CHK-01: each line is a debit or a credit, never both, never neither, never negative.
  input.lines.forEach((l, i) => {
    const debit  = lineDebits[i]!
    const credit = lineCredits[i]!
    if (lt(debit, ZERO) || lt(credit, ZERO) || (gt(debit, ZERO) && gt(credit, ZERO)) || (isZero(debit) && isZero(credit))) {
      throw new LedgerError(
        'VALIDATION_ERROR', 400,
        `Journal line ${i + 1} (account ${l.accountCode}) must have an amount above zero on exactly one side: debit ${debit.toFixed(2)}, credit ${credit.toFixed(2)}`,
      )
    }
  })

  // Resolve account codes to IDs
  const codes    = input.lines.map((l) => l.accountCode)
  const accounts = await db.chartOfAccount.findMany({ where: { code: { in: codes } } })
  const accountMap = new Map(accounts.map((a) => [a.code, a.id]))

  const missingCodes = codes.filter((c) => !accountMap.has(c))
  if (missingCodes.length > 0) {
    throw new Error(`Unknown account codes: ${missingCodes.join(', ')}`)
  }

  const entry = await db.journalEntry.create({
    data: {
      reference:   input.reference,
      description: input.description,
      entryDate:   input.entryDate,
      status:       'DRAFT',
      isPosted:     false,
      entryKind:    input.entryKind ?? (input.reversalOfId ? 'REVERSAL' : 'NORMAL'),
      createdByUid: input.actorUid,
      sourceType:   input.sourceType,
      sourceId:     input.sourceId,
      financialTransactionId: input.financialTransactionId,
      reversalOfId: input.reversalOfId,
      lines: {
        create: input.lines.map((l, i) => ({
          lineNumber:         i + 1,
          accountId:          accountMap.get(l.accountCode)!,
          debit:              lineDebits[i],
          credit:             lineCredits[i],
          description:        l.description,
          memo:               l.memo,
          financialAccountId: l.financialAccountId,
          partyType:          l.partyType,
          partyId:            l.partyId,
          budgetId:           l.budgetId,
          departmentId:       l.departmentId,
        })),
      },
    },
  })

  logger.info({ event: 'journal.created', entryId: entry.id, entryNumber: entry.entryNumber, reference: input.reference })
  return entry.id
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: POST ENTRY
// Updates account balances atomically.
// Asset/Expense accounts: balance += debit - credit
// Liability/Equity/Revenue accounts: balance += credit - debit
// ─────────────────────────────────────────────────────────────────────────────

export async function postEntry(
  entryId:  string,
  actorUid: string,
  tx?:      LedgerTx,
): Promise<void> {
  const normalDebitTypes  = new Set(['ASSET', 'EXPENSE'])

  await inTransaction(tx, async (db) => {
    // 1. Read and validate BEFORE claiming (read-only). The database repeats the line checks at the moment of
    //    posting, under a row lock, so a draft changed in between cannot be posted unbalanced (TRG-03).
    const entry = await db.journalEntry.findUnique({
      where:   { id: entryId },
      include: { lines: { include: { account: true } } },
    })
    if (!entry) throw new LedgerError('NOT_FOUND', 404, `Journal entry ${entryId} not found.`)
    if (entry.status !== 'DRAFT') throw new LedgerError('ALREADY_POSTED', 409, `Entry ${entryId} is already posted.`)
    if (entry.lines.length < 2) {
      throw new LedgerError('VALIDATION_ERROR', 400, 'A journal entry needs at least two lines.')
    }

    // Exact balance of the stored lines (covers drafts written before the tolerance was removed).
    const debits  = sum(entry.lines.map((l) => l.debit))
    const credits = sum(entry.lines.map((l) => l.credit))
    if (!eq(debits, credits)) {
      throw new LedgerError(
        'UNBALANCED', 422,
        `Journal entry is unbalanced: debits ${debits.toFixed(2)} ≠ credits ${credits.toFixed(2)}`,
      )
    }

    // 2. Net signed delta per account (exact Decimal), accounts in ascending id.
    const deltaByAccount = new Map<string, ReturnType<typeof sub>>()
    for (const line of entry.lines) {
      const delta = normalDebitTypes.has(line.account.type)
        ? sub(line.debit, line.credit)
        : sub(line.credit, line.debit)
      deltaByAccount.set(line.accountId, add(deltaByAccount.get(line.accountId) ?? ZERO, delta))
    }
    const ordered = [...deltaByAccount.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

    // 3. CLAIM: one conditional write; exactly one concurrent caller can change status DRAFT → POSTED.
    const claim = await db.journalEntry.updateMany({
      where: { id: entryId, status: 'DRAFT' },
      data:  { status: 'POSTED', isPosted: true, postedAt: new Date(), postedByUid: actorUid },
    })
    if (claim.count !== 1) {
      throw new LedgerError('ALREADY_POSTED', 409, `Entry ${entryId} is already posted.`)
    }

    // 4. Move the balances: atomic increment, one write per account, ascending id (deadlock-free).
    for (const [accountId, delta] of ordered) {
      await db.chartOfAccount.update({
        where: { id: accountId },
        data:  { balance: { increment: delta } },
      })
    }
  })

  logger.info({ event: 'journal.posted', entryId, actorUid, inCallerTransaction: Boolean(tx) })
}

// ─────────────────────────────────────────────────────────────────────────────
// INCOME STATEMENT
// ─────────────────────────────────────────────────────────────────────────────

export async function getIncomeStatement(
  periodStart: Date,
  periodEnd:   Date,
): Promise<IncomeStatement> {
  const lines = await prisma.journalLine.findMany({
    where: {
      journalEntry: {
        isPosted:  true,
        entryDate: { gte: periodStart, lte: periodEnd },
      },
      account: { type: { in: ['REVENUE', 'EXPENSE'] } },
    },
    include: {
      account:      { select: { code: true, name: true, type: true } },
      journalEntry: { select: { entryDate: true } },
    },
  })

  // [P1-01] Totals are kept as exact Decimals and converted to numbers once, at the end.
  type Acc = { account: string; code: string; amount: ReturnType<typeof sum> }
  const revenueMap = new Map<string, Acc>()
  const expenseMap = new Map<string, Acc>()

  for (const line of lines) {
    const key = line.account.code
    if (line.account.type === 'REVENUE') {
      const existing = revenueMap.get(key) ?? { account: line.account.name, code: key, amount: ZERO }
      existing.amount = add(existing.amount, sub(line.credit, line.debit))
      revenueMap.set(key, existing)
    } else {
      const existing = expenseMap.get(key) ?? { account: line.account.name, code: key, amount: ZERO }
      existing.amount = add(existing.amount, sub(line.debit, line.credit))
      expenseMap.set(key, existing)
    }
  }

  const byCode = (a: Acc, b: Acc) => a.code.localeCompare(b.code)
  const revenueAcc = [...revenueMap.values()].sort(byCode)
  const expenseAcc = [...expenseMap.values()].sort(byCode)
  const revenueLines = revenueAcc.map((l) => ({ ...l, amount: toNumber(l.amount) }))
  const expenseLines = expenseAcc.map((l) => ({ ...l, amount: toNumber(l.amount) }))
  const totalRevenueD  = sum(revenueAcc.map((l) => l.amount))
  const totalExpensesD = sum(expenseAcc.map((l) => l.amount))

  return {
    periodStart,
    periodEnd,
    totalRevenue:  toNumber(totalRevenueD),
    totalExpenses: toNumber(totalExpensesD),
    netSurplus:    toNumber(sub(totalRevenueD, totalExpensesD)),
    revenueLines,
    expenseLines,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIAL BALANCE
// ─────────────────────────────────────────────────────────────────────────────

export async function getTrialBalance(): Promise<TrialBalanceLine[]> {
  const accounts = await prisma.chartOfAccount.findMany({
    where:   { isActive: true },
    orderBy: { code: 'asc' },
    include: {
      lines: {
        where: { journalEntry: { isPosted: true } },
        select: { debit: true, credit: true },
      },
    },
  })

  return accounts.map((a) => {
    const totalDebit  = toNumber(sum(a.lines.map((l) => l.debit)))
    const totalCredit = toNumber(sum(a.lines.map((l) => l.credit)))
    return { code: a.code, name: a.name, type: a.type, debit: totalDebit, credit: totalCredit }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT LEDGER
// ─────────────────────────────────────────────────────────────────────────────

export async function getAccountLedger(
  accountCode: string,
  from?:        Date,
  to?:          Date,
): Promise<LedgerLine[]> {
  const account = await prisma.chartOfAccount.findUniqueOrThrow({ where: { code: accountCode } })

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId:    account.id,
      journalEntry: {
        isPosted:  true,
        ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
    },
    include: { journalEntry: { select: { entryDate: true, reference: true, description: true } } },
    orderBy: { journalEntry: { entryDate: 'asc' } },
  })

  const normalDebit = new Set(['ASSET', 'EXPENSE']).has(account.type)
  let runningBalance = ZERO

  return lines.map((l) => {
    const delta = normalDebit
      ? sub(l.debit, l.credit)
      : sub(l.credit, l.debit)
    runningBalance = add(runningBalance, delta)
    return {
      date:        l.journalEntry.entryDate,
      reference:   l.journalEntry.reference,
      description: l.description ?? l.journalEntry.description,
      debit:       toNumber(l.debit),
      credit:      toNumber(l.credit),
      balance:     toNumber(runningBalance),
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// VOID ENTRY (reverse via counter-entry)
// ─────────────────────────────────────────────────────────────────────────────

const REVERSAL_REASON_MAX = 500

/**
 * Reverses a posted entry with an exact mirror entry, AT MOST ONCE  [P1-04] (plan A1-F2, A2-F3, UQ-02).
 *
 * 1. Claim the original with one conditional write (`status` POSTED → REVERSED, row count must be 1). The loser of a
 *    race, or a second attempt, gets ALREADY_REVERSED (409) and nothing is created.
 * 2. Create the mirror (`entryKind` REVERSAL) with `reversalOfId = original` (unique in the database: even a path that
 *    skipped the claim cannot make a second reversal) and post it. All in one transaction (the caller's `tx`, or its
 *    own). The mirror is the exact negation of the original, including every line dimension (INV-07).
 * A reason is mandatory and is stored on the original (`reversalReason`, with `reversedAt` and `reversedByUid`).
 * The mirror is dated now, as before; caller-chosen dates arrive with the period rules.
 */
export async function voidEntry(
  entryId:  string,
  actorUid: string,
  reason:   string,
  tx?:      LedgerTx,
  // [P1-06] The reversal's register row, and its source for an original that carries none (older entries).
  link?:    { financialTransactionId?: string; sourceType?: FinancialSourceType; sourceId?: string },
): Promise<string> {
  const why = (reason ?? '').trim()
  if (!why) throw new LedgerError('REASON_REQUIRED', 422, 'A reason is required to reverse a journal entry.')
  if (why.length > REVERSAL_REASON_MAX) {
    throw new LedgerError('REASON_REQUIRED', 422, `The reversal reason must be at most ${REVERSAL_REASON_MAX} characters.`)
  }

  const reversalId = await inTransaction(tx, async (db) => {
    const original = await db.journalEntry.findUniqueOrThrow({
      where:   { id: entryId },
      include: { lines: { include: { account: true } } },
    })

    if (original.status === 'DRAFT') throw new LedgerError('NOT_POSTED', 409, 'Cannot void an unposted entry.')
    if (original.status === 'REVERSED') throw new LedgerError('ALREADY_REVERSED', 409, `Entry ${entryId} is already reversed.`)

    // Validate BEFORE claiming, so nothing after the claim can fail in JavaScript (same rule as postEntry).
    const debits  = sum(original.lines.map((l) => l.debit))
    const credits = sum(original.lines.map((l) => l.credit))
    if (!eq(debits, credits)) {
      throw new LedgerError(
        'UNBALANCED', 422,
        `Journal entry is unbalanced: debits ${debits.toFixed(2)} ≠ credits ${credits.toFixed(2)}`,
      )
    }

    // CLAIM: exactly one concurrent caller can move a posted entry to REVERSED.
    const claim = await db.journalEntry.updateMany({
      where: { id: entryId, status: 'POSTED' },
      data:  { status: 'REVERSED', reversedAt: new Date(), reversedByUid: actorUid, reversalReason: why },
    })
    if (claim.count !== 1) {
      throw new LedgerError('ALREADY_REVERSED', 409, `Entry ${entryId} is already reversed.`)
    }

    let id: string
    try {
      id = await createJournalEntry({
        reference:    `VOID-${original.reference}`,
        description:  `Reversal of: ${original.description}`,
        entryDate:    new Date(),
        actorUid,
        reversalOfId: entryId,
        entryKind:    'REVERSAL',
        sourceType:   original.sourceType ?? link?.sourceType,
        sourceId:     original.sourceId ?? link?.sourceId,
        financialTransactionId: link?.financialTransactionId,
        lines: original.lines.map((l) => ({
          accountCode:        l.account.code,
          debit:              toNumber(l.credit),
          credit:             toNumber(l.debit),
          description:        `Reversal — ${l.description ?? ''}`,
          memo:               l.memo ?? undefined,
          financialAccountId: l.financialAccountId ?? undefined,
          partyType:          l.partyType ?? undefined,
          partyId:            l.partyId ?? undefined,
          budgetId:           l.budgetId ?? undefined,
          departmentId:       l.departmentId ?? undefined,
        })),
      }, db)
    } catch (err) {
      // The unique index on reversalOfId (UQ-02) is the second guard: a duplicate is the same conflict.
      if ((err as { code?: string }).code === 'P2002') {
        throw new LedgerError('ALREADY_REVERSED', 409, `Entry ${entryId} is already reversed.`)
      }
      throw err
    }

    await postEntry(id, actorUid, db)
    return id
  })

  logger.info({ event: 'journal.voided', originalId: entryId, reversalId, actorUid, inCallerTransaction: Boolean(tx) })
  return reversalId
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-ENTRY: record fee payment as a journal entry
// Called by feeService when a payment is recorded.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * [P1-06] The posting rule for a fee payment, as data. feeService passes it to the financial register so the payment,
 * its register row and its journal entry are written together. The rule itself is unchanged (DR 1000 / CR 4000);
 * the receivable-based rule arrives with P3.
 */
export function paymentPostingPlan(opts: {
  invoiceId:    string
  studentName:  string
  amount:       number
  paymentRef:   string
}): { reference: string; description: string; lines: JournalLineInput[] } {
  return {
    reference:   `PAY-${opts.invoiceId.slice(-8).toUpperCase()}`,
    description: `Fee payment — ${opts.studentName} (ref: ${opts.paymentRef})`,
    lines: [
      { accountCode: '1000', debit: opts.amount, description: 'Cash received' },
      { accountCode: '4000', credit: opts.amount, description: 'Tuition fee revenue' },
    ],
  }
}

export async function recordPaymentEntry(opts: {
  invoiceId:    string
  studentName:  string
  amount:       number
  paymentRef:   string
  actorUid:     string
}, tx?: LedgerTx): Promise<void> {
  // Create and post as one unit: with `tx` they join the caller's payment transaction, without it
  // they still commit or fail together, so no orphan draft entry (check LG-03) is left behind.
  await inTransaction(tx, async (db) => {
    const entryId = await createJournalEntry({
      ...paymentPostingPlan(opts),
      entryDate:   new Date(),
      actorUid:    opts.actorUid,
    }, db)
    await postEntry(entryId, opts.actorUid, db)
  })
}
