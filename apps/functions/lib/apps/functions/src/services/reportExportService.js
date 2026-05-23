"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateFinancialReport = generateFinancialReport;
const exceljs_1 = __importDefault(require("exceljs"));
const prisma_1 = require("../lib/prisma");
const storage_1 = require("../lib/storage");
async function generateFinancialReport(type, academicYear, term) {
    const wb = new exceljs_1.default.Workbook();
    wb.creator = 'SMS Malawi Finance System';
    wb.created = new Date();
    switch (type) {
        case 'fee_collection':
            await buildFeeCollectionSheet(wb, academicYear, term);
            break;
        case 'outstanding_balances':
            await buildOutstandingSheet(wb, academicYear, term);
            break;
        case 'expense_breakdown':
            await buildExpenseSheet(wb, academicYear, term);
            break;
        case 'payroll_summary':
            await buildPayrollSheet(wb, new Date().getFullYear());
            break;
    }
    const buffer = await wb.xlsx.writeBuffer();
    const filename = `reports_${type}_${academicYear.replace('/', '-')}_term${term}_${Date.now()}.xlsx`;
    const fileId = await (0, storage_1.uploadFile)(storage_1.STORAGE_BUCKETS.PAYSLIPS, Buffer.from(buffer), filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    // Return a download URL so the frontend can download it
    return (0, storage_1.getDownloadUrl)(storage_1.STORAGE_BUCKETS.PAYSLIPS, fileId);
}
// --- SHEET BUILDERS --------------------------------------
function styleHeader(ws, cols) {
    const headerRow = ws.getRow(1);
    cols.forEach((col, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = col;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2744' } };
        cell.alignment = { horizontal: 'left' };
    });
    headerRow.commit();
}
async function buildFeeCollectionSheet(wb, academicYear, term) {
    const ws = wb.addWorksheet('Fee Collection');
    const cols = [
        'Student ID',
        'Academic Year',
        'Term',
        'Total (MWK)',
        'Paid (MWK)',
        'Balance (MWK)',
        'Status',
        'Due Date',
    ];
    ws.columns = cols.map((h, i) => ({
        key: String(i),
        width: i > 2 && i < 6 ? 18 : 15,
    }));
    styleHeader(ws, cols);
    const invoices = await prisma_1.prisma.invoice.findMany({
        where: { academicYear, term },
        orderBy: { status: 'asc' },
    });
    invoices.forEach((inv) => {
        ws.addRow([
            inv.studentId,
            inv.academicYear,
            `Term ${inv.term}`,
            Number(inv.totalAmount),
            Number(inv.paidAmount),
            Number(inv.balance),
            inv.status,
            inv.dueDate.toLocaleDateString('en-MW'),
        ]);
    });
    // Summary row
    ws.addRow([]);
    ws.addRow([
        'TOTALS',
        '',
        '',
        invoices.reduce((s, i) => s + Number(i.totalAmount), 0),
        invoices.reduce((s, i) => s + Number(i.paidAmount), 0),
        invoices.reduce((s, i) => s + Number(i.balance), 0),
    ]).font = { bold: true };
}
async function buildOutstandingSheet(wb, academicYear, term) {
    const ws = wb.addWorksheet('Outstanding Balances');
    const cols = ['Student ID', 'Term', 'Balance (MWK)', 'Status', 'Due Date'];
    ws.columns = cols.map(() => ({ width: 18 }));
    styleHeader(ws, cols);
    const overdue = await prisma_1.prisma.invoice.findMany({
        where: { academicYear, term, status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
        orderBy: { balance: 'desc' },
    });
    overdue.forEach((inv) => {
        ws.addRow([
            inv.studentId,
            `Term ${inv.term}`,
            Number(inv.balance),
            inv.status,
            inv.dueDate.toLocaleDateString('en-MW'),
        ]);
    });
}
async function buildExpenseSheet(wb, academicYear, term) {
    const ws = wb.addWorksheet('Expense Breakdown');
    const cols = ['Category', 'Description', 'Amount (MWK)', 'Date', 'Status'];
    ws.columns = cols.map((_, i) => ({ width: i === 1 ? 30 : 18 }));
    styleHeader(ws, cols);
    const expenses = await prisma_1.prisma.expense.findMany({
        where: { academicYear, term },
        orderBy: [{ category: 'asc' }, { incurredAt: 'desc' }],
    });
    expenses.forEach((e) => {
        ws.addRow([
            e.category,
            e.description,
            Number(e.amount),
            e.incurredAt.toLocaleDateString('en-MW'),
            e.status,
        ]);
    });
}
async function buildPayrollSheet(wb, year) {
    const ws = wb.addWorksheet('Payroll Summary');
    const cols = ['Month', 'Total Gross (MWK)', 'Total Net (MWK)', 'Status', 'Run Date'];
    ws.columns = cols.map(() => ({ width: 20 }));
    styleHeader(ws, cols);
    const runs = await prisma_1.prisma.payrollRun.findMany({
        where: { year },
        orderBy: { month: 'asc' },
    });
    runs.forEach((r) => {
        const monthName = new Date(r.year, r.month - 1).toLocaleString('en', { month: 'long' });
        ws.addRow([
            monthName,
            Number(r.totalGross),
            Number(r.totalNet),
            r.status,
            r.completedAt?.toLocaleDateString('en-MW') ?? '—',
        ]);
    });
}
//# sourceMappingURL=reportExportService.js.map