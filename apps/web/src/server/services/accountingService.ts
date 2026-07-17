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
import { Decimal }    from '@prisma/client/runtime/library'
import { prisma }     from '@/lib/prisma'
import { logger }     from '@/lib/logger'

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
): Promise<string> {
  // Validate balanced entry (sum debits == sum credits)
  const totalDebits  = input.lines.reduce((s, l) => s + (l.debit  ?? 0), 0)
  const totalCredits = input.lines.reduce((s, l) => s + (l.credit ?? 0), 0)

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(
      `Journal entry is unbalanced: debits ${totalDebits.toFixed(2)} ≠ credits ${totalCredits.toFixed(2)}`,
    )
  }

  // Resolve account codes to IDs
  const codes    = input.lines.map((l) => l.accountCode)
  const accounts = await prisma.chartOfAccount.findMany({ where: { code: { in: codes } } })
  const accountMap = new Map(accounts.map((a) => [a.code, a.id]))

  const missingCodes = codes.filter((c) => !accountMap.has(c))
  if (missingCodes.length > 0) {
    throw new Error(`Unknown account codes: ${missingCodes.join(', ')}`)
  }

  const entry = await prisma.journalEntry.create({
    data: {
      reference:   input.reference,
      description: input.description,
      entryDate:   input.entryDate,
      isPosted:    false,
      lines: {
        create: input.lines.map((l) => ({
          accountId:   accountMap.get(l.accountCode)!,
          debit:       new Decimal(l.debit  ?? 0),
          credit:      new Decimal(l.credit ?? 0),
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
): Promise<void> {
  const entry = await prisma.journalEntry.findUniqueOrThrow({
    where:   { id: entryId },
    include: { lines: { include: { account: true } } },
  })

  if (entry.isPosted) throw new Error(`Entry ${entryId} is already posted.`)

  const normalDebitTypes  = new Set(['ASSET', 'EXPENSE'])

  await prisma.$transaction([
    // Mark entry as posted
    prisma.journalEntry.update({
      where: { id: entryId },
      data:  { isPosted: true, postedAt: new Date(), postedByUid: actorUid },
    }),

    // Update each account balance
    ...entry.lines.map((line) => {
      const isDebitNormal = normalDebitTypes.has(line.account.type)
      const delta = isDebitNormal
        ? Number(line.debit) - Number(line.credit)
        : Number(line.credit) - Number(line.debit)

      return prisma.chartOfAccount.update({
        where: { id: line.accountId },
        data:  { balance: { increment: delta } },
      })
    }),
  ])

  logger.info({ event: 'journal.posted', entryId, actorUid })
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

  const revenueMap = new Map<string, { account: string; code: string; amount: number }>()
  const expenseMap = new Map<string, { account: string; code: string; amount: number }>()

  for (const line of lines) {
    const key = line.account.code
    if (line.account.type === 'REVENUE') {
      const existing = revenueMap.get(key) ?? { account: line.account.name, code: key, amount: 0 }
      existing.amount += Number(line.credit) - Number(line.debit)
      revenueMap.set(key, existing)
    } else {
      const existing = expenseMap.get(key) ?? { account: line.account.name, code: key, amount: 0 }
      existing.amount += Number(line.debit) - Number(line.credit)
      expenseMap.set(key, existing)
    }
  }

  const revenueLines = [...revenueMap.values()].sort((a, b) => a.code.localeCompare(b.code))
  const expenseLines = [...expenseMap.values()].sort((a, b) => a.code.localeCompare(b.code))
  const totalRevenue  = revenueLines.reduce((s, l) => s + l.amount, 0)
  const totalExpenses = expenseLines.reduce((s, l) => s + l.amount, 0)

  return {
    periodStart,
    periodEnd,
    totalRevenue,
    totalExpenses,
    netSurplus: totalRevenue - totalExpenses,
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
    const totalDebit  = a.lines.reduce((s, l) => s + Number(l.debit),  0)
    const totalCredit = a.lines.reduce((s, l) => s + Number(l.credit), 0)
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
  let runningBalance = 0

  return lines.map((l) => {
    const delta = normalDebit
      ? Number(l.debit) - Number(l.credit)
      : Number(l.credit) - Number(l.debit)
    runningBalance += delta
    return {
      date:        l.journalEntry.entryDate,
      reference:   l.journalEntry.reference,
      description: l.description ?? l.journalEntry.description,
      debit:       Number(l.debit),
      credit:      Number(l.credit),
      balance:     runningBalance,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// VOID ENTRY (reverse via counter-entry)
// ─────────────────────────────────────────────────────────────────────────────

export async function voidEntry(
  entryId:  string,
  actorUid: string,
): Promise<string> {
  const original = await prisma.journalEntry.findUniqueOrThrow({
    where:   { id: entryId },
    include: { lines: { include: { account: true } } },
  })

  if (!original.isPosted) throw new Error('Cannot void an unposted entry.')

  const reversalId = await createJournalEntry({
    reference:   `VOID-${original.reference}`,
    description: `Reversal of: ${original.description}`,
    entryDate:   new Date(),
    actorUid,
    lines: original.lines.map((l) => ({
      accountCode: l.account.code,
      debit:       Number(l.credit),
      credit:      Number(l.debit),
      description: `Reversal — ${l.description ?? ''}`,
    })),
  })

  await postEntry(reversalId, actorUid)
  logger.info({ event: 'journal.voided', originalId: entryId, reversalId, actorUid })
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
}): Promise<void> {
  const entryId = await createJournalEntry({
    reference:   `PAY-${opts.invoiceId.slice(-8).toUpperCase()}`,
    description: `Fee payment — ${opts.studentName} (ref: ${opts.paymentRef})`,
    entryDate:   new Date(),
    actorUid:    opts.actorUid,
    lines: [
      { accountCode: '1000', debit: opts.amount, description: 'Cash received' },
      { accountCode: '4000', credit: opts.amount, description: 'Tuition fee revenue' },
    ],
  })
  await postEntry(entryId, opts.actorUid)
}