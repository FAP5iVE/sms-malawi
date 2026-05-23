"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processMonthlyPayroll = processMonthlyPayroll;
exports.getPayrollHistory = getPayrollHistory;
exports.getStaffPayslips = getStaffPayslips;
const prisma_1 = require("../lib/prisma");
const logger_1 = require("../lib/logger");
const receiptService_1 = require("./receiptService");
// Malawi PAYE tax brackets (2024/2025 — verify with MRA before go-live)
function calculatePAYE(grossMonthly) {
    if (grossMonthly <= 100000)
        return 0;
    if (grossMonthly <= 350000)
        return (grossMonthly - 100000) * 0.15;
    if (grossMonthly <= 2000000)
        return 37500 + (grossMonthly - 350000) * 0.3;
    return 532500 + (grossMonthly - 2000000) * 0.35;
}
const PENSION_RATE = 0.05; // 5% employee contribution
async function processMonthlyPayroll(month, year, runByUid) {
    // Prevent duplicate payroll runs
    const existing = await prisma_1.prisma.payrollRun.findUnique({
        where: { month_year: { month, year } },
    });
    if (existing)
        throw new Error(`Payroll for ${month}/${year} already exists`);
    // Get all active salary structures
    const salaries = await prisma_1.prisma.salaryStructure.findMany();
    if (salaries.length === 0)
        throw new Error('No salary structures found');
    let totalGross = 0;
    let totalNet = 0;
    const payslipData = [];
    for (const sal of salaries) {
        const gross = Number(sal.baseSalary) + Number(sal.allowances);
        const paye = calculatePAYE(gross);
        const pension = gross * PENSION_RATE;
        const loanDeduction = Number(sal.monthlyLoanDeduction);
        const net = gross - paye - pension - loanDeduction;
        totalGross += gross;
        totalNet += net;
        payslipData.push({
            staffUid: sal.staffUid,
            staffName: sal.staffUid, // staffName resolved in future via staff table
            grossSalary: gross,
            paye,
            pension,
            loanDeduction,
            netSalary: net,
        });
        // Reduce loan balance
        if (loanDeduction > 0) {
            await prisma_1.prisma.salaryStructure.update({
                where: { staffUid: sal.staffUid },
                data: { loanBalance: { decrement: loanDeduction } },
            });
        }
    }
    // Create payroll run record
    const run = await prisma_1.prisma.payrollRun.create({
        data: { month, year, totalGross, totalNet, runByUid, status: 'PROCESSING' },
    });
    // Create payslips and generate PDFs
    for (const ps of payslipData) {
        const payslip = await prisma_1.prisma.payslip.create({
            data: { payrollRunId: run.id, ...ps },
        });
        // Generate payslip PDF → store in Appwrite
        const pdfKey = await (0, receiptService_1.generatePayslipPdf)(payslip.id, ps, month, year);
        await prisma_1.prisma.payslip.update({ where: { id: payslip.id }, data: { payslipKey: pdfKey } });
    }
    // Mark run complete
    await prisma_1.prisma.payrollRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
    });
    logger_1.logger.info({ event: 'payroll.completed', runId: run.id, month, year, totalGross, totalNet });
    return run.id;
}
async function getPayrollHistory(year) {
    return prisma_1.prisma.payrollRun.findMany({
        where: { year },
        orderBy: { month: 'desc' },
        include: { _count: { select: { payslips: true } } },
    });
}
async function getStaffPayslips(staffUid) {
    return prisma_1.prisma.payslip.findMany({
        where: { staffUid },
        orderBy: { createdAt: 'desc' },
        include: { payrollRun: { select: { month: true, year: true } } },
    });
}
//# sourceMappingURL=payrollService.js.map