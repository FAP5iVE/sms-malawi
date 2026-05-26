
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { uploadFile, getViewUrl, STORAGE_BUCKETS } from '@/lib/storage'
import { formatMWK } from '@shared/constants/malawi'

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
  student: { firstName: string; lastName: string; registrationNo: string }
): Promise<string> {
  const browser = await launchBrowser()
  const page = await browser.newPage()
  await page.setContent(buildReceiptHtml({ paymentId, invoice, payment, student }), {
    waitUntil: 'load',   // 'networkidle0' removed in puppeteer-core v24
  })
  const pdfBuffer = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))
  await browser.close()
  const filename = `receipt_${paymentId}.pdf`
  return uploadFile(STORAGE_BUCKETS.PAYSLIPS, pdfBuffer, filename, 'application/pdf')
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
    loanDeduction: number
    netSalary: number
  },
  month: number,
  year: number
): Promise<string> {
  const monthName = new Date(year, month - 1).toLocaleString('en-MW', { month: 'long' })
  const browser = await launchBrowser()
  const page = await browser.newPage()
  await page.setContent(buildPayslipHtml({ ...data, monthName, year }), { waitUntil: 'load' })
  const pdfBuffer = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))
  await browser.close()
  const filename = `payslip_${data.staffUid}_${year}-${String(month).padStart(2, '0')}.pdf`
  return uploadFile(STORAGE_BUCKETS.PAYSLIPS, pdfBuffer, filename, 'application/pdf')
}

// --- HTML TEMPLATES ---------------------------------------
function buildReceiptHtml(d: {
  paymentId: string
  invoice: { id: string; studentId: string; academicYear: string; term: number }
  payment: { amount: number; method: string; reference?: string | null; recordedAt: Date }
  student: { firstName: string; lastName: string; registrationNo: string }
}): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body{font-family:Arial,sans-serif;color:#1A2535;padding:40px;}
    .header{background:#0F2744;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;}
    .body{padding:24px;border:1px solid #DDE4EC;border-top:none;border-radius:0 0 8px 8px;}
    table{width:100%;border-collapse:collapse;margin-top:16px;}
    td{padding:8px;border-bottom:1px solid #EEE;font-size:13px;}
    td:first-child{color:#64748B;width:40%;}
    .amount{font-size:24px;font-weight:700;color:#0E8A6A;margin:16px 0;}
  </style></head>
  <body>
    <div class="header"><h2 style="margin:0">Payment Receipt</h2></div>
    <div class="body">
      <p class="amount">${formatMWK(d.payment.amount)}</p>
      <table>
        <tr><td>Receipt No</td><td>${d.paymentId.slice(0, 8).toUpperCase()}</td></tr>
        <tr><td>Student</td><td>${d.student.firstName} ${d.student.lastName}</td></tr>
        <tr><td>Reg No</td><td>${d.student.registrationNo}</td></tr>
        <tr><td>Academic Year</td><td>${d.invoice.academicYear}</td></tr>
        <tr><td>Term</td><td>${d.invoice.term}</td></tr>
        <tr><td>Method</td><td>${d.payment.method}</td></tr>
        ${d.payment.reference ? `<tr><td>Reference</td><td>${d.payment.reference}</td></tr>` : ''}
        <tr><td>Date</td><td>${d.payment.recordedAt.toLocaleDateString('en-MW')}</td></tr>
      </table>
    </div>
  </body></html>`
}

function buildPayslipHtml(data: {
  staffUid: string; staffName: string; grossSalary: number
  paye: number; pension: number; loanDeduction: number; netSalary: number
  monthName: string; year: number
}): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body{font-family:Arial,sans-serif;color:#1A2535;padding:40px;}
    .header{background:#0F2744;color:white;padding:20px;border-radius:8px 8px 0 0;}
    .body{padding:24px;border:1px solid #DDE4EC;border-top:none;border-radius:0 0 8px 8px;}
    table{width:100%;border-collapse:collapse;margin-top:16px;}
    td{padding:8px;border-bottom:1px solid #EEE;font-size:13px;}
    td:first-child{color:#64748B;width:50%;}
    .net{font-size:20px;font-weight:700;color:#0E8A6A;}
  </style></head>
  <body>
    <div class="header"><h2 style="margin:0">Payslip — ${data.monthName} ${data.year}</h2></div>
    <div class="body">
      <p><strong>${data.staffName}</strong> | UID: ${data.staffUid}</p>
      <table>
        <tr><td>Gross Salary</td><td>${formatMWK(data.grossSalary)}</td></tr>
        <tr><td>PAYE Tax</td><td>- ${formatMWK(data.paye)}</td></tr>
        <tr><td>Pension (5%)</td><td>- ${formatMWK(data.pension)}</td></tr>
        ${data.loanDeduction > 0 ? `<tr><td>Loan Deduction</td><td>- ${formatMWK(data.loanDeduction)}</td></tr>` : ''}
        <tr><td class="net">Net Pay</td><td class="net">${formatMWK(data.netSalary)}</td></tr>
      </table>
    </div>
  </body></html>`
}