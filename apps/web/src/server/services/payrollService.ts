/*
 * apps/web/src/server/services/payrollService.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT, three fixes
 * [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
 *   Reconciliation
 * [PURPOSE]:
 *   1. Replaced the hardcoded PAYE tax brackets (100_000/350_000/
 *      2_000_000 monthly thresholds, 0.15/0.3/0.35 rates) and
 *      PENSION_RATE=0.05 with reads from
 *      SETTING_KEYS.FINANCE_PAYE_BRACKETS/FINANCE_PENSION_PERCENT
 *      (Phase 1B; already built and simply uncalled — the fourth
 *      confirmed instance of a Settings panel with zero effect on real
 *      computation, after grading/3A, promotion/3C, and this one).
 *      FINANCE_PAYE_BRACKETS' bounds are annual (PayeBracket.minAnnualMwk/
 *      maxAnnualMwk), while this function computes a monthly gross —
 *      calculateMonthlyPAYE() below annualizes the monthly gross,
 *      applies genuine marginal (bracket-by-bracket) taxation across the
 *      configured brackets, then divides the resulting annual tax by 12.
 *   2. processMonthlyPayroll(): wrapped the PayrollRun create → per-staff
 *      Payslip create (+ loan-balance decrement) → PDF generation →
 *      status-update sequence in a single Prisma $transaction, so a
 *      mid-run crash cannot leave a run permanently stuck at PROCESSING
 *      against the @@unique([month,year]) constraint (which blocks any
 *      retry for that month regardless of the stuck row's status, since
 *      the existing-run check above is unconditional on status). PDF
 *      generation launches a headless browser per staff member and is
 *      genuinely slow — an explicit, generous transaction timeout (2
 *      minutes) is passed to accommodate this rather than leaving Prisma's
 *      default ~5s interactive-transaction timeout to fail large runs.
 *   3. staffName is now resolved via a real join against StaffProfile
 *      (matched by uid, the same "no Prisma relation exists for a
 *      Firebase-UID plain-string reference" pattern R9 established for
 *      invoice-note authors) instead of being set to the raw staffUid —
 *      the fifth confirmed "raw ID instead of name" instance in this
 *      audit.
 *
 *   [POST-R11, user-requested follow-up beyond the roadmap's literal
 *   scope]: this run loop previously decremented
 *   SalaryStructure.loanBalance — a field confirmed to have zero readers
 *   anywhere in the codebase, entirely disconnected from StaffLoan
 *   (the real, UI-connected loan model the Loans tab built in R11
 *   displays). Removed that dead write; after the transaction commits,
 *   each staff member's loanDeduction is now reconciled against their
 *   real StaffLoan via hrService.recordLoanRepayment() (which also
 *   settles the loan and clears SalaryStructure.monthlyLoanDeduction
 *   once the balance reaches zero — see hrService.ts's disburseLoan()/
 *   recordLoanRepayment() for the other half of this connection).
 *
 *   [Payroll Runs & Approvals / My Pay redesign, user-requested]:
 *     - getPayrollRunWindow()/getPayrollScalarSettings(): Settings >
 *       Finance > "Payroll Processing Day" (payroll_day_of_month) was a
 *       real, saved setting read by nothing — Run Payroll could be
 *       clicked on any date, any number of times (blocked only by luck,
 *       via the @@unique([month,year]) constraint on a *successful*
 *       first run). processMonthlyPayroll() now genuinely enforces a
 *       window of payroll_run_window_days days starting on
 *       payroll_day_of_month before it will create a run at all; once a
 *       month is run, the existing unique constraint already makes that
 *       permanent — this only closes the "whenever" half of the gap.
 *     - getPayrollHistory(): now resolves totalPaye/totalPension per run
 *       (summed from that run's own payslips — not a stored, independently
 *       driftable column) and runByUid/submittedByUid/approvedByUid to
 *       display names, for the Payroll Runs & Approvals history table.
 *     - getPayrollRunDetail(): new — GET /payroll/:id's "Inspect Payslips"
 *       drill-down. PayrollApprovalPanel.tsx (Phase D13) noted no such
 *       route existed and removed its own per-staff line table rather
 *       than call one; this adds it against the real Payslip rows.
 *     - getMySalaryStructure(): new — GET /payroll/my-salary did not
 *       exist at all (useMySalaryStructure() called it and 404'd). Built
 *       against the same base-salary + itemized-recurring-StaffAllowance
 *       computation this file already performs for a real payslip, not
 *       the stale flat SalaryStructure.allowances/loanBalance columns.
 * [DEPENDS ON]: settingsService.ts (FINANCE_PAYE_BRACKETS/
 *   FINANCE_PENSION_PERCENT, already correctly built), StaffProfile model,
 *   hrService.recordLoanRepayment() (POST-R11 loan↔payroll reconciliation)
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { generatePayslipPdf } from '@/server/services/receiptService'
import * as settingsService from '@/server/services/settingsService'
import * as hrService from '@/server/services/hrService'
import * as auditService from '@/server/services/auditService'
import { SETTING_KEYS } from '@shared/types/settings'
import type { PayeBracket } from '@shared/types/settings'
import type { ApiPayrollRunWindow, ApiSalaryStructure } from '@shared/types/api'
import type { UserRole } from '@shared/types/roles'

// ─────────────────────────────────────────────────────────────────────────────
// RUN WINDOW — payroll_day_of_month / payroll_run_window_days
//
// Both are plain generic-string SystemSettings rows (like settings.ts's own
// FINANCE_KEYS scalars), not part of the typed SETTING_KEYS/settingsService
// registry, so they're read directly here rather than fighting that typed
// system for two ad hoc values — same convention settings.ts itself uses for
// every other FINANCE_KEYS entry.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_WINDOW_START_DAY = 25
const DEFAULT_WINDOW_LENGTH_DAYS = 5

async function getPayrollScalarSettings(): Promise<{ startDay: number; windowDays: number }> {
  const rows = await prisma.systemSettings.findMany({
    where: { key: { in: ['payroll_day_of_month', 'payroll_run_window_days'] } },
  })
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const startDay = Number(byKey['payroll_day_of_month']) || DEFAULT_WINDOW_START_DAY
  const windowDays = Number(byKey['payroll_run_window_days']) || DEFAULT_WINDOW_LENGTH_DAYS
  return { startDay, windowDays }
}

/**
 * Computes the [opensAt, closesAt) window for a given payroll month/year.
 * Plain Date arithmetic — `new Date(year, month - 1, startDay + windowDays)`
 * rolls over into the next calendar month on its own when the window
 * overruns month-end, so no per-month day-count clamping is needed.
 * closesAt is set to the end of its calendar day (23:59:59.999) so the
 * window's last day is fully usable rather than closing at midnight.
 */
function computeRunWindow(month: number, year: number, startDay: number, windowDays: number) {
  const opensAt = new Date(year, month - 1, startDay, 0, 0, 0, 0)
  const closesAt = new Date(year, month - 1, startDay + windowDays - 1, 23, 59, 59, 999)
  return { opensAt, closesAt }
}

/**
 * GET /payroll/run-window — whether payroll for month/year can be triggered
 * right now, for the Run Payroll button's enabled state and "opens on"/
 * "window closed" copy in Payroll Runs & Approvals.
 */
export async function getPayrollRunWindow(
  month: number,
  year: number
): Promise<ApiPayrollRunWindow> {
  const { startDay, windowDays } = await getPayrollScalarSettings()
  const { opensAt, closesAt } = computeRunWindow(month, year, startDay, windowDays)
  const now = new Date()

  const [existingRun, enrolledStaffCount] = await Promise.all([
    prisma.payrollRun.findUnique({
      where: { month_year: { month, year } },
      select: { id: true, status: true },
    }),
    prisma.salaryStructure.count(),
  ])

  return {
    month,
    year,
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    isOpen: now >= opensAt && now <= closesAt,
    alreadyRun: !!existingRun,
    existingRun: existingRun ?? undefined,
    enrolledStaffCount,
    windowStartDay: startDay,
    windowLengthDays: windowDays,
  }
}

// Genuine marginal (bracket-by-bracket) PAYE calculation. Brackets are
// configured in annual MWK (Settings > Finance); grossMonthly is
// annualized, taxed bracket-by-bracket, then the resulting annual tax is
// divided back down to a monthly deduction.
function calculateMonthlyPAYE(grossMonthly: number, brackets: readonly PayeBracket[]): number {
  const annualGross = grossMonthly * 12
  const sorted = [...brackets].sort((a, b) => a.minAnnualMwk - b.minAnnualMwk)

  let annualTax = 0
  for (const bracket of sorted) {
    if (annualGross <= bracket.minAnnualMwk) continue
    const upper = bracket.maxAnnualMwk ?? annualGross
    const taxableInBracket = Math.min(annualGross, upper) - bracket.minAnnualMwk
    if (taxableInBracket > 0) {
      annualTax += taxableInBracket * (bracket.ratePercent / 100)
    }
  }
  return annualTax / 12
}

/**
 * POST /payroll/runs/:id/discard — clears a run stuck in PROCESSING so
 * Finance can retry. [NEW, user-requested]
 *
 * PROCESSING only exists for the moment processMonthlyPayroll() is
 * literally mid-transaction below — it should never be visible to a user
 * for longer than that. If a run is ever OBSERVED sitting at PROCESSING
 * (the transaction crashed after creating the row but before completing,
 * a serverless function timed out mid-run, etc.), the
 * @@unique([month,year]) constraint means that month can never be run
 * again — there was previously no way out of this short of a manual DB
 * fix. Only valid on a PROCESSING run; every other status has a real,
 * intentional next step (submit/approve/lock/rollback) and should go
 * through payrollApprovalService.ts instead, not be discarded.
 */
export async function discardStuckRun(
  runId: string,
  actorUid: string,
  actorRole: UserRole
): Promise<void> {
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } })
  if (run.status !== 'PROCESSING') {
    throw Object.assign(
      new Error(`Only a run stuck in PROCESSING can be discarded (this one is ${run.status}).`),
      { status: 409 }
    )
  }
  // Defensive: a healthy transaction failure already rolls its own payslip
  // inserts back, but delete any that somehow survived (e.g. a crash
  // between the transaction committing and the final status update) so
  // discarding never leaves orphaned Payslip rows behind.
  await prisma.$transaction([
    prisma.payslip.deleteMany({ where: { payrollRunId: runId } }),
    prisma.payrollRun.delete({ where: { id: runId } }),
  ])
  await auditService.log({
    action: 'payroll.discardStuckRun',
    entityType: 'PayrollRun',
    entityId: runId,
    actorUid,
    actorRole,
  })
  logger.warn({
    event: 'payroll.discarded_stuck_run',
    runId,
    month: run.month,
    year: run.year,
    actorUid,
  })
}

export async function processMonthlyPayroll(
  month: number,
  year: number,
  runByUid: string
): Promise<string> {
  // Prevent duplicate payroll runs — once a month is run, it is
  // permanently locked; this constraint is the actual enforcement of that
  // (nothing below can ever re-create a row for the same month/year).
  const existing = await prisma.payrollRun.findUnique({
    where: { month_year: { month, year } },
  })
  if (existing) {
    throw Object.assign(
      new Error(`Payroll for ${month}/${year} has already been run and is locked for this month.`),
      { status: 409 }
    )
  }

  // [PRODUCTION FIX] Run window enforcement — payroll_day_of_month/
  // payroll_run_window_days were real settings with no reader anywhere;
  // Run Payroll could otherwise be triggered on any date. See
  // getPayrollRunWindow()'s header comment above.
  const { startDay, windowDays } = await getPayrollScalarSettings()
  const { opensAt, closesAt } = computeRunWindow(month, year, startDay, windowDays)
  const now = new Date()
  if (now < opensAt || now > closesAt) {
    throw Object.assign(
      new Error(
        `Payroll for ${month}/${year} can only be run between ${opensAt.toDateString()} and ${closesAt.toDateString()}.`
      ),
      { status: 403 }
    )
  }

  // Get all active salary structures
  const salaries = await prisma.salaryStructure.findMany()
  if (salaries.length === 0) throw new Error('No salary structures found')

  // [R10 fix 1] Real, configured PAYE brackets and pension rate instead
  // of hardcoded constants.
  const { finance_paye_brackets: payeBrackets, finance_pension_percent: pensionPercent } =
    await settingsService.getMany([
      SETTING_KEYS.FINANCE_PAYE_BRACKETS,
      SETTING_KEYS.FINANCE_PENSION_PERCENT,
    ])

  // [R10 fix 3] Real staff names — SalaryStructure.staffUid is a Firebase
  // UID plain string with no Prisma relation, so this is a manual
  // StaffProfile lookup, not an `include`.
  const staffUids = salaries.map((s) => s.staffUid)
  const staffProfiles = await prisma.staffProfile.findMany({
    where: { uid: { in: staffUids } },
    select: { id: true, uid: true, firstName: true, lastName: true },
  })
  const staffNameByUid = new Map(staffProfiles.map((s) => [s.uid, `${s.firstName} ${s.lastName}`]))
  const staffIdByUid = new Map(staffProfiles.map((s) => [s.uid, s.id]))

  // [PRODUCTION FIX] Allowances are itemized now (StaffAllowance) — a
  // recurring one counts every month; a one-time one only counts for the
  // specific (paidMonth, paidYear) it names. sal.allowances (the old flat
  // field) is no longer read here.
  const allowances = await prisma.staffAllowance.findMany({
    where: {
      staffUid: { in: staffUids },
      OR: [{ recurring: true }, { recurring: false, paidMonth: month, paidYear: year }],
    },
  })
  const allowanceTotalByUid = new Map<string, number>()
  for (const a of allowances) {
    allowanceTotalByUid.set(
      a.staffUid,
      (allowanceTotalByUid.get(a.staffUid) ?? 0) + Number(a.amount)
    )
  }

  let totalGross = 0
  let totalNet = 0
  const payslipData: {
    staffUid: string
    staffName: string
    grossSalary: number
    paye: number
    pension: number
    loanDeduction: number
    netSalary: number
  }[] = []

  for (const sal of salaries) {
    const gross = Number(sal.baseSalary) + (allowanceTotalByUid.get(sal.staffUid) ?? 0)
    const paye = calculateMonthlyPAYE(gross, payeBrackets)
    const pension = gross * (pensionPercent / 100)
    const loanDeduction = Number(sal.monthlyLoanDeduction)
    const net = gross - paye - pension - loanDeduction

    totalGross += gross
    totalNet += net

    payslipData.push({
      staffUid: sal.staffUid,
      staffName: staffNameByUid.get(sal.staffUid) ?? sal.staffUid,
      grossSalary: gross,
      paye,
      pension,
      loanDeduction,
      netSalary: net,
    })
  }

  // [R10 fix 2] Single transaction across run creation, per-staff payslip
  // creation + loan-balance decrement, PDF generation, and the final
  // status update — a mid-run crash now rolls back entirely (no stuck
  // PROCESSING row blocking retry) rather than leaving partial state.
  const runId = await prisma.$transaction(
    async (tx) => {
      const run = await tx.payrollRun.create({
        data: { month, year, totalGross, totalNet, runByUid, status: 'PROCESSING' },
      })

      for (const ps of payslipData) {
        const payslip = await tx.payslip.create({
          data: { payrollRunId: run.id, ...ps },
        })

        // Generate payslip PDF → store in Appwrite
        const pdfKey = await generatePayslipPdf(payslip.id, { ...ps, pensionPercent }, month, year)
        await tx.payslip.update({ where: { id: payslip.id }, data: { payslipKey: pdfKey } })
      }

      await tx.payrollRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      })

      return run.id
    },
    { timeout: 120_000, maxWait: 10_000 }
  )

  logger.info({ event: 'payroll.completed', runId, month, year, totalGross, totalNet })

  // [POST-R11] Reconcile this run's loan deductions against the real,
  // UI-connected StaffLoan.balance — hrService.recordLoanRepayment()
  // also settles the loan and resets SalaryStructure.monthlyLoanDeduction
  // to 0 once the balance reaches zero. Runs after the transaction (not
  // inside it — recordLoanRepayment() uses the global prisma client, not
  // this transaction's `tx`, the same constraint R9/R10 hit for
  // accountingService calls); a single staff member's reconciliation
  // failure is logged and does not roll back the already-committed,
  // real payroll run.
  for (const ps of payslipData) {
    if (ps.loanDeduction <= 0) continue
    const staffId = staffIdByUid.get(ps.staffUid)
    if (!staffId) continue
    try {
      const activeLoan = await prisma.staffLoan.findFirst({
        where: { staffId, status: { in: ['DISBURSED', 'REPAYING'] } },
      })
      if (activeLoan) {
        await hrService.recordLoanRepayment(activeLoan.id, ps.loanDeduction)
      } else {
        logger.warn({ event: 'payroll.loan_deduction_no_active_loan', staffId, runId })
      }
    } catch (err) {
      logger.error({ event: 'payroll.loan_repayment_failed', staffId, runId, err })
    }
  }

  return runId
}

/** Resolves a set of Firebase UIDs to "First Last" display names — the same
 *  manual lookup processMonthlyPayroll() already does above (SalaryStructure/
 *  PayrollRun store plain UID strings with no Prisma relation to
 *  StaffProfile). Returns a Map so callers can look up "" for an unknown/
 *  missing uid without a conditional at every call site. */
async function resolveStaffNames(
  uids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const distinct = [...new Set(uids.filter((u): u is string => !!u))]
  if (distinct.length === 0) return new Map()
  const profiles = await prisma.staffProfile.findMany({
    where: { uid: { in: distinct } },
    select: { uid: true, firstName: true, lastName: true },
  })
  return new Map(profiles.map((p) => [p.uid, `${p.firstName} ${p.lastName}`]))
}

/**
 * GET /payroll — payroll run history for a year, with totalPaye/totalPension
 * summed from each run's own payslips (never a stored, independently
 * driftable column) and runByUid/submittedByUid/approvedByUid resolved to
 * display names for the Payroll Runs & Approvals history table.
 */
export async function getPayrollHistory(year: number) {
  const runs = await prisma.payrollRun.findMany({
    where: { year },
    orderBy: { month: 'desc' },
    include: {
      _count: { select: { payslips: true } },
      payslips: { select: { paye: true, pension: true } },
    },
  })

  const nameByUid = await resolveStaffNames(
    runs.flatMap((r) => [r.runByUid, r.submittedByUid, r.approvedByUid])
  )

  return runs.map(({ payslips, ...run }) => ({
    ...run,
    totalPaye: payslips.reduce((sum, p) => sum + Number(p.paye), 0),
    totalPension: payslips.reduce((sum, p) => sum + Number(p.pension), 0),
    runByName: run.runByUid ? nameByUid.get(run.runByUid) : undefined,
    submittedByName: run.submittedByUid ? nameByUid.get(run.submittedByUid) : undefined,
    approvedByName: run.approvedByUid ? nameByUid.get(run.approvedByUid) : undefined,
  }))
}

/**
 * GET /payroll/:id — a single run's full detail, including every payslip
 * line, for the "Deep Inspection" / "Inspect Payslips" drill-down. No such
 * route existed before (PayrollApprovalPanel.tsx's own header comment
 * confirmed this gap and removed its per-staff table rather than call a
 * route that didn't exist).
 */
export async function getPayrollRunDetail(runId: string) {
  const run = await prisma.payrollRun.findUniqueOrThrow({
    where: { id: runId },
    include: {
      payslips: { orderBy: { staffName: 'asc' } },
      _count: { select: { payslips: true } },
    },
  })

  const nameByUid = await resolveStaffNames([run.runByUid, run.submittedByUid, run.approvedByUid])
  const totalPaye = run.payslips.reduce((sum, p) => sum + Number(p.paye), 0)
  const totalPension = run.payslips.reduce((sum, p) => sum + Number(p.pension), 0)

  return {
    ...run,
    totalPaye,
    totalPension,
    runByName: run.runByUid ? nameByUid.get(run.runByUid) : undefined,
    submittedByName: run.submittedByUid ? nameByUid.get(run.submittedByUid) : undefined,
    approvedByName: run.approvedByUid ? nameByUid.get(run.approvedByUid) : undefined,
  }
}

export async function getStaffPayslips(staffUid: string) {
  return prisma.payslip.findMany({
    where: { staffUid },
    orderBy: { createdAt: 'desc' },
    include: { payrollRun: { select: { month: true, year: true } } },
  })
}

/**
 * GET /payroll/my-salary — self-service current salary structure (own, or
 * another staff member's when the route's caller holds hr.viewAnyPayslips).
 * [PRODUCTION FIX] This route/function did not exist at all —
 * useMySalaryStructure() called GET /payroll/my-salary and 404'd. Computes
 * monthlyGross the same way processMonthlyPayroll() computes a real
 * payslip's gross (base salary + every currently-recurring StaffAllowance),
 * not the stale flat SalaryStructure.allowances/loanBalance columns
 * confirmed to have zero readers elsewhere in this file.
 */
export async function getMySalaryStructure(staffUid: string): Promise<ApiSalaryStructure | null> {
  const [salary, staff, allowances] = await Promise.all([
    prisma.salaryStructure.findUnique({ where: { staffUid } }),
    prisma.staffProfile.findFirst({
      where: { uid: staffUid },
      select: { firstName: true, lastName: true, department: true, jobTitle: true },
    }),
    prisma.staffAllowance.findMany({
      where: { staffUid, recurring: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  if (!salary) return null

  const recurringTotal = allowances.reduce((sum, a) => sum + Number(a.amount), 0)
  const baseSalary = Number(salary.baseSalary)

  return {
    id: salary.id,
    staffUid,
    staffName: staff ? `${staff.firstName} ${staff.lastName}` : staffUid,
    department: staff?.department ?? null,
    jobTitle: staff?.jobTitle ?? null,
    baseSalary,
    monthlyLoanDeduction: Number(salary.monthlyLoanDeduction),
    monthlyGross: baseSalary + recurringTotal,
    updatedAt: salary.updatedAt.toISOString(),
    allowances: allowances.map((a) => ({
      id: a.id,
      type: a.type,
      amount: Number(a.amount),
      recurring: a.recurring,
      paidMonth: a.paidMonth,
      paidYear: a.paidYear,
      notes: a.notes,
    })),
  }
}
