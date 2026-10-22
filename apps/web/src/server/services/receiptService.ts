/*
 * apps/web/src/server/services/receiptService.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
 *   Reconciliation
 * [PURPOSE]:
 *   1. buildPayslipHtml()'s hardcoded "Pension (5%)" label now derives
 *      the percentage from a `pensionPercent` value the caller
 *      (payrollService.ts, this same phase) passes through from
 *      SETTING_KEYS.FINANCE_PENSION_PERCENT — the two can never silently
 *      disagree if the rate is ever changed in Settings.
 *   3. Removed an unused, build-breaking import of a nonexistent
 *      `getViewUrl` export (no such export exists in storage.ts — the
 *      real helper is `getSignedViewUrl`; this is the identical defect
 *      already fixed in finances.ts during R9). Nothing in this file
 *      actually calls it, so it is simply removed rather than swapped in
 *      unused.
 *   4. THIRD DISCOVERED BUG, found while making fix #1: both
 *      generateReceipt() and generatePayslipPdf() passed
 *      STORAGE_BUCKETS.PAYSLIPS (a StorageBucket — the single literal
 *      'school_files') to uploadFile(), whose first parameter is a
 *      FilePrefix, not a StorageBucket — the identical class of defect
 *      already fixed in R10's reportExportService.ts and finances.ts.
 *      Both functions also returned uploadFile()'s whole `UploadResult`
 *      object where their own declared return type (and every caller —
 *      feeService.recordPayment(), payrollService.processMonthlyPayroll())
 *      expects a plain fileId string; a Payment/Payslip row's
 *      receiptKey/payslipKey has genuinely never been a valid file
 *      reference. Both are corrected to use their real FILE_PREFIX
 *      category (RECEIPT / PAYSLIP) and return `.fileId`.
 * [DEPENDS ON]: payrollService.ts (passes pensionPercent through, same
 *   phase)
 *
 * [CHANGE TYPE]: MAJOR REWRITE OF THE RENDERING ENGINE (same exports/signatures)
 * [PURPOSE]: "Payslips and payment receipts never open, but report cards do."
 *   Report cards and transcripts are drawn with jsPDF (pure JavaScript, runs
 *   anywhere). Receipts and payslips were the only documents drawn by launching
 *   headless Chromium (puppeteer-core + @sparticuz/chromium) inside the request
 *   — and, for payslips, once per employee inside the payroll DB transaction.
 *   Chromium cannot launch in the dev/seed/serverless environments that lack it,
 *   so generation threw, receiptKey/payslipKey stayed null, and every preview
 *   answered 404/500 (feeService.recordPayment deliberately swallows the
 *   failure; the seed script documents "safely no-ops without storage/chromium").
 *   Both documents are now drawn with jsPDF using the same branding helper
 *   (pdfBranding.drawLogoBadge + schoolLogoService.getRasterSchoolLogo) as the
 *   report card and transcript, so they work wherever those work.
 *   generateReceipt()/generatePayslipPdf() keep their signatures and still
 *   return the Appwrite fileId.
 * [DEPENDS ON]: jspdf, pdfBranding.ts, schoolLogoService.ts
 */

import { jsPDF } from 'jspdf'
import { uploadFile, FILE_PREFIX } from '@/lib/storage'
import { formatMWK } from '@shared/constants/malawi'
import { getRasterSchoolLogo } from '@/server/services/schoolLogoService'
import { getIdentitySettings } from '@/server/services/settingsService'
import { drawLogoBadge } from '@/server/services/pdfBranding'

interface DocBranding {
  schoolName: string
  schoolAddress: string
  schoolPhone: string
  schoolEmail: string
}

// --- SHARED jsPDF DRAWING HELPERS -------------------------
const PAGE_W = 210
const MARGIN = 20
const CONTENT_W = PAGE_W - MARGIN * 2
const NAVY: [number, number, number] = [15, 39, 68]
const GREEN: [number, number, number] = [14, 138, 106]
const MUTED: [number, number, number] = [100, 116, 139]
const INK: [number, number, number] = [26, 37, 53]
const RULE: [number, number, number] = [221, 228, 236]

/** jsPDF's built-in Helvetica is WinAnsi only; Intl's currency output uses a
 *  non-breaking space, which is safe, but normalise it so widths are predictable. */
function pdfText(value: string | number): string {
  return String(value).replace(/[\u00a0\u202f]/g, ' ')
}

/** Draws the navy letterhead (logo badge + school name + contact line + title).
 *  @returns the y position (mm) where the document body should start. */
function drawLetterhead(doc: jsPDF, logoDataUri: string, branding: DocBranding, title: string): number {
  const top = 20
  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2])
  doc.roundedRect(MARGIN, top, CONTENT_W, 26, 2, 2, 'F')
  drawLogoBadge(doc, logoDataUri, MARGIN + 3, top + 3, 20)

  const textX = MARGIN + 26 + (CONTENT_W - 26) / 2
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  const nameLines = doc.splitTextToSize(pdfText(branding.schoolName), CONTENT_W - 32) as string[]
  doc.text(nameLines[0] ?? '', textX, top + 11, { align: 'center' })

  const contact = [branding.schoolAddress, branding.schoolPhone, branding.schoolEmail]
    .map((l) => (l ?? '').trim())
    .filter(Boolean)
    .join('  ·  ')
  if (contact) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(183, 196, 214)
    const contactLines = doc.splitTextToSize(pdfText(contact), CONTENT_W - 32) as string[]
    doc.text(contactLines[0] ?? '', textX, top + 18, { align: 'center' })
  }

  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2])
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(pdfText(title).toUpperCase(), MARGIN, top + 38)
  return top + 46
}

interface DocRow { label: string; value: string; emphasis?: boolean }

/** Draws label/value rows with a hairline under each. @returns the next free y. */
function drawRows(doc: jsPDF, startY: number, rows: DocRow[]): number {
  let y = startY
  for (const r of rows) {
    const c = r.emphasis ? GREEN : MUTED
    doc.setFont('helvetica', r.emphasis ? 'bold' : 'normal')
    doc.setFontSize(r.emphasis ? 12 : 10)
    doc.setTextColor(c[0], c[1], c[2])
    doc.text(pdfText(r.label), MARGIN + 3, y)
    const v = r.emphasis ? GREEN : INK
    doc.setTextColor(v[0], v[1], v[2])
    doc.text(pdfText(r.value), MARGIN + CONTENT_W - 3, y, { align: 'right' })
    doc.setDrawColor(RULE[0], RULE[1], RULE[2])
    doc.line(MARGIN, y + 3, MARGIN + CONTENT_W, y + 3)
    y += 9
  }
  return y
}

function drawFooter(doc: jsPDF): void {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(
    pdfText(`Generated on ${new Date().toLocaleDateString('en-GB')}. This is a computer-generated document.`),
    PAGE_W / 2, 282, { align: 'center' },
  )
}

// --- PAYMENT RECEIPT PDF ----------------------------------
export async function generateReceipt(
  paymentId: string,
  invoice: { id: string; studentId: string; academicYear: string; term: number },
  payment: { amount: number; method: string; reference?: string | null; recordedAt: Date },
  student: { firstName: string; lastName: string; registrationNo: string },
  // [PRODUCTION FIX 2026-07-28] The receipt header showed only the literal
  // text "Payment Receipt" — no school name or address at all — and the
  // receipt number ignored the real, already-editable receipt_prefix
  // setting entirely (it was just the payment ID's first 8 characters).
  // Both real gaps, now closed: branding is the school's real identity
  // (getSchoolBranding(), same helper notificationService.ts already
  // uses), receiptPrefix is SETTING_KEYS receipt_prefix.
  branding: DocBranding,
  receiptPrefix: string,
): Promise<string> {
  const logo = await getRasterSchoolLogo()
  const pdfBuffer = buildReceiptPdf({ paymentId, invoice, payment, student, branding, receiptPrefix, logoDataUri: logo.dataUri })
  const filename = `receipt_${paymentId}.pdf`
  const uploaded = await uploadFile(FILE_PREFIX.RECEIPT, pdfBuffer, filename, 'application/pdf')
  return uploaded.fileId
}

// --- PAYSLIP PDF ------------------------------------------
// Signature: 4 args — payslipId, data, month, year
// This matches the call in payrollService: generatePayslipPdf(payslip.id, ps, month, year)
export async function generatePayslipPdf(
  payslipId: string,
  data: {
    staffUid: string
    staffName: string
    grossSalary: number
    paye: number
    pension: number
    pensionPercent: number
    loanDeduction: number
    netSalary: number
  },
  month: number,
  year: number
): Promise<string> {
  void payslipId
  const monthName = new Date(year, month - 1).toLocaleString('en-MW', { month: 'long' })
  const [logo, identity] = await Promise.all([getRasterSchoolLogo(), getIdentitySettings()])
  const pdfBuffer = buildPayslipPdf({
    ...data, monthName, year,
    logoDataUri: logo.dataUri,
    branding: {
      schoolName: identity.schoolName,
      schoolAddress: identity.schoolAddress,
      schoolPhone: identity.schoolPhone,
      schoolEmail: identity.schoolEmail,
    },
  })
  const filename = `payslip_${data.staffUid}_${year}-${String(month).padStart(2, '0')}.pdf`
  const uploaded = await uploadFile(FILE_PREFIX.PAYSLIP, pdfBuffer, filename, 'application/pdf')
  return uploaded.fileId
}

// --- PDF BUILDERS -----------------------------------------
function buildReceiptPdf(d: {
  paymentId: string
  invoice: { id: string; studentId: string; academicYear: string; term: number }
  payment: { amount: number; method: string; reference?: string | null; recordedAt: Date }
  student: { firstName: string; lastName: string; registrationNo: string }
  branding: DocBranding
  receiptPrefix: string
  logoDataUri: string
}): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const receiptNo = `${d.receiptPrefix}-${d.paymentId.slice(0, 8).toUpperCase()}`
  let y = drawLetterhead(doc, d.logoDataUri, d.branding, 'Payment Receipt')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(GREEN[0], GREEN[1], GREEN[2])
  doc.text(pdfText(formatMWK(d.payment.amount)), MARGIN + 3, y + 4)
  y += 16

  const rows: DocRow[] = [
    { label: 'Receipt No', value: receiptNo },
    { label: 'Student', value: `${d.student.firstName} ${d.student.lastName}` },
    { label: 'Reg No', value: d.student.registrationNo },
    { label: 'Academic Year', value: d.invoice.academicYear },
    { label: 'Term', value: String(d.invoice.term) },
    { label: 'Method', value: d.payment.method },
  ]
  if (d.payment.reference) rows.push({ label: 'Reference', value: d.payment.reference })
  rows.push({ label: 'Date', value: d.payment.recordedAt.toLocaleDateString('en-MW') })
  drawRows(doc, y, rows)
  drawFooter(doc)
  return Buffer.from(doc.output('arraybuffer'))
}

function buildPayslipPdf(data: {
  staffUid: string; staffName: string; grossSalary: number
  paye: number; pension: number; pensionPercent: number; loanDeduction: number; netSalary: number
  monthName: string; year: number
  logoDataUri: string
  branding: DocBranding
}): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = drawLetterhead(doc, data.logoDataUri, data.branding, `Payslip — ${data.monthName} ${data.year}`)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(pdfText(data.staffName), MARGIN + 3, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(pdfText(`UID: ${data.staffUid}`), MARGIN + 3, y + 5)
  y += 14

  const rows: DocRow[] = [
    { label: 'Gross Salary', value: formatMWK(data.grossSalary) },
    { label: 'PAYE Tax', value: `- ${formatMWK(data.paye)}` },
    { label: `Pension (${data.pensionPercent}%)`, value: `- ${formatMWK(data.pension)}` },
  ]
  if (data.loanDeduction > 0) rows.push({ label: 'Loan Deduction', value: `- ${formatMWK(data.loanDeduction)}` })
  rows.push({ label: 'Net Pay', value: formatMWK(data.netSalary), emphasis: true })
  drawRows(doc, y, rows)
  drawFooter(doc)
  return Buffer.from(doc.output('arraybuffer'))
}
