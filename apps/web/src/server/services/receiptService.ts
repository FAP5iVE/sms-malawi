/*
 * apps/web/src/server/services/receiptService.ts
 *
 * [CHANGE TYPE]: DESIGN REWRITE (same exports/signatures; PayslipData gains optional fields)
 * [PURPOSE]: Payment receipt + payslip redesigned on the shared document kit
 *   (pdfBranding.ts): the common navy letterhead, system typefaces and colour
 *   tokens, the circular authentication stamp, and a signatory block whose NAME
 *   and TITLE come from the staff directory.
 *
 *   RECEIPT  letterhead -> title -> Student / Payment detail cards -> AMOUNT PAID
 *     -> Payment Allocation table -> invoice summary -> received-by + PAID stamp.
 *     The allocation table follows the invoice's own ledger vocabulary (Fee /
 *     Fixed Amount / Allocated / Balance) and adds what a receipt uniquely
 *     knows: the balance on each fee BEFORE this payment and AFTER it. Those are
 *     computed from PaymentAllocation history (capped, in order, exactly as
 *     feeService caps them), so a receipt reprinted months later still shows
 *     the position at the time of payment, not today's. Money that cleared no
 *     fee is shown as "Advance credit". Colour carries the story: green = paid /
 *     cleared, amber = still owed, blue = credit.
 *
 *   PAYSLIP  letterhead -> title -> employee list (Employee Number, Job Title,
 *     Department — not the staff UID) -> Earnings / Deductions panels named as
 *     the Payroll UI names them -> Net Pay block -> finance officer + stamp.
 *     Earnings are itemised (Base Salary, Allowance (type)). processMonthlyPayroll
 *     passes the exact lines; for a payslip that pre-dates its PDF they are
 *     rebuilt from the allowances in force that month and always reconciled to
 *     the stored gross.
 *
 *   Nothing is typed in: names, titles, dates, balances, scale of every number
 *   come from the database/settings. generateReceipt()/generatePayslipPdf()
 *   still return the stored fileId.
 * [DEPENDS ON]: pdfBranding.ts (kit + signatory resolvers), storage, prisma
 *
 * ── HISTORY ──────────────────────────────────────────────────────────────────
 */
/*
 * (earlier notes)
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

import 'server-only'

import type { jsPDF } from 'jspdf'
import { uploadFile, FILE_PREFIX } from '@/lib/storage'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { PAYMENT_METHOD_LABELS } from '@shared/constants/malawi'
import {
  PDF_COLORS as C, amountInWords, createPdfDoc, drawCard, drawDocumentFooters, drawDocumentTitle, drawLetterhead,
  drawSignatory, drawStamp, ellipsize, fillColor, fitFontSize, fmtDate, getPdfBranding, money, put,
  resolveFinanceSignatory, sectionLabel, setFace, strokeColor, tint, tracked, PT,
  type PdfBranding, type PdfSignatory, type RGB,
} from '@/server/services/pdfBranding'

/** Retained for the existing feeService call site; the receipt now takes the
 *  school's identity from getPdfBranding() so it can never differ from the other documents. */
interface DocBranding { schoolName: string; schoolAddress: string; schoolPhone: string; schoolEmail?: string | null }

const PAGE_W = 210
const M_X = 15
const CW = PAGE_W - M_X * 2

/** Paper ink for money that is owed (amber), cleared (green) or credited (blue). */
const OWED: RGB = C.warning
const CLEARED: RGB = C.success
const CREDIT: RGB = C.info

/** A titled list of label (left, muted) / value (right, bold) rows. No box —
 *  just hairlines between the rows, so it sits on the page like the rest of the text. */
function drawFacts(doc: jsPDF, x: number, y: number, w: number, title: string, rows: Array<[string, string]>): number {
  const rowH = 6.4
  sectionLabel(doc, title, x, y + 3)
  const top0 = y + 6
  strokeColor(doc, C.border)
  doc.setLineWidth(0.15)
  rows.forEach(([label, value], i) => {
    const top = top0 + i * rowH
    doc.line(x, top, x + w, top)
    const ty = top + rowH / 2 + 1
    setFace(doc, 'body', 7.8, C.muted)
    put(doc, label, x, ty)
    setFace(doc, 'bodyBold', 8.4, C.ink)
    const room = w - doc.getTextWidth(label) - 4
    put(doc, ellipsize(doc, value || '—', room), x + w, ty, 'right')
  })
  const bottom = top0 + rows.length * rowH
  doc.line(x, bottom, x + w, bottom)
  return bottom
}

/** The signature + stamp row shared by both documents. Returns the y below it. */
function drawAuthRow(
  doc: jsPDF, y: number, b: PdfBranding,
  o: { heading: string; sig: PdfSignatory | null; fallbackTitle: string; stampLabel: string; stampDate: string; stampColor: RGB; meta?: { label: string; value: string } },
): number {
  sectionLabel(doc, o.heading, M_X, y)
  const sig: PdfSignatory = o.sig ?? { name: null, title: o.fallbackTitle, unit: null }
  const bottom = drawSignatory(doc, { x: M_X, y: y + 2, w: 72, sig, org: b.schoolName, space: 14 })
  drawStamp(doc, {
    cx: M_X + CW - 19, cy: y + 14, r: 15, schoolName: b.schoolName, place: b.place,
    label: o.stampLabel, date: o.stampDate, caption: 'Validated', color: o.stampColor,
  })
  if (o.meta) {
    setFace(doc, 'headingBold', 6.2, C.muted)
    tracked(doc, o.meta.label.toUpperCase(), M_X + 92, y + 14, 0.45)
    setFace(doc, 'bodyBold', 9, C.ink)
    put(doc, o.meta.value, M_X + 92, y + 19.2)
  }
  return Math.max(bottom, y + 30)
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT RECEIPT
// ─────────────────────────────────────────────────────────────────────────────

interface ReceiptLine {
  fee: string
  fixed: number
  /** What this fee still owed immediately BEFORE this payment. */
  before: number
  /** Amount of this payment allocated to the fee. */
  allocated: number
  /** What it still owes immediately AFTER this payment. */
  after: number
}

interface ReceiptContext {
  studentName: string
  registrationNo: string
  className: string | null
  invoiceNumber: string | null
  academicYear: string
  term: number
  amount: number
  methodLabel: string
  reference: string | null
  paidAt: Date
  /** null when allocation rows are unavailable (legacy payment) — the table is then omitted. */
  lines: ReceiptLine[] | null
  /** Money from this payment that cleared no fee (overpayment / unallocated). */
  credit: number
  /** Invoice position at the moment of this payment; null if the invoice cannot be read. */
  invoice: { fixedTotal: number; netDue: number; paidToDate: number; balanceDue: number } | null
  officer: PdfSignatory | null
}

const CENT = 0.005

/**
 * Everything the receipt prints beyond what the caller passed. Pure reads;
 * any failure degrades to the basic receipt (amount/method/date) rather than
 * failing — the same "never block the payment" stance as the call site.
 */
async function loadReceiptContext(
  paymentId: string,
  invoice: { id: string; studentId: string; academicYear: string; term: number },
  payment: { amount: number; method: string; reference?: string | null; recordedAt: Date },
  student: { firstName: string; lastName: string; registrationNo: string },
): Promise<ReceiptContext> {
  const base: ReceiptContext = {
    studentName: `${student.firstName} ${student.lastName}`.trim(),
    registrationNo: student.registrationNo,
    className: null,
    invoiceNumber: null,
    academicYear: invoice.academicYear,
    term: invoice.term,
    amount: payment.amount,
    methodLabel: (PAYMENT_METHOD_LABELS as Record<string, string>)[payment.method] ?? payment.method,
    reference: payment.reference ?? null,
    paidAt: payment.recordedAt,
    lines: null,
    credit: 0,
    invoice: null,
    officer: null,
  }
  try {
    const pay = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        recordedByUid: true,
        invoice: {
          select: {
            invoiceNumber: true,
            totalAmount: true,
            lineItems: { select: { id: true, feeName: true, amount: true }, orderBy: { createdAt: 'asc' } },
            student: { select: { class: { select: { name: true } } } },
          },
        },
      },
    })
    if (!pay) return base

    const history = await prisma.paymentAllocation.findMany({
      where: { lineItem: { invoiceId: invoice.id } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { paymentId: true, lineItemId: true, amount: true },
    })

    // Replay the invoice's allocations in order up to (and including) this payment.
    // Each allocation is capped at what the fee still owed — the same rule
    // feeService applies when it advances InvoiceLineItem.paidAmount.
    const fixed = new Map<string, number>(pay.invoice.lineItems.map((l): [string, number] => [l.id, Number(l.amount)]))
    const applied = new Map<string, number>()
    const mine = new Map<string, { before: number; allocated: number; after: number; applied: number }>()
    const last = history.map((h) => h.paymentId).lastIndexOf(paymentId)
    history.forEach((h, i) => {
      if (i > last) return
      const owed = Math.max(0, (fixed.get(h.lineItemId) ?? 0) - (applied.get(h.lineItemId) ?? 0))
      const alloc = Number(h.amount)
      const take = Math.min(alloc, owed)
      if (h.paymentId === paymentId) {
        const m = mine.get(h.lineItemId)
        if (m) { m.allocated += alloc; m.applied += take; m.after = owed - take }
        else mine.set(h.lineItemId, { before: owed, allocated: alloc, applied: take, after: owed - take })
      }
      applied.set(h.lineItemId, (applied.get(h.lineItemId) ?? 0) + take)
    })

    const lines: ReceiptLine[] = pay.invoice.lineItems
      .filter((l) => mine.has(l.id))
      .map((l) => {
        const m = mine.get(l.id)!
        return { fee: l.feeName, fixed: Number(l.amount), before: m.before, allocated: m.allocated, after: m.after }
      })
    const appliedNow = [...mine.values()].reduce((a, m) => a + m.applied, 0)
    const fixedTotal = [...fixed.values()].reduce((a, v) => a + v, 0)
    const paidToDate = [...applied.values()].reduce((a, v) => a + v, 0)
    const netDue = Number(pay.invoice.totalAmount)

    const officer = await resolveFinanceSignatory(pay.recordedByUid, { anyRole: true })

    return {
      ...base,
      className: pay.invoice.student.class?.name ?? null,
      invoiceNumber: pay.invoice.invoiceNumber,
      lines: lines.length ? lines : null,
      credit: lines.length ? Math.max(0, payment.amount - appliedNow) : 0,
      invoice: { fixedTotal, netDue, paidToDate, balanceDue: Math.max(0, netDue - paidToDate) },
      officer,
    }
  } catch (err) {
    logger.warn({ err, paymentId }, '[receipt] Could not load allocation detail — printing the basic receipt')
    return base
  }
}

// --- PAYMENT RECEIPT PDF ----------------------------------
export async function generateReceipt(
  paymentId: string,
  invoice: { id: string; studentId: string; academicYear: string; term: number },
  payment: { amount: number; method: string; reference?: string | null; recordedAt: Date },
  student: { firstName: string; lastName: string; registrationNo: string },
  branding: DocBranding,
  receiptPrefix: string,
): Promise<string> {
  void branding   // superseded by getPdfBranding(): one identity for every document
  const [b, ctx] = await Promise.all([
    getPdfBranding(),
    loadReceiptContext(paymentId, invoice, payment, student),
  ])
  const receiptNo = `${receiptPrefix}-${paymentId.slice(0, 8).toUpperCase()}`
  const pdfBuffer = buildReceiptPdf(b, ctx, receiptNo)
  const filename = `receipt_${paymentId}.pdf`
  const uploaded = await uploadFile(FILE_PREFIX.RECEIPT, pdfBuffer, filename, 'application/pdf')
  return uploaded.fileId
}

export function buildReceiptPdf(b: PdfBranding, d: ReceiptContext, receiptNo: string): Buffer {
  const doc = createPdfDoc()
  const tz = b.timezone

  let y = drawLetterhead(doc, b, { x: M_X, y: 14, w: CW })
  y = drawDocumentTitle(doc, PAGE_W / 2, y + 7, 'Payment Receipt', `Academic Year ${d.academicYear} · Term ${d.term}`) + 3

  // 1 — who and what: two compact fact lists (label left, value right). A list,
  // not a grid: every fact is a label/value pair, there is nothing to compare across.
  const cw = (CW - 8) / 2
  const yTop = y
  const h1 = drawFacts(doc, M_X, yTop, cw, 'Student', [
    ['Name', d.studentName],
    ['Reg. no.', d.registrationNo],
    ['Class', d.className ?? '—'],
    ['Invoice no.', d.invoiceNumber ?? '—'],
  ])
  drawFacts(doc, M_X + cw + 8, yTop, cw, 'Payment', [
    ['Receipt no.', receiptNo],
    ['Date', fmtDate(d.paidAt, 'long', tz)],
    ['Payment method', d.methodLabel],
    ['Payment reference', d.reference ?? '—'],
  ])
  y = h1 + 7

  // 2 — the amount, immediately after the details
  // written straight onto the page: no box, no status chip (the invoice position is shown below)
  sectionLabel(doc, 'Amount Paid', M_X, y + 3, CLEARED)
  setFace(doc, 'headingBold', 27, CLEARED)
  put(doc, money(d.amount), M_X, y + 14.6)
  setFace(doc, 'body', 7.4, C.muted)
  put(doc, ellipsize(doc, amountInWords(d.amount), CW), M_X, y + 20)
  y += 27

  // 3 — Payment Allocation (aligned with the invoice's Fee Line Items ledger)
  const SIGN_H = 38
  const SUMMARY_H = 15
  const footerY = 282
  if (d.lines) {
    sectionLabel(doc, 'Payment Allocation', M_X, y)
    y += 2.2
    const cols: Array<{ label: string; w: number; align: 'left' | 'right' }> = [
      { label: 'Fee', w: 44, align: 'left' },
      { label: 'Fixed amount', w: 28, align: 'right' },
      { label: 'Balance before', w: 28, align: 'right' },
      { label: 'Allocated', w: 28, align: 'right' },
      { label: 'Balance after', w: 28, align: 'right' },
      { label: 'Status', w: CW - 156, align: 'left' },
    ]
    const rows = d.lines.length + (d.credit > CENT ? 1 : 0)
    const HEAD = 7
    const TOTAL = 8
    const room = footerY - SIGN_H - SUMMARY_H - 14 - (y + HEAD + TOTAL)
    const rowH = Math.max(5, Math.min(7.4, room / Math.max(1, rows)))
    const fs = rowH >= 6.4 ? 8.2 : 7.4
    const top = y
    fillColor(doc, C.navy)
    doc.roundedRect(M_X, y, CW, HEAD + 2, 1.8, 1.8, 'F')
    doc.rect(M_X, y + HEAD - 0.2, CW, 0.4, 'F')
    setFace(doc, 'headingBold', 7, C.white)
    let cx = M_X
    for (const c of cols) {
      const ty = y + HEAD / 2 + 1
      if (c.align === 'left') put(doc, c.label, cx + 3, ty)
      else put(doc, c.label, cx + c.w - 3, ty, 'right')
      cx += c.w
    }
    y += HEAD

    const cell = (k: number) => cols.slice(0, k).reduce((a, c) => a + c.w, 0)
    const num = (v: string, k: number, ty: number) => put(doc, v, M_X + cell(k) + (cols[k]?.w ?? 0) - 3, ty, 'right')
    let totalFixed = 0, totalBefore = 0, totalAlloc = 0, totalAfter = 0
    d.lines.forEach((l, i) => {
      fillColor(doc, i % 2 === 1 ? tint(C.secondary, 0.5) : C.white)
      doc.rect(M_X, y, CW, rowH, 'F')
      const ty = y + rowH / 2 + fs * PT * 0.34
      setFace(doc, 'bodyBold', fs, C.ink)
      put(doc, ellipsize(doc, l.fee, (cols[0]?.w ?? 44) - 5), M_X + 3, ty)
      setFace(doc, 'body', fs, C.neutral)
      num(money(l.fixed), 1, ty)
      setFace(doc, l.before > CENT ? 'bodyBold' : 'body', fs, l.before > CENT ? C.ink : C.muted)
      num(l.before > CENT ? money(l.before) : '—', 2, ty)
      setFace(doc, 'bodyBold', fs, CLEARED)
      num(money(l.allocated), 3, ty)
      const cleared = l.after < CENT
      setFace(doc, 'bodyBold', fs, cleared ? CLEARED : OWED)
      num(money(l.after), 4, ty)
      setFace(doc, 'headingBold', fs - 0.6, cleared ? CLEARED : OWED)
      put(doc, cleared ? 'Cleared' : 'Balance due', M_X + cell(5) + 3, ty)
      strokeColor(doc, C.border)
      doc.setLineWidth(0.12)
      doc.line(M_X, y + rowH, M_X + CW, y + rowH)
      totalFixed += l.fixed; totalBefore += l.before; totalAlloc += l.allocated; totalAfter += l.after
      y += rowH
    })
    if (d.credit > CENT) {
      fillColor(doc, d.lines.length % 2 === 1 ? tint(C.secondary, 0.5) : C.white)
      doc.rect(M_X, y, CW, rowH, 'F')
      const ty = y + rowH / 2 + fs * PT * 0.34
      setFace(doc, 'bodyBold', fs, CREDIT)
      put(doc, 'Advance credit', M_X + 3, ty)
      setFace(doc, 'body', fs, C.muted)
      num('—', 1, ty); num('—', 2, ty)
      setFace(doc, 'bodyBold', fs, CREDIT)
      num(money(d.credit), 3, ty)
      num(`+ ${money(d.credit)}`, 4, ty)
      setFace(doc, 'headingBold', fs - 0.6, CREDIT)
      put(doc, 'Credit', M_X + cell(5) + 3, ty)
      totalAlloc += d.credit
      y += rowH
    }
    // total row
    fillColor(doc, tint(C.navy, 0.9))
    doc.rect(M_X, y, CW, TOTAL, 'F')
    strokeColor(doc, C.navy)
    doc.setLineWidth(0.35)
    doc.line(M_X, y, M_X + CW, y)
    const ty = y + TOTAL / 2 + 1.2
    setFace(doc, 'headingBold', 8, C.navy)
    tracked(doc, 'TOTAL', M_X + 3, ty, 0.4)
    setFace(doc, 'bodyBold', 8.2, C.ink)
    num(money(totalFixed), 1, ty)
    num(totalBefore > CENT ? money(totalBefore) : '—', 2, ty)
    setFace(doc, 'bodyBold', 8.6, CLEARED)
    num(money(totalAlloc), 3, ty)
    setFace(doc, 'bodyBold', 8.6, totalAfter < CENT ? CLEARED : OWED)
    num(money(totalAfter), 4, ty)
    y += TOTAL
    strokeColor(doc, C.rule)
    doc.setLineWidth(0.3)
    doc.roundedRect(M_X, top, CW, y - top, 1.8, 1.8, 'S')
    y += 5
  }

  // 4 — the invoice position this payment left behind (invoice-ledger wording)
  if (d.invoice) {
    // no outer border — only the dividers between the four figures
    const stats: Array<[string, string, RGB]> = [
      ['Total fixed fees', money(d.invoice.fixedTotal), C.ink],
      ['Net total fees due', money(d.invoice.netDue), C.ink],
      ['Total paid to date', money(d.invoice.paidToDate), CLEARED],
      ['Balance due', money(d.invoice.balanceDue), d.invoice.balanceDue < CENT ? CLEARED : OWED],
    ]
    const sw = CW / stats.length
    stats.forEach(([label, value, color], i) => {
      const x = M_X + i * sw + sw / 2
      if (i > 0) {
        strokeColor(doc, C.border)
        doc.setLineWidth(0.15)
        doc.line(M_X + i * sw, y + 1.5, M_X + i * sw, y + SUMMARY_H - 1.5)
      }
      setFace(doc, 'body', 6.8, C.muted)
      put(doc, label, x, y + 5.6, 'center')
      setFace(doc, 'headingBold', 9.4, color)
      put(doc, value, x, y + 11.2, 'center')
    })
    y += SUMMARY_H + 7
  }

  // 5 — who received it, and the seal
  drawAuthRow(doc, Math.min(y, footerY - SIGN_H), b, {
    heading: 'Received by',
    sig: d.officer,
    fallbackTitle: 'Authorised accounts officer',
    stampLabel: 'Paid',
    stampDate: fmtDate(d.paidAt, 'short', tz),
    stampColor: C.teal,
  })

  drawDocumentFooters(doc, { x: M_X, w: CW, y: footerY, note: `Generated on ${fmtDate(new Date(), 'long', tz)}. This is a computer-generated document.`, reference: receiptNo })
  return Buffer.from(doc.output('arraybuffer'))
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYSLIP
// ─────────────────────────────────────────────────────────────────────────────

/** Exact earnings, known at payroll-run time: the base salary and each itemised allowance. */
export interface PayslipEarnings {
  baseSalary: number
  allowances: Array<{ type: string; amount: number }>
}

interface EarningLine { label: string; amount: number; allowance: boolean }

/**
 * Earnings rows named as the Payroll UI names them ("Base Salary",
 * "Allowance (Housing)"). The lines ALWAYS add up to the stored gross: if the
 * itemisation cannot be reconciled (e.g. allowances edited after the run) the
 * payslip shows a single Base Salary line equal to gross rather than a
 * breakdown that does not sum.
 */
function earningLines(earnings: PayslipEarnings | null, gross: number): EarningLine[] {
  if (earnings) {
    const lines: EarningLine[] = [
      { label: 'Base salary', amount: earnings.baseSalary, allowance: false },
      ...earnings.allowances.map((a) => ({ label: `Allowance (${a.type})`, amount: a.amount, allowance: true })),
    ]
    const sum = lines.reduce((s, l) => s + l.amount, 0)
    if (Math.abs(sum - gross) < 0.01) return lines
  }
  return [{ label: 'Base salary', amount: gross, allowance: false }]
}

/**
 * Rebuilds the earnings of a payslip that pre-dates its PDF: base = stored
 * gross minus the allowances that applied that month (recurring ones that
 * already existed, plus one-time ones for exactly that month). Falls back to
 * null (-> single gross line) whenever the numbers do not reconcile.
 */
async function reconstructEarnings(staffUid: string, month: number, year: number, gross: number): Promise<PayslipEarnings | null> {
  try {
    const endOfPeriod = new Date(Date.UTC(year, month, 1))
    const rows = await prisma.staffAllowance.findMany({
      where: {
        staffUid,
        createdAt: { lt: endOfPeriod },
        OR: [{ recurring: true }, { recurring: false, paidMonth: month, paidYear: year }],
      },
      select: { type: true, amount: true },
      orderBy: { createdAt: 'asc' },
    })
    const allowances = rows.map((r) => ({ type: r.type, amount: Number(r.amount) }))
    const total = allowances.reduce((s, a) => s + a.amount, 0)
    if (allowances.length === 0 || total > gross) return null
    return { baseSalary: gross - total, allowances }
  } catch {
    return null
  }
}

export interface PayslipData {
  staffUid: string
  staffName: string
  grossSalary: number
  paye: number
  pension: number
  pensionPercent: number
  loanDeduction: number
  netSalary: number
  /** Exact lines from the payroll run; omitted -> rebuilt from allowances. */
  earnings?: PayslipEarnings | undefined
  /** The user who ran payroll — the signing finance officer when they are finance staff. */
  runByUid?: string | undefined
  /** When the run was processed (printed + on the stamp). */
  processedAt?: Date | undefined
}

// --- PAYSLIP PDF ------------------------------------------
// Signature: 4 args — payslipId, data, month, year
// This matches the call in payrollService: generatePayslipPdf(payslip.id, ps, month, year)
export async function generatePayslipPdf(
  payslipId: string,
  data: PayslipData,
  month: number,
  year: number,
): Promise<string> {
  void payslipId
  const [b, staff, officer] = await Promise.all([
    getPdfBranding(),
    prisma.staffProfile.findFirst({
      where: { uid: data.staffUid },
      select: { employeeNo: true, jobTitle: true, department: true, departmentRef: { select: { name: true } } },
    }),
    resolveFinanceSignatory(data.runByUid),
  ])
  const earnings = data.earnings ?? (await reconstructEarnings(data.staffUid, month, year, data.grossSalary))
  const pdfBuffer = buildPayslipPdf(b, {
    ...data,
    period: new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1))),
    processedAt: data.processedAt ?? new Date(),
    employeeNo: staff?.employeeNo ?? '—',
    jobTitle: staff?.jobTitle ?? '—',
    department: staff?.departmentRef?.name ?? staff?.department ?? '—',
    lines: earningLines(earnings, data.grossSalary),
    officer,
  })
  const filename = `payslip_${data.staffUid}_${year}-${String(month).padStart(2, '0')}.pdf`
  const uploaded = await uploadFile(FILE_PREFIX.PAYSLIP, pdfBuffer, filename, 'application/pdf')
  return uploaded.fileId
}

export function buildPayslipPdf(
  b: PdfBranding,
  d: PayslipData & {
    period: string; processedAt: Date; employeeNo: string; jobTitle: string; department: string
    lines: EarningLine[]; officer: PdfSignatory | null
  },
): Buffer {
  const doc = createPdfDoc()
  const tz = b.timezone

  let y = drawLetterhead(doc, b, { x: M_X, y: 14, w: CW })
  y = drawDocumentTitle(doc, PAGE_W / 2, y + 7, 'Payslip', d.period) + 3

  // 1 — employee: a labelled list, no box
  const facts: Array<[string, string]> = [
    ['Employee name', d.staffName],
    ['Employee number', d.employeeNo],
    ['Job title', d.jobTitle],
    ['Department', d.department],
  ]
  const rowH = 6.6
  strokeColor(doc, C.border)
  doc.setLineWidth(0.15)
  facts.forEach(([label, value], i) => {
    const top = y + i * rowH
    doc.line(M_X, top, M_X + CW, top)
    const ty = top + rowH / 2 + 1
    setFace(doc, 'body', 7.8, C.muted)
    put(doc, label, M_X, ty)
    setFace(doc, i === 0 ? 'headingBold' : 'bodyBold', i === 0 ? 9.6 : 8.8, C.ink)
    put(doc, ellipsize(doc, value, CW - 50), M_X + 47, ty)
  })
  doc.line(M_X, y + facts.length * rowH, M_X + CW, y + facts.length * rowH)
  y += facts.length * rowH + 7

  // 2 — ONE table: earnings, then deductions, each closed by its own total
  const deductions: Array<[string, number]> = [
    ['PAYE Tax Withheld', d.paye],
    [`Pension (${d.pensionPercent}%)`, d.pension],
  ]
  if (d.loanDeduction > 0) deductions.push(['Loan repayment', d.loanDeduction])
  const totalDeductions = d.paye + d.pension + d.loanDeduction

  const HEAD = 8
  const SECTION = 6
  const ROW = 7.2
  const TOT = 8.6
  const tableH = HEAD + (SECTION + d.lines.length * ROW + TOT) + (SECTION + deductions.length * ROW + TOT)
  const top = y

  fillColor(doc, C.navy)
  doc.roundedRect(M_X, y, CW, HEAD + 2, 1.8, 1.8, 'F')
  doc.rect(M_X, y + HEAD - 0.2, CW, 0.4, 'F')
  setFace(doc, 'headingBold', 7.4, C.white)
  tracked(doc, 'EARNINGS & DEDUCTIONS', M_X + 5, y + HEAD / 2 + 1.1, 0.5)
  put(doc, 'Amount', M_X + CW - 5, y + HEAD / 2 + 1.1, 'right')
  y += HEAD

  const section = (title: string, accent: RGB) => {
    fillColor(doc, tint(accent, 0.92))
    doc.rect(M_X, y, CW, SECTION, 'F')
    setFace(doc, 'headingBold', 6.6, accent)
    tracked(doc, title.toUpperCase(), M_X + 5, y + SECTION / 2 + 0.9, 0.5)
    y += SECTION
  }
  const line = (label: string, amount: number, sign: '' | '+' | '−', color: RGB, first: boolean) => {
    if (!first) {
      strokeColor(doc, C.border)
      doc.setLineWidth(0.12)
      doc.line(M_X + 5, y, M_X + CW - 5, y)
    }
    const ty = y + ROW / 2 + 1.1
    setFace(doc, 'body', 8.6, C.ink)
    put(doc, ellipsize(doc, label, CW - 70), M_X + 5, ty)
    setFace(doc, 'bodyBold', 8.8, color)
    put(doc, `${sign ? `${sign} ` : ''}${money(amount)}`, M_X + CW - 5, ty, 'right')
    y += ROW
  }
  const total = (label: string, amount: number, accent: RGB) => {
    fillColor(doc, tint(accent, 0.9))
    doc.rect(M_X, y, CW, TOT, 'F')
    strokeColor(doc, accent)
    doc.setLineWidth(0.35)
    doc.line(M_X, y, M_X + CW, y)
    setFace(doc, 'headingBold', 8.2, accent)
    put(doc, label, M_X + 5, y + TOT / 2 + 1.2)
    put(doc, money(amount), M_X + CW - 5, y + TOT / 2 + 1.2, 'right')
    y += TOT
  }

  section('Earnings', CLEARED)
  d.lines.forEach((l, i) => line(l.label, l.amount, l.allowance ? '+' : '', l.allowance ? CLEARED : C.ink, i === 0))
  total('Total gross monthly', d.grossSalary, CLEARED)
  section('Deductions', C.danger)
  deductions.forEach(([label, amount], i) => line(label, amount, '−', C.danger, i === 0))
  total('Total deductions', totalDeductions, C.danger)

  strokeColor(doc, C.rule)
  doc.setLineWidth(0.3)
  doc.roundedRect(M_X, top, CW, tableH, 1.8, 1.8, 'S')
  y += 7

  // 3 — Net Pay: the one figure the page exists to state (period is already under the title)
  const netH = 29
  fillColor(doc, C.navyDeep)
  doc.roundedRect(M_X, y, CW, netH, 3, 3, 'F')
  setFace(doc, 'headingBold', 7, tint(C.teal, 0.55))
  tracked(doc, 'NET PAY', M_X + 7, y + 8, 0.7)
  const amountText = money(d.netSalary)
  setFace(doc, 'headingBold', 26, C.white)
  const netSize = fitFontSize(doc, amountText, CW - 20, 26, 16)
  setFace(doc, 'headingBold', netSize, C.white)
  put(doc, amountText, M_X + 7, y + 18.8)
  setFace(doc, 'body', 7.2, C.onNavy)
  const words = (doc.splitTextToSize(amountInWords(d.netSalary), CW - 20) as string[]).slice(0, 2)
  words.forEach((w, i) => put(doc, w, M_X + 7, y + 24.2 + i * 3.4))
  y += netH + 10

  // 4 — authorised by the finance officer; processed date; seal
  drawAuthRow(doc, y, b, {
    heading: 'Authorised by',
    sig: d.officer,
    fallbackTitle: 'Authorised finance officer',
    stampLabel: 'Issued',
    stampDate: fmtDate(d.processedAt, 'short', tz),
    stampColor: C.navy,
    meta: { label: 'Processed on', value: fmtDate(d.processedAt, 'long', tz) },
  })

  drawDocumentFooters(doc, { x: M_X, w: CW, y: 282, note: `Generated on ${fmtDate(new Date(), 'long', tz)}. This is a computer-generated document.`, reference: `${d.employeeNo} · ${d.period}` })
  return Buffer.from(doc.output('arraybuffer'))
}

