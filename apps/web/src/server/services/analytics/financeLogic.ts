/**
 * Pure finance reporting maths (no database access, unit-tested).
 *
 * Every finance KPI in the dashboards and reports is computed from the
 * functions here, so a figure can never differ between the Finance dashboard,
 * the Headteacher overview, the Fees / Receivables / Cash-flow reports and the
 * exports. The measures are deliberately NOT interchangeable:
 *
 *   Billed            Σ Invoice.totalAmount for the selected scope. Net of
 *                     scholarships, discounts and any prior-credit applied at
 *                     invoicing, and including late penalties.
 *   Collected         Σ Invoice.paidAmount — the part of payments APPLIED to
 *                     the scope's invoices, to date. A point-in-time balance of
 *                     the scope, not "money received this month".
 *   Outstanding       Σ max(0, Invoice.balance) — what is still owed on the
 *                     scope's invoices, as at now. Billed − Collected.
 *   Overdue           The part of Outstanding on invoices past their due date
 *                     (see financeAging.ts).
 *   Collection rate   Collected ÷ Billed over the SAME set of invoices (same
 *                     students, same term). Numerator and denominator can't
 *                     cover different populations or periods.
 *   Payments received Σ Payment.amount — cash actually received, by the date
 *                     it was received (a flow). Includes the part that became a
 *                     StudentCredit (overpayment) and so was not applied to an
 *                     invoice: received = applied + held as credit.
 *   Budget used       Live APPROVED expenses against allocated budgets (see
 *                     budgetPosition). Never the cached Budget.spent column,
 *                     which is incremented on every budget of a category and so
 *                     double counts when a category has more than one budget.
 *   Open commitments  The undelivered value of approved purchase orders:
 *                     ordered − received − cancelled quantity, priced at the
 *                     line's own rate. A received portion is no longer a
 *                     commitment (it is, or will become, an expense).
 *
 * NOT recorded by the system, therefore NOT reportable (never inferred):
 * refunds, payment reversals, invoice cancellations/voids. The schema has no
 * such records; Invoice.balance is clamped at 0 on payment.
 */
import { ratioPct, round } from '@/server/services/reporting/kpi'

// ─── Invoices ────────────────────────────────────────────────────────────────

export interface InvoiceFigures {
  totalAmount: number
  paidAmount: number
  balance: number
}

export interface InvoiceSummary {
  invoices: number
  billed: number
  collected: number
  outstanding: number
  /** Collected ÷ billed (percent); null — never 0 — when nothing was billed. */
  collectionRate: number | null
  /**
   * billed − collected − outstanding. Zero when the books agree; anything else
   * means invoice balances have drifted from their payments and the figures
   * cannot be trusted until reconciled.
   */
  drift: number
}

const finite = (n: number): number => (Number.isFinite(n) ? n : 0)

export function summariseInvoices(rows: readonly InvoiceFigures[]): InvoiceSummary {
  let billed = 0
  let collected = 0
  let outstanding = 0
  for (const r of rows) {
    billed += finite(r.totalAmount)
    collected += finite(r.paidAmount)
    outstanding += Math.max(0, finite(r.balance))
  }
  return {
    invoices: rows.length,
    billed: round(billed, 2),
    collected: round(collected, 2),
    outstanding: round(outstanding, 2),
    collectionRate: ratioPct(collected, billed),
    drift: round(billed - collected - outstanding, 2),
  }
}

// ─── Outstanding by class ────────────────────────────────────────────────────

export interface ClassOutstandingInvoice {
  studentId: string
  balance: number
  /** The student's class id, or null when they have none. */
  classId: string | null
}

export interface ClassOutstandingRow {
  /** '' for the explicit "No class" row. */
  classId: string
  className: string
  outstanding: number
  studentCount: number
}

/**
 * Outstanding balance per class. Students with no class, or in a class that is
 * not part of the year's class list, land in an explicit "No class" row, so
 * Σ rows always equals the overview's outstanding balance for the same invoices.
 */
export function groupOutstandingByClass(
  invoices: readonly ClassOutstandingInvoice[],
  classNames: ReadonlyMap<string, string>,
): ClassOutstandingRow[] {
  const NO_CLASS = ''
  const groups = new Map<string, { outstanding: number; students: Set<string> }>()
  for (const inv of invoices) {
    const balance = finite(inv.balance)
    if (!(balance > 0)) continue
    const key = inv.classId !== null && classNames.has(inv.classId) ? inv.classId : NO_CLASS
    const g = groups.get(key) ?? { outstanding: 0, students: new Set<string>() }
    g.outstanding += balance
    g.students.add(inv.studentId)
    groups.set(key, g)
  }
  return Array.from(groups.entries())
    .map(([classId, g]) => ({
      classId,
      className: classId === NO_CLASS ? 'No class' : (classNames.get(classId) ?? classId),
      outstanding: round(g.outstanding, 2),
      studentCount: g.students.size,
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
}

// ─── Payments received vs applied ────────────────────────────────────────────

export interface PaymentReconciliation {
  /** Σ Payment.amount — cash received. */
  received: number
  /** Σ Invoice.paidAmount of the same invoices — the applied part. */
  appliedToInvoices: number
  /** received − applied: overpayments held as student credit (never negative). */
  heldAsCredit: number
  /** True when applied somehow exceeds received (data needs review). */
  appliedExceedsReceived: boolean
}

export function reconcilePayments(
  paymentAmounts: readonly number[],
  appliedToInvoices: number,
): PaymentReconciliation {
  const received = round(paymentAmounts.reduce((s, a) => s + finite(a), 0), 2)
  const applied = round(finite(appliedToInvoices), 2)
  const diff = round(received - applied, 2)
  return {
    received,
    appliedToInvoices: applied,
    heldAsCredit: Math.max(0, diff),
    appliedExceedsReceived: diff < 0,
  }
}

// ─── Budgets ─────────────────────────────────────────────────────────────────

export interface BudgetInput {
  category: string
  /** null = annual budget (applies to every term of the year). */
  term: number | null
  allocated: number
}

export interface ExpenseInput {
  category: string
  term: number
  /** Only APPROVED expenses may be passed in. */
  amount: number
}

export interface BudgetPositionRow {
  category: string
  allocated: number
  spent: number
  /** spent ÷ allocated (percent); null when nothing is allocated. */
  utilisation: number | null
  /** Spend in a category that has no budget in scope. */
  unbudgeted: boolean
}

export interface BudgetPosition {
  rows: BudgetPositionRow[]
  /** Σ allocated across budgeted categories. */
  allocated: number
  /** Σ spent across BUDGETED categories only (so it is comparable to allocated). */
  spent: number
  utilisation: number | null
  /** Approved spend in categories with no budget — reported, never netted off. */
  unbudgetedSpend: number
}

/**
 * Budget position for a term view (`term` set) or the whole year (`term` null).
 *
 * Term view: the term's own budgets plus annual budgets (which the system
 * treats as applying to every term). A term budget is consumed by that term's
 * spending; an annual budget by all spending in the year up to and including
 * the selected term. Each expense is therefore counted once per category —
 * earlier terms' spend is only brought in when an annual budget exists to
 * absorb it.
 */
export function budgetPosition(
  budgets: readonly BudgetInput[],
  expenses: readonly ExpenseInput[],
  term: number | null,
): BudgetPosition {
  const inScope = budgets.filter((b) => term === null || b.term === null || b.term === term)

  const allocatedBy = new Map<string, number>()
  const annualBy = new Map<string, number>()
  for (const b of inScope) {
    allocatedBy.set(b.category, (allocatedBy.get(b.category) ?? 0) + finite(b.allocated))
    if (b.term === null) annualBy.set(b.category, (annualBy.get(b.category) ?? 0) + finite(b.allocated))
  }

  const spentBy = new Map<string, number>()
  const allSpendCategories = new Set<string>()
  for (const e of expenses) {
    allSpendCategories.add(e.category)
    let counts: boolean
    if (term === null) counts = true
    else if (e.term === term) counts = true
    else counts = e.term < term && (annualBy.get(e.category) ?? 0) > 0
    if (counts) spentBy.set(e.category, (spentBy.get(e.category) ?? 0) + finite(e.amount))
  }

  const rows: BudgetPositionRow[] = []
  let allocated = 0
  let spent = 0
  for (const [category, alloc] of allocatedBy) {
    const s = spentBy.get(category) ?? 0
    allocated += alloc
    spent += s
    rows.push({
      category,
      allocated: round(alloc, 2),
      spent: round(s, 2),
      utilisation: ratioPct(s, alloc),
      unbudgeted: false,
    })
  }

  let unbudgetedSpend = 0
  for (const category of allSpendCategories) {
    if (allocatedBy.has(category)) continue
    const s = spentBy.get(category) ?? 0
    if (s <= 0) continue
    unbudgetedSpend += s
    rows.push({ category, allocated: 0, spent: round(s, 2), utilisation: null, unbudgeted: true })
  }

  rows.sort((a, b) => a.category.localeCompare(b.category))
  return {
    rows,
    allocated: round(allocated, 2),
    spent: round(spent, 2),
    utilisation: ratioPct(spent, allocated),
    unbudgetedSpend: round(unbudgetedSpend, 2),
  }
}

// ─── Purchase-order commitments ──────────────────────────────────────────────

/** Order statuses that still represent an obligation to pay for undelivered goods. */
export const OPEN_PO_STATUSES = ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] as const

export interface PoLineInput {
  quantityOrdered: number
  quantityReceived: number
  quantityCancelled: number
  /** Line total including tax, as ordered. */
  lineTotal: number
}

export interface PoInput {
  status: string
  lines: readonly PoLineInput[]
}

export interface OpenCommitment {
  /** Open orders that still have undelivered value. */
  orders: number
  /** Undelivered value, MWK. */
  value: number
}

/** Undelivered value of one line (0 when fully received or cancelled). */
export function openLineValue(l: PoLineInput): number {
  const ordered = finite(l.quantityOrdered)
  if (ordered <= 0) return 0
  const open = Math.max(0, ordered - finite(l.quantityReceived) - finite(l.quantityCancelled))
  return (finite(l.lineTotal) * open) / ordered
}

export function openPoCommitment(pos: readonly PoInput[]): OpenCommitment {
  let orders = 0
  let value = 0
  for (const po of pos) {
    if (!(OPEN_PO_STATUSES as readonly string[]).includes(po.status)) continue
    const v = po.lines.reduce((s, l) => s + openLineValue(l), 0)
    if (v > 0) {
      orders += 1
      value += v
    }
  }
  return { orders, value: round(value, 2) }
}

// ─── Payroll by term ─────────────────────────────────────────────────────────

/**
 * Payroll run statuses that are real, finished-or-in-approval payroll. A run is
 * only COMPLETED transiently on its way COMPLETED → PENDING_APPROVAL → APPROVED
 * → LOCKED, so counting COMPLETED alone drops every approved month.
 * PROCESSING (mid-generation) and FAILED are the only exclusions.
 */
export const PAYROLL_COUNTED_STATUSES = ['COMPLETED', 'PENDING_APPROVAL', 'APPROVED', 'LOCKED'] as const

/**
 * Calendar months each term spans (academic year Sept–July). August has no
 * term, so a payroll run for August belongs to no term's cash flow — it is
 * reported separately by `payrollOutsideTerms` rather than silently dropped.
 */
export const TERM_MONTHS: Readonly<Record<number, readonly number[]>> = {
  1: [9, 10, 11, 12],
  2: [1, 2, 3, 4],
  3: [5, 6, 7],
}

export interface PayrollRunPeriod {
  month: number
  year: number
  totalNet: unknown
}

const net = (r: PayrollRunPeriod): number => finite(Number(r.totalNet))

function calendarYearFor(firstYear: number, month: number): number {
  return month >= 9 ? firstYear : firstYear + 1
}

export function payrollForTerm(runs: readonly PayrollRunPeriod[], academicYear: string, term: number): number {
  const firstYear = Number.parseInt(academicYear.split('/')[0] ?? '', 10)
  if (Number.isNaN(firstYear)) return 0
  const months = TERM_MONTHS[term] ?? []
  return runs
    .filter((r) => months.includes(r.month) && r.year === calendarYearFor(firstYear, r.month))
    .reduce((sum, r) => sum + net(r), 0)
}

/** Net pay of runs inside the academic year but in a month no term covers (August). */
export function payrollOutsideTerms(runs: readonly PayrollRunPeriod[], academicYear: string): number {
  const firstYear = Number.parseInt(academicYear.split('/')[0] ?? '', 10)
  if (Number.isNaN(firstYear)) return 0
  const termMonths = new Set(Object.values(TERM_MONTHS).flat())
  return runs
    .filter((r) => !termMonths.has(r.month) && r.year === firstYear + 1)
    .reduce((sum, r) => sum + net(r), 0)
}
