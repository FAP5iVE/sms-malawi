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
 * [DEPENDS ON]: settingsService.ts (FINANCE_PAYE_BRACKETS/
 *   FINANCE_PENSION_PERCENT, already correctly built), StaffProfile model,
 *   hrService.recordLoanRepayment() (POST-R11 loan↔payroll reconciliation)
 */

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { generatePayslipPdf } from '@/server/services/receiptService'
import * as settingsService from '@/server/services/settingsService'
import * as hrService from '@/server/services/hrService'
import { SETTING_KEYS } from '@shared/types/settings'
import type { PayeBracket } from '@shared/types/settings'

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

export async function processMonthlyPayroll(
  month: number,
  year: number,
  runByUid: string
): Promise<string> {
  // Prevent duplicate payroll runs
  const existing = await prisma.payrollRun.findUnique({
    where: { month_year: { month, year } },
  })
  if (existing) throw new Error(`Payroll for ${month}/${year} already exists`)

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
  const staffNameByUid = new Map(
    staffProfiles.map((s) => [s.uid, `${s.firstName} ${s.lastName}`])
  )
  const staffIdByUid = new Map(staffProfiles.map((s) => [s.uid, s.id]))

  // [PRODUCTION FIX] Allowances are itemized now (StaffAllowance) — a
  // recurring one counts every month; a one-time one only counts for the
  // specific (paidMonth, paidYear) it names. sal.allowances (the old flat
  // field) is no longer read here.
  const allowances = await prisma.staffAllowance.findMany({
    where: {
      staffUid: { in: staffUids },
      OR: [
        { recurring: true },
        { recurring: false, paidMonth: month, paidYear: year },
      ],
    },
  })
  const allowanceTotalByUid = new Map<string, number>()
  for (const a of allowances) {
    allowanceTotalByUid.set(a.staffUid, (allowanceTotalByUid.get(a.staffUid) ?? 0) + Number(a.amount))
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

export async function getPayrollHistory(year: number) {
  return prisma.payrollRun.findMany({
    where: { year },
    orderBy: { month: 'desc' },
    include: { _count: { select: { payslips: true } } },
  })
}

export async function getStaffPayslips(staffUid: string) {
  return prisma.payslip.findMany({
    where: { staffUid },
    orderBy: { createdAt: 'desc' },
    include: { payrollRun: { select: { month: true, year: true } } },
  })
}