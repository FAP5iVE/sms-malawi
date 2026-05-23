"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReceipt = generateReceipt;
exports.generatePayslipPdf = generatePayslipPdf;
const puppeteer_1 = __importDefault(require("puppeteer"));
const storage_1 = require("../lib/storage");
const malawi_1 = require("../../../../packages/shared/constants/malawi");
// --- PAYMENT RECEIPT PDF ----------------------------------
async function generateReceipt(paymentId, invoice, amount, actorUid) {
    const html = buildReceiptHtml({
        paymentId,
        studentId: invoice.studentId,
        academicYear: invoice.academicYear,
        term: invoice.term,
        amount,
        date: new Date().toLocaleDateString('en-MW'),
        receivedBy: actorUid,
    });
    const pdf = await htmlToPdf(html);
    const filename = `receipts_${invoice.studentId}_${paymentId}.pdf`;
    const fileId = await (0, storage_1.uploadFile)(storage_1.STORAGE_BUCKETS.PAYSLIPS, pdf, filename, 'application/pdf');
    return fileId;
}
// --- PAYSLIP PDF -----------------------------------------
async function generatePayslipPdf(payslipId, data, month, year) {
    const monthName = new Date(year, month - 1).toLocaleString('en-MW', { month: 'long' });
    const html = buildPayslipHtml({ ...data, monthName, year });
    const pdf = await htmlToPdf(html);
    const filename = `payslips_${data.staffUid}_${year}-${String(month).padStart(2, '0')}.pdf`;
    const fileId = await (0, storage_1.uploadFile)(storage_1.STORAGE_BUCKETS.PAYSLIPS, pdf, filename, 'application/pdf');
    return fileId;
}
// --- HTML → PDF VIA PUPPETEER ----------------------------
async function htmlToPdf(html) {
    const browser = await puppeteer_1.default.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
        });
        return Buffer.from(pdf);
    }
    finally {
        await browser.close();
    }
}
// --- HTML TEMPLATES --------------------------------------
function buildReceiptHtml(data) {
    return `
  <!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #1A2535; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #0F2744; padding-bottom: 15px; margin-bottom: 20px; }
    .school { font-size: 22px; font-weight: bold; color: #0F2744; }
    .receipt-title { font-size: 16px; color: #0D7A5F; margin-top: 5px; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .label { color: #5C6B82; font-size: 13px; }
    .value { font-weight: 600; font-size: 13px; }
    .amount-row { background: #F0FDF4; padding: 12px; border-radius: 6px; margin: 15px 0; }
    .amount-label { font-size: 12px; color: #5C6B82; }
    .amount-value { font-size: 24px; font-weight: 700; color: #065F46; }
    .footer { margin-top: 30px; font-size: 11px; color: #5C6B82; text-align: center; }
  </style></head><body>
  <div class="header">
    <div class="school">School Management System</div>
    <div class="receipt-title">OFFICIAL FEE PAYMENT RECEIPT</div>
  </div>
  <div class="row"><span class="label">Receipt No.</span><span class="value">${data.paymentId.slice(-8).toUpperCase()}</span></div>
  <div class="row"><span class="label">Student ID</span><span class="value">${data.studentId}</span></div>
  <div class="row"><span class="label">Academic Year</span><span class="value">${data.academicYear}</span></div>
  <div class="row"><span class="label">Term</span><span class="value">Term ${data.term}</span></div>
  <div class="row"><span class="label">Date</span><span class="value">${data.date}</span></div>
  <div class="amount-row">
    <div class="amount-label">Amount Paid</div>
    <div class="amount-value">${(0, malawi_1.formatMWK)(data.amount)}</div>
  </div>
  <div class="footer">
    Received by: ${data.receivedBy} &middot; This is an official computer-generated receipt.
  </div>
  </body></html>`;
}
function buildPayslipHtml(data) {
    return `
  <!DOCTYPE html><html><head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; color: #1A2535; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #0F2744; padding-bottom: 15px; }
    .school { font-size: 20px; font-weight: bold; color: #0F2744; }
    .period { font-size: 14px; color: #5C6B82; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: #0F2744; color: white; padding: 8px 12px; text-align: left; font-size: 12px; }
    td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
    .net { background: #F0FDF4; font-weight: bold; }
    .net td { color: #065F46; font-size: 15px; }
  </style></head><body>
  <div class="header">
    <div class="school">PAYSLIP</div>
    <div class="period">${data.monthName} ${data.year}</div>
  </div>
  <p style="margin-top:15px"><strong>Employee:</strong> ${data.staffName}</p>
  <table>
    <tr><th>Description</th><th>Amount (MWK)</th></tr>
    <tr><td>Basic Salary</td><td>${(0, malawi_1.formatMWK)(data.grossSalary)}</td></tr>
    <tr><td>PAYE Tax (deduction)</td><td>- ${(0, malawi_1.formatMWK)(data.paye)}</td></tr>
    <tr><td>Pension (5%)</td><td>- ${(0, malawi_1.formatMWK)(data.pension)}</td></tr>
    <tr><td>Loan Deduction</td><td>- ${(0, malawi_1.formatMWK)(data.loanDeduction)}</td></tr>
    <tr class="net"><td>NET PAY</td><td>${(0, malawi_1.formatMWK)(data.netSalary)}</td></tr>
  </table>
  </body></html>`;
}
//# sourceMappingURL=receiptService.js.map