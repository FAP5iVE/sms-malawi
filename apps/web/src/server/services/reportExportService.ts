/*
 * apps/web/src/server/services/reportExportService.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
 *   Reconciliation
 * [PURPOSE]: Corrected the bucket/prefix used for all four financial
 *   report uploads (Fee Collection, Outstanding Balances, Expense
 *   Breakdown, Payroll Summary) — was STORAGE_BUCKETS.PAYSLIPS, which is
 *   not merely a semantically wrong label (as this phase's roadmap
 *   describes it) but a genuine type mismatch: uploadFile()'s first
 *   parameter is a FilePrefix, not a StorageBucket, and every
 *   StorageBucket value is the single literal 'school_files' — not a
 *   member of the FilePrefix union at all. This also broke
 *   canReadFile()'s prefix-based access control for every exported
 *   report, since a school_files_-prefixed fileId matches no READ_ROLES
 *   category. Repointed at the new FILE_PREFIX.FINANCIAL_REPORT (added
 *   this phase in storage.ts, gated to admin/finance/high_rank — matching
 *   this file's own POST /finances/reports/export route gate). Also
 *   fixed uploadFile()'s return value being passed directly where a
 *   plain fileId string was expected — uploadFile() returns an
 *   UploadResult object; the real fileId is `.fileId`. Added
 *   `import 'server-only'`.
 * [DEPENDS ON]: W/lib/storage.ts (FILE_PREFIX.FINANCIAL_REPORT, same
 *   phase)
 */

import 'server-only'
import ExcelJS from 'exceljs'
import { prisma } from '@/lib/prisma'
import { uploadFile, getDownloadUrl, FILE_PREFIX } from '@/lib/storage'
import { formatMWK } from '@shared/constants/malawi'

type ReportType =
  | 'fee_collection'
  | 'outstanding_balances'
  | 'expense_breakdown'
  | 'payroll_summary'

export async function generateFinancialReport(
  type: ReportType,
  academicYear: string,
  term: number
): Promise<string> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SMS Malawi Finance System'
  wb.created = new Date()

  switch (type) {
    case 'fee_collection':
      await buildFeeCollectionSheet(wb, academicYear, term)
      break
    case 'outstanding_balances':
      await buildOutstandingSheet(wb, academicYear, term)
      break
    case 'expense_breakdown':
      await buildExpenseSheet(wb, academicYear, term)
      break
    case 'payroll_summary':
      await buildPayrollSheet(wb, new Date().getFullYear())
      break
  }

  const buffer = await wb.xlsx.writeBuffer()
  const filename = `reports_${type}_${academicYear.replace('/', '-')}_term${term}_${Date.now()}.xlsx`

  const uploaded = await uploadFile(
    FILE_PREFIX.FINANCIAL_REPORT,
    Buffer.from(buffer),
    filename,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )

  // Return a download URL so the frontend can download it
  return getDownloadUrl(FILE_PREFIX.FINANCIAL_REPORT, uploaded.fileId)
}

// --- SHEET BUILDERS --------------------------------------
function styleHeader(ws: ExcelJS.Worksheet, cols: string[]) {
  const headerRow = ws.getRow(1)
  cols.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = col
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2744' } }
    cell.alignment = { horizontal: 'left' }
  })
  headerRow.commit()
}

async function buildFeeCollectionSheet(wb: ExcelJS.Workbook, academicYear: string, term: number) {
  const ws = wb.addWorksheet('Fee Collection')
  const cols = [
    'Student',
    'Student Reg No',
    'Academic Year',
    'Term',
    'Total (MWK)',
    'Paid (MWK)',
    'Balance (MWK)',
    'Status',
    'Due Date',
  ]
  ws.columns = cols.map((h, i) => ({
    key: String(i),
    width: i > 3 && i < 7 ? 18 : 15,
  }))
  styleHeader(ws, cols)

  const invoices = await prisma.invoice.findMany({
    where: { academicYear, term },
    orderBy: { status: 'asc' },
    include: { student: { select: { firstName: true, lastName: true, registrationNo: true } } },
  })

  invoices.forEach((inv) => {
    ws.addRow([
      inv.student ? `${inv.student.firstName} ${inv.student.lastName}` : '—',
      inv.student?.registrationNo ?? '—',
      inv.academicYear,
      `Term ${inv.term}`,
      Number(inv.totalAmount),
      Number(inv.paidAmount),
      Number(inv.balance),
      inv.status,
      inv.dueDate.toLocaleDateString('en-MW'),
    ])
  })

  // Summary row
  ws.addRow([])
  ws.addRow([
    'TOTALS',
    '',
    '',
    '',
    invoices.reduce((s, i) => s + Number(i.totalAmount), 0),
    invoices.reduce((s, i) => s + Number(i.paidAmount), 0),
    invoices.reduce((s, i) => s + Number(i.balance), 0),
  ]).font = { bold: true }
}

async function buildOutstandingSheet(wb: ExcelJS.Workbook, academicYear: string, term: number) {
  const ws = wb.addWorksheet('Outstanding Balances')
  const cols = ['Student', 'Student Reg No', 'Term', 'Balance (MWK)', 'Status', 'Due Date']
  ws.columns = cols.map(() => ({ width: 18 }))
  styleHeader(ws, cols)

  const overdue = await prisma.invoice.findMany({
    where: { academicYear, term, status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
    orderBy: { balance: 'desc' },
    include: { student: { select: { firstName: true, lastName: true, registrationNo: true } } },
  })

  overdue.forEach((inv) => {
    ws.addRow([
      inv.student ? `${inv.student.firstName} ${inv.student.lastName}` : '—',
      inv.student?.registrationNo ?? '—',
      `Term ${inv.term}`,
      Number(inv.balance),
      inv.status,
      inv.dueDate.toLocaleDateString('en-MW'),
    ])
  })
}

async function buildExpenseSheet(wb: ExcelJS.Workbook, academicYear: string, term: number) {
  const ws = wb.addWorksheet('Expense Breakdown')
  const cols = ['Category', 'Description', 'Amount (MWK)', 'Date', 'Status']
  ws.columns = cols.map((_, i) => ({ width: i === 1 ? 30 : 18 }))
  styleHeader(ws, cols)

  const expenses = await prisma.expense.findMany({
    where: { academicYear, term },
    orderBy: [{ category: 'asc' }, { incurredAt: 'desc' }],
  })

  expenses.forEach((e) => {
    ws.addRow([
      e.category,
      e.description,
      Number(e.amount),
      e.incurredAt.toLocaleDateString('en-MW'),
      e.status,
    ])
  })
}

async function buildPayrollSheet(wb: ExcelJS.Workbook, year: number) {
  const ws = wb.addWorksheet('Payroll Summary')
  const cols = ['Month', 'Total Gross (MWK)', 'Total Net (MWK)', 'Status', 'Run Date']
  ws.columns = cols.map(() => ({ width: 20 }))
  styleHeader(ws, cols)

  const runs = await prisma.payrollRun.findMany({
    where: { year },
    orderBy: { month: 'asc' },
  })

  runs.forEach((r) => {
    const monthName = new Date(r.year, r.month - 1).toLocaleString('en', { month: 'long' })
    ws.addRow([
      monthName,
      Number(r.totalGross),
      Number(r.totalNet),
      r.status,
      r.completedAt?.toLocaleDateString('en-MW') ?? '—',
    ])
  })
}