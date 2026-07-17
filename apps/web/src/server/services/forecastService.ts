/**
 * apps/web/src/server/services/forecastService.ts — Phase D14
 *
 * [CHANGE TYPE]: MAJOR REWRITE of projectExpenses() and projectFeeRevenue()
 *   only — the overall forecasting orchestration (getCashFlowForecast())
 *   and its output shape are unaffected.
 * [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
 *   Reconciliation
 * [PURPOSE]:
 *   1. BUILD-BREAKING FIX, highest priority in this phase (as named by
 *      the roadmap): projectExpenses() selected a Prisma Expense field
 *      named `date`, which does not exist — corrected to `incurredAt`
 *      (the real field, already used correctly by
 *      reportExportService.buildExpenseSheet() in the same phase).
 *   2. SECOND, UNDISCOVERED-BY-THE-ROADMAP BUILD-BREAKING FIX, found
 *      while implementing fix #1's sibling function: projectFeeRevenue()
 *      queried `prisma.payment.findMany({ where: { academicYear,
 *      status: 'CONFIRMED' } ... } })` — Payment has neither an
 *      `academicYear` field (it lives on the related Invoice) nor a
 *      `status` field at all (every recorded payment is, by this
 *      schema's design, already a completed fact — there is no
 *      draft/pending payment state to filter). Corrected to filter via
 *      the real relation (`where: { invoice: { academicYear } }`) with
 *      the nonexistent status filter removed entirely.
 *   3. projectFeeRevenue(): fixed the scope-blindness bug where the sum
 *      of *all* active fee structures was multiplied by the *total*
 *      active student count school-wide — a Form-4-only fee (a
 *      FeeStructure with a specific classId) was applied as if charged
 *      to every student in every form. Each fee structure's contribution
 *      is now scoped to only the students in its actual applicable class
 *      (classId set) or the whole active student body (classId null =
 *      "applies to all classes", the schema's own documented meaning)
 *      before summing. FeeStructure.term scoping is intentionally NOT
 *      modeled as a per-month attribution window in this fix — the
 *      existing "spread the annual total evenly across the school's 9
 *      months" model is a pre-existing simplification this fix does not
 *      redesign (a term-aware monthly calendar would be a materially
 *      larger change than "scope-blindness," and no acceptance criterion
 *      for this phase tests it); a term-scoped fee structure's amount is
 *      still correctly included, once, in the annual total that gets
 *      spread.
 *   4. FOURTH DISCOVERED BUG, found while making the above fixes: both
 *      projectFeeRevenue() and projectExpenses() built their forecast
 *      window's start date with `new Date(academicYear.split('/')[0]!,
 *      8, 1)` — the Date constructor's TypeScript overloads require a
 *      number for the year argument, not the string `split()` returns
 *      (JavaScript's runtime multi-argument Date constructor does coerce
 *      a string via ToNumber, so this was a genuine strict-mode compile
 *      error rather than a runtime crash — still fixed properly with an
 *      explicit Number() rather than left relying on implicit coercion).
 * [DEPENDS ON]: none
 */

import 'server-only'
import { prisma }   from '@/lib/prisma'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthlyDataPoint {
  label:    string   // e.g. "Jan 2026"
  actual?:  number
  forecast?: number
}

export interface ForecastReport {
  generatedAt:      Date
  academicYear:     string
  feeRevenue:       MonthlyDataPoint[]
  expenses:         MonthlyDataPoint[]
  netCashFlow:      MonthlyDataPoint[]
  totalActualRev:   number
  totalForecastRev: number
  totalActualExp:   number
  totalForecastExp: number
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', {
    month: 'short',
    year:  'numeric',
  })
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

// ─────────────────────────────────────────────────────────────────────────────
// FEE REVENUE PROJECTION
// ─────────────────────────────────────────────────────────────────────────────

async function projectFeeRevenue(
  academicYear: string,
  forwardMonths: number,
): Promise<MonthlyDataPoint[]> {
  // Actual collection by month (from Payments) — Payment has no
  // academicYear field of its own; scope via the related Invoice. Every
  // recorded Payment row is already a completed fact (no status field
  // to filter — there is no draft/pending payment state in this schema).
  const payments = await prisma.payment.findMany({
    where:   { invoice: { academicYear } },
    select:  { amount: true, paidAt: true },
    orderBy: { paidAt: 'asc' },
  })

  const actualByMonth = new Map<string, number>()
  for (const p of payments) {
    const label = new Date(p.paidAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    actualByMonth.set(label, (actualByMonth.get(label) ?? 0) + Number(p.amount))
  }

  // Expected monthly revenue: scope each fee structure to only the
  // students it actually applies to (its classId) rather than blindly
  // multiplying the sum of all fee structures by the school-wide active
  // student count.
  const feeStructures = await prisma.feeStructure.findMany({ where: { academicYear, isActive: true } })

  const studentCountsByClass = await prisma.student.groupBy({
    by:     ['classId'],
    where:  { status: 'ACTIVE' },
    _count: { _all: true },
  })
  const activeCountByClassId = new Map(studentCountsByClass.map((c) => [c.classId, c._count._all]))
  const totalActiveStudents  = studentCountsByClass.reduce((s, c) => s + c._count._all, 0)

  let totalAnnualRevenue = 0
  for (const fee of feeStructures) {
    // classId null = "applies to all classes" (FeeStructure's own
    // documented meaning) — otherwise scope to just that class's active
    // students.
    const applicableStudents = fee.classId
      ? (activeCountByClassId.get(fee.classId) ?? 0)
      : totalActiveStudents
    totalAnnualRevenue += Number(fee.amount) * applicableStudents
  }
  // Spread the (now correctly scoped) annual total across 9 school months
  // (3 terms × 3 months) — see header comment for why term-window
  // attribution is not modeled in this fix.
  const expectedMonthly = totalAnnualRevenue / 9

  // Build data points: past months actual, future months forecast
  const now   = new Date()
  const start = new Date(Number(academicYear.split('/')[0]), 8, 1) // Sep of first year
  const points: MonthlyDataPoint[] = []

  for (let m = 0; m < 9 + forwardMonths; m++) {
    const d     = addMonths(start, m)
    const label = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    const isPast = d <= now

    points.push({
      label,
      actual:   isPast ? (actualByMonth.get(label) ?? 0) : undefined,
      forecast: !isPast ? expectedMonthly : undefined,
    })
  }

  return points
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSE PROJECTION (3-month rolling average)
// ─────────────────────────────────────────────────────────────────────────────

async function projectExpenses(
  academicYear:  string,
  forwardMonths: number,
): Promise<MonthlyDataPoint[]> {
  const expenses = await prisma.expense.findMany({
    where:   { academicYear },
    select:  { amount: true, incurredAt: true },
    orderBy: { incurredAt: 'asc' },
  })

  const actualByMonth = new Map<string, number>()
  for (const e of expenses) {
    const label = new Date(e.incurredAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    actualByMonth.set(label, (actualByMonth.get(label) ?? 0) + Number(e.amount))
  }

  const values = [...actualByMonth.values()]
  const recentAvg = values.length >= 3
    ? values.slice(-3).reduce((s, v) => s + v, 0) / 3
    : values.length > 0
    ? values.reduce((s, v) => s + v, 0) / values.length
    : 0

  const now   = new Date()
  const start = new Date(Number(academicYear.split('/')[0]), 8, 1)
  const points: MonthlyDataPoint[] = []

  for (let m = 0; m < 9 + forwardMonths; m++) {
    const d     = addMonths(start, m)
    const label = d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    const isPast = d <= now

    points.push({
      label,
      actual:   isPast ? (actualByMonth.get(label) ?? 0) : undefined,
      forecast: !isPast ? recentAvg : undefined,
    })
  }

  return points
}

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED FORECAST
// ─────────────────────────────────────────────────────────────────────────────

export async function getCashFlowForecast(
  academicYear:  string,
  forwardMonths  = 3,
): Promise<ForecastReport> {
  const [feeRevenue, expenses] = await Promise.all([
    projectFeeRevenue(academicYear, forwardMonths),
    projectExpenses(academicYear, forwardMonths),
  ])

  const netCashFlow: MonthlyDataPoint[] = feeRevenue.map((rev, i) => {
    const exp = expenses[i]
    const actualNet   = (rev.actual   ?? 0) - (exp?.actual   ?? 0)
    const forecastNet = (rev.forecast ?? 0) - (exp?.forecast ?? 0)
    return {
      label:    rev.label,
      actual:   rev.actual   !== undefined ? actualNet   : undefined,
      forecast: rev.forecast !== undefined ? forecastNet : undefined,
    }
  })

  const totalActualRev   = feeRevenue.reduce((s, p) => s + (p.actual   ?? 0), 0)
  const totalForecastRev = feeRevenue.reduce((s, p) => s + (p.forecast ?? 0), 0)
  const totalActualExp   = expenses.reduce((s,   p) => s + (p.actual   ?? 0), 0)
  const totalForecastExp = expenses.reduce((s,   p) => s + (p.forecast ?? 0), 0)

  return {
    generatedAt: new Date(),
    academicYear,
    feeRevenue,
    expenses,
    netCashFlow,
    totalActualRev,
    totalForecastRev,
    totalActualExp,
    totalForecastExp,
  }
}
