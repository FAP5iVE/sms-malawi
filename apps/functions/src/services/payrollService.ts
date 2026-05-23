import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { generatePayslipPdf } from './receiptService'

// Malawi PAYE tax brackets (2024/2025 — verify with MRA before go-live)
function calculatePAYE(grossMonthly: number): number {
  if (grossMonthly <= 100_000) return 0
  if (grossMonthly <= 350_000) return (grossMonthly - 100_000) * 0.15
  if (grossMonthly <= 2_000_000) return 37_500 + (grossMonthly - 350_000) * 0.3
  return 532_500 + (grossMonthly - 2_000_000) * 0.35
}

const PENSION_RATE = 0.05 // 5% employee contribution

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
    const gross = Number(sal.baseSalary) + Number(sal.allowances)
    const paye = calculatePAYE(gross)
    const pension = gross * PENSION_RATE
    const loanDeduction = Number(sal.monthlyLoanDeduction)
    const net = gross - paye - pension - loanDeduction

    totalGross += gross
    totalNet += net

    payslipData.push({
      staffUid: sal.staffUid,
      staffName: sal.staffUid, // staffName resolved in future via staff table
      grossSalary: gross,
      paye,
      pension,
      loanDeduction,
      netSalary: net,
    })

    // Reduce loan balance
    if (loanDeduction > 0) {
      await prisma.salaryStructure.update({
        where: { staffUid: sal.staffUid },
        data: { loanBalance: { decrement: loanDeduction } },
      })
    }
  }

  // Create payroll run record
  const run = await prisma.payrollRun.create({
    data: { month, year, totalGross, totalNet, runByUid, status: 'PROCESSING' },
  })

  // Create payslips and generate PDFs
  for (const ps of payslipData) {
    const payslip = await prisma.payslip.create({
      data: { payrollRunId: run.id, ...ps },
    })

    // Generate payslip PDF → store in Appwrite
    const pdfKey = await generatePayslipPdf(payslip.id, ps, month, year)
    await prisma.payslip.update({ where: { id: payslip.id }, data: { payslipKey: pdfKey } })
  }

  // Mark run complete
  await prisma.payrollRun.update({
    where: { id: run.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  })

  logger.info({ event: 'payroll.completed', runId: run.id, month, year, totalGross, totalNet })
  return run.id
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
