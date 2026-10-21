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
 */

import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { uploadFile, FILE_PREFIX } from '@/lib/storage'
import { formatMWK } from '@shared/constants/malawi'
import { escapeHtml } from '@/lib/escapeHtml'
import { getSchoolLogo } from '@/server/services/schoolLogoService'
import { getIdentitySettings } from '@/server/services/settingsService'
import { LETTERHEAD_CSS, letterheadHtml } from '@/server/templates/documents/letterhead'

async function launchBrowser() {
  const isLocal = process.env.NODE_ENV !== 'production'
  if (isLocal) {
    // Use system Chrome in local dev — avoids needing to download Chromium
    const executablePath =
      process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : process.platform === 'darwin'
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : '/usr/bin/google-chrome'
    return puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
  // Vercel production: use @sparticuz/chromium
  // v133+ only exposes: args, executablePath() — NOT defaultViewport or headless
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
  })
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
  branding: { schoolName: string; schoolAddress: string; schoolPhone: string; schoolEmail: string },
  receiptPrefix: string,
): Promise<string> {
  const logo = await getSchoolLogo()
  const browser = await launchBrowser()
  let pdfBuffer: Buffer
  try {
    const page = await browser.newPage()
    await page.setContent(
      buildReceiptHtml({ paymentId, invoice, payment, student, branding, receiptPrefix, logoDataUri: logo.dataUri }),
      { waitUntil: 'load' },   // 'networkidle0' removed in puppeteer-core v24
    )
    pdfBuffer = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))
  } finally {
    // Previously a render error leaked the Chromium process (browser.close()
    // was skipped) — on a warm serverless instance that compounds failures.
    await browser.close()
  }
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
  const monthName = new Date(year, month - 1).toLocaleString('en-MW', { month: 'long' })
  const [logo, identity] = await Promise.all([getSchoolLogo(), getIdentitySettings()])
  const browser = await launchBrowser()
  let pdfBuffer: Buffer
  try {
    const page = await browser.newPage()
    await page.setContent(
      buildPayslipHtml({
        ...data, monthName, year,
        logoDataUri: logo.dataUri,
        branding: {
          schoolName: identity.schoolName,
          schoolAddress: identity.schoolAddress,
          schoolPhone: identity.schoolPhone,
          schoolEmail: identity.schoolEmail,
        },
      }),
      { waitUntil: 'load' },
    )
    pdfBuffer = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))
  } finally {
    await browser.close()
  }
  const filename = `payslip_${data.staffUid}_${year}-${String(month).padStart(2, '0')}.pdf`
  const uploaded = await uploadFile(FILE_PREFIX.PAYSLIP, pdfBuffer, filename, 'application/pdf')
  return uploaded.fileId
}

// --- HTML TEMPLATES ---------------------------------------
function buildReceiptHtml(d: {
  paymentId: string
  invoice: { id: string; studentId: string; academicYear: string; term: number }
  payment: { amount: number; method: string; reference?: string | null; recordedAt: Date }
  student: { firstName: string; lastName: string; registrationNo: string }
  branding: { schoolName: string; schoolAddress: string; schoolPhone: string; schoolEmail: string }
  receiptPrefix: string
  logoDataUri: string
}): string {
  const receiptNo = `${d.receiptPrefix}-${d.paymentId.slice(0, 8).toUpperCase()}`
  const e = escapeHtml
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body{font-family:Arial,sans-serif;color:#1A2535;padding:40px;}
    ${LETTERHEAD_CSS}
    .body{padding:24px;border:1px solid #DDE4EC;border-top:none;border-radius:0 0 8px 8px;}
    table{width:100%;border-collapse:collapse;margin-top:16px;}
    td{padding:8px;border-bottom:1px solid #EEE;font-size:13px;}
    td:first-child{color:#64748B;width:40%;}
    .amount{font-size:24px;font-weight:700;color:#0E8A6A;margin:16px 0;}
  </style></head>
  <body>
    ${letterheadHtml({
      logoDataUri: d.logoDataUri,
      schoolName: d.branding.schoolName,
      contactLines: [d.branding.schoolAddress, d.branding.schoolPhone, d.branding.schoolEmail],
      documentTitle: 'Payment Receipt',
    })}
    <div class="body">
      <p class="amount">${e(formatMWK(d.payment.amount))}</p>
      <table>
        <tr><td>Receipt No</td><td>${e(receiptNo)}</td></tr>
        <tr><td>Student</td><td>${e(d.student.firstName)} ${e(d.student.lastName)}</td></tr>
        <tr><td>Reg No</td><td>${e(d.student.registrationNo)}</td></tr>
        <tr><td>Academic Year</td><td>${e(d.invoice.academicYear)}</td></tr>
        <tr><td>Term</td><td>${e(d.invoice.term)}</td></tr>
        <tr><td>Method</td><td>${e(d.payment.method)}</td></tr>
        ${d.payment.reference ? `<tr><td>Reference</td><td>${e(d.payment.reference)}</td></tr>` : ''}
        <tr><td>Date</td><td>${e(d.payment.recordedAt.toLocaleDateString('en-MW'))}</td></tr>
      </table>
    </div>
  </body></html>`
}

function buildPayslipHtml(data: {
  staffUid: string; staffName: string; grossSalary: number
  paye: number; pension: number; pensionPercent: number; loanDeduction: number; netSalary: number
  monthName: string; year: number
  logoDataUri: string
  branding: { schoolName: string; schoolAddress: string; schoolPhone: string; schoolEmail: string }
}): string {
  const e = escapeHtml
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body{font-family:Arial,sans-serif;color:#1A2535;padding:40px;}
    ${LETTERHEAD_CSS}
    .body{padding:24px;border:1px solid #DDE4EC;border-top:none;border-radius:0 0 8px 8px;}
    table{width:100%;border-collapse:collapse;margin-top:16px;}
    td{padding:8px;border-bottom:1px solid #EEE;font-size:13px;}
    td:first-child{color:#64748B;width:50%;}
    .net{font-size:20px;font-weight:700;color:#0E8A6A;}
  </style></head>
  <body>
    ${letterheadHtml({
      logoDataUri: data.logoDataUri,
      schoolName: data.branding.schoolName,
      contactLines: [data.branding.schoolAddress, data.branding.schoolPhone, data.branding.schoolEmail],
      documentTitle: `Payslip — ${data.monthName} ${data.year}`,
    })}
    <div class="body">
      <p><strong>${e(data.staffName)}</strong> | UID: ${e(data.staffUid)}</p>
      <table>
        <tr><td>Gross Salary</td><td>${e(formatMWK(data.grossSalary))}</td></tr>
        <tr><td>PAYE Tax</td><td>- ${e(formatMWK(data.paye))}</td></tr>
        <tr><td>Pension (${e(data.pensionPercent)}%)</td><td>- ${e(formatMWK(data.pension))}</td></tr>
        ${data.loanDeduction > 0 ? `<tr><td>Loan Deduction</td><td>- ${e(formatMWK(data.loanDeduction))}</td></tr>` : ''}
        <tr><td class="net">Net Pay</td><td class="net">${e(formatMWK(data.netSalary))}</td></tr>
      </table>
    </div>
  </body></html>`
}
