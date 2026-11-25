/**
 * apps/web/src/server/services/accountingService.ts — Phase D6
 *
 * Double-entry accounting engine for SMS Malawi.
 *
 * Core operations:
 *   createJournalEntry()  — draft a balanced journal entry (debits = credits)
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
import type { Prisma } from '@prisma/client'
import { prisma }     from '@/lib/prisma'
import { logger }     from '@/lib/logger'
// [P1-01] All arithmetic below uses the shared money utility (Decimal, half-up, 2 dp) instead of
// JavaScript floats (plan X-11). Amounts still leave this module as numbers where they did before.
import { add, sub, sum, round2, toNumber, ZERO } from '@/lib/money'

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
// Still open here, by design: the "already posted" check is not yet an atomic claim (P1-03),
// and reversal is not yet once-only (P1-04).
// ─────────────────────────────────────────────────────────────────────────────

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
}

export interface CreateJournalEntryInput {
  reference:   string
  description: string
  entryDate:   Date
  lines:       JournalLineInput[]
  actorUid:    string
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
  // Validate balanced entry (sum debits == sum credits)
  // [P1-01] Each line is rounded half-up to the cent first, exactly as the database column would
  // store it, so the balance test runs on the amounts that will really be written.
  // The 0.01 tolerance is KEPT here on purpose: removing it ("exact balancing", plan A2-F2/X-10)
  // is task P1-03 and must not slip into this one.
  const lineDebits  = input.lines.map((l) => round2(l.debit  ?? 0))
  const lineCredits = input.lines.map((l) => round2(l.credit ?? 0))
  const totalDebits  = sum(lineDebits)
  const totalCredits = sum(lineCredits)

  if (sub(totalDebits, totalCredits).abs().gt(0.01)) {
    throw new Error(
      `Journal entry is unbalanced: debits ${totalDebits.toFixed(2)} ≠ credits ${totalCredits.toFixed(2)}`,
    )
  }

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
      isPosted:    false,
      lines: {
        create: input.lines.map((l, i) => ({
          accountId:   accountMap.get(l.accountCode)!,
          debit:       lineDebits[i],
          credit:      lineCredits[i],
          description: l.description,
        })),
      },
    },
  })

  logger.info({ event: 'journal.created', entryId: entry.id, reference: input.reference })
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
    const entry = await db.journalEntry.findUniqueOrThrow({
      where:   { id: entryId },
      include: { lines: { include: { account: true } } },
    })

    if (entry.isPosted) throw new Error(`Entry ${entryId} is already posted.`)

    // Mark entry as posted
    await db.journalEntry.update({
      where: { id: entryId },
      data:  { isPosted: true, postedAt: new Date(), postedByUid: actorUid },
    })

    // Update each account balance, in line order (a fixed lock order is P1-03).
    for (const line of entry.lines) {
      const isDebitNormal = normalDebitTypes.has(line.account.type)
      // [P1-01] Exact Decimal delta (was Number(...) - Number(...), plan X-11).
      const delta = isDebitNormal
        ? sub(line.debit, line.credit)
        : sub(line.credit, line.debit)

      await db.chartOfAccount.update({
        where: { id: line.accountId },
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

export async function voidEntry(
  entryId:  string,
  actorUid: string,
  tx?:      LedgerTx,
): Promise<string> {
  // The reversal is created and posted in one transaction (the caller's, or its own).
  const reversalId = await inTransaction(tx, async (db) => {
    const original = await db.journalEntry.findUniqueOrThrow({
      where:   { id: entryId },
      include: { lines: { include: { account: true } } },
    })

    if (!original.isPosted) throw new Error('Cannot void an unposted entry.')

    const id = await createJournalEntry({
      reference:   `VOID-${original.reference}`,
      description: `Reversal of: ${original.description}`,
      entryDate:   new Date(),
      actorUid,
      lines: original.lines.map((l) => ({
        accountCode: l.account.code,
        debit:       toNumber(l.credit),
        credit:      toNumber(l.debit),
        description: `Reversal — ${l.description ?? ''}`,
      })),
    }, db)

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
      reference:   `PAY-${opts.invoiceId.slice(-8).toUpperCase()}`,
      description: `Fee payment — ${opts.studentName} (ref: ${opts.paymentRef})`,
      entryDate:   new Date(),
      actorUid:    opts.actorUid,
      lines: [
        { accountCode: '1000', debit: opts.amount, description: 'Cash received' },
        { accountCode: '4000', credit: opts.amount, description: 'Tuition fee revenue' },
      ],
    }, db)
    await postEntry(entryId, opts.actorUid, db)
  })
}