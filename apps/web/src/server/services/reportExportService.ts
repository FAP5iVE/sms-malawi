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
import { uploadFile, getSignedViewUrl, FILE_PREFIX } from '@/lib/storage'
import { getRasterSchoolLogo } from '@/server/services/schoolLogoService'
import { getIdentitySettings } from '@/server/services/settingsService'
import { statusWord } from '@/lib/hills/statusWord'

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
  wb.created = new Date()

  // Resolve the school identity + logo once; every sheet gets the same banner.
  const [identity, logo] = await Promise.all([getIdentitySettings(), getRasterSchoolLogo()])
  wb.creator = identity.schoolName
  const brand: SheetBrand = {
    schoolName: identity.schoolName,
    logoImageId: wb.addImage({ base64: logo.base64, extension: logo.rasterFormat }),
  }

  switch (type) {
    case 'fee_collection':
      await buildFeeCollectionSheet(wb, academicYear, term, brand)
      break
    case 'outstanding_balances':
      await buildOutstandingSheet(wb, academicYear, term, brand)
      break
    case 'expense_breakdown':
      await buildExpenseSheet(wb, academicYear, term, brand)
      break
    case 'payroll_summary':
      await buildPayrollSheet(wb, new Date().getFullYear(), brand)
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

  // [PRODUCTION FIX] Returned getDownloadUrl() — a raw storage URL. The
  // financial_report files are private (not in PUBLIC_FILE_PREFIXES), so that
  // URL is refused by storage for every caller and the export "worked" but the
  // download never did. Return this app's auth-checked /api/files/<id> proxy
  // URL instead (READ_ROLES.financial_report = admin/finance/high_rank); the
  // client downloads it with the caller's ID token (downloadProtectedFile).
  return getSignedViewUrl(uploaded.fileId)
}

// --- SHEET BUILDERS --------------------------------------
interface SheetBrand {
  schoolName: string
  /** Id returned by wb.addImage() for the school logo. */
  logoImageId: number
}

/**
 * Letterhead banner (logo + school name + report title + period) occupying
 * rows 1-4; the table header is row 5 and data follows. Returns the header
 * row number. Replaces the old behaviour of a bare header on row 1 — a report
 * handed to the board or the auditors now identifies the school.
 */
function addBanner(ws: ExcelJS.Worksheet, brand: SheetBrand, title: string, subtitle: string, colCount: number): number {
  ws.getRow(1).height = 24
  ws.getRow(2).height = 20
  ws.getRow(3).height = 20
  ws.getRow(4).height = 8

  ws.addImage(brand.logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 64, height: 64 } })

  const last = Math.max(colCount, 3)
  const name = ws.getCell('B1')
  name.value = brand.schoolName
  name.font = { bold: true, size: 15, color: { argb: 'FF1E3A5F' } }
  name.alignment = { vertical: 'middle' }
  ws.mergeCells(1, 2, 1, last)

  const t = ws.getCell('B2')
  t.value = title
  t.font = { bold: true, size: 12, color: { argb: 'FF0F172A' } }
  t.alignment = { vertical: 'middle' }
  ws.mergeCells(2, 2, 2, last)

  const s = ws.getCell('B3')
  s.value = `${subtitle}  ·  Generated ${shortDate(new Date())}`
  s.font = { size: 10, color: { argb: 'FF64748B' } }
  s.alignment = { vertical: 'middle' }
  ws.mergeCells(3, 2, 3, last)

  return 5
}

/** "19 Nov 2026": the day and month in words, so it reads the same whichever way round the reader writes dates. */
function shortDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

function styleHeader(ws: ExcelJS.Worksheet, cols: string[], rowNumber = 1) {
  // Printed pages (R11.7): A4 landscape, one page wide, header row repeated, "Page x of y" in the footer.
  ws.pageSetup = { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${rowNumber}:${rowNumber}` }
  ws.headerFooter.oddFooter = `&L&8${ws.name}&C&8Generated &D&R&8Page &P of &N`
  const headerRow = ws.getRow(rowNumber)
  cols.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = col
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    cell.alignment = { horizontal: 'left' }
  })
  headerRow.commit()
}

async function buildFeeCollectionSheet(wb: ExcelJS.Workbook, academicYear: string, term: number, brand: SheetBrand) {
  const ws = wb.addWorksheet('Fee collection')
  const cols = [
    'Student',
    'Reg. no.',
    'Academic year',
    'Term',
    'Total (MWK)',
    'Paid (MWK)',
    'Balance (MWK)',
    'Status',
    'Due date',
  ]
  ws.columns = cols.map((h, i) => ({
    key: String(i),
    width: i > 3 && i < 7 ? 18 : 15,
  }))
  styleHeader(ws, cols, addBanner(ws, brand, 'Fee collection report', `Academic Year ${academicYear} · Term ${term}`, cols.length))

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
      statusWord(inv.status),
      shortDate(inv.dueDate),
    ])
  })

  // Summary row
  ws.addRow([])
  ws.addRow([
    'Total',
    '',
    '',
    '',
    invoices.reduce((s, i) => s + Number(i.totalAmount), 0),
    invoices.reduce((s, i) => s + Number(i.paidAmount), 0),
    invoices.reduce((s, i) => s + Number(i.balance), 0),
  ]).font = { bold: true }
}

async function buildOutstandingSheet(wb: ExcelJS.Workbook, academicYear: string, term: number, brand: SheetBrand) {
  const ws = wb.addWorksheet('Outstanding balances')
  const cols = ['Student', 'Reg. no.', 'Term', 'Balance (MWK)', 'Status', 'Due date']
  ws.columns = cols.map(() => ({ width: 18 }))
  styleHeader(ws, cols, addBanner(ws, brand, 'Outstanding balances', `Academic Year ${academicYear} · Term ${term}`, cols.length))

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
      statusWord(inv.status),
      shortDate(inv.dueDate),
    ])
  })
}

async function buildExpenseSheet(wb: ExcelJS.Workbook, academicYear: string, term: number, brand: SheetBrand) {
  const ws = wb.addWorksheet('Expense breakdown')
  const cols = ['Category', 'Description', 'Amount (MWK)', 'Date', 'Status']
  ws.columns = cols.map((_, i) => ({ width: i === 1 ? 30 : 18 }))
  styleHeader(ws, cols, addBanner(ws, brand, 'Expense breakdown', `Academic Year ${academicYear} · Term ${term}`, cols.length))

  const expenses = await prisma.expense.findMany({
    where: { academicYear, term },
    orderBy: [{ category: 'asc' }, { incurredAt: 'desc' }],
  })

  expenses.forEach((e) => {
    ws.addRow([
      statusWord(e.category),
      e.description,
      Number(e.amount),
      shortDate(e.incurredAt),
      statusWord(e.status),
    ])
  })
}

async function buildPayrollSheet(wb: ExcelJS.Workbook, year: number, brand: SheetBrand) {
  const ws = wb.addWorksheet('Payroll summary')
  const cols = ['Month', 'Total gross (MWK)', 'Total net (MWK)', 'Status', 'Run date']
  ws.columns = cols.map(() => ({ width: 20 }))
  styleHeader(ws, cols, addBanner(ws, brand, 'Payroll summary', `Payroll Year ${year}`, cols.length))

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
      statusWord(r.status),
      r.completedAt ? shortDate(r.completedAt) : '',
    ])
  })
}