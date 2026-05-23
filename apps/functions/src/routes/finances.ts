import { Router } from 'express'
import { getFirestore } from 'firebase-admin/firestore'
import { verifyAuth, requireRole } from '../middleware/auth'
import {
  RecordPaymentSchema,
  GenerateInvoiceSchema,
  CreateFeeStructureSchema,
  CreateExpenseSchema,
  CreateScholarshipSchema,
} from '@shared/schemas/finance'
import * as feeService from '../services/feeService'
import * as budgetService from '../services/budgetService'
import * as installmentService from '../services/installmentService'
import * as reportService from '../services/reportExportService'
import { getViewUrl, getDownloadUrl } from '../lib/storage'
import { prisma } from '../lib/prisma'

export const financesRouter = Router()

const FINANCE_ROLES = ['admin', 'high_rank', 'finance'] as const

// ── SUMMARY ──────────────────────────────────────────────
financesRouter.get('/summary', verifyAuth, requireRole([...FINANCE_ROLES]), async (req, res) => {
  const { academicYear = '2025/2026', term = '1' } = req.query
  const summary = await feeService.getFinanceSummary(academicYear as string, Number(term))
  res.json(summary)
})

// ── FEE STRUCTURES ───────────────────────────────────────
financesRouter.get(
  '/fee-structures',
  verifyAuth,
  requireRole([...FINANCE_ROLES, 'high_rank']),
  async (req, res) => {
    const { academicYear = '2025/2026' } = req.query
    const fees = await prisma.feeStructure.findMany({
      where: { academicYear: academicYear as string, isActive: true },
      orderBy: { name: 'asc' },
    })
    res.json(fees)
  }
)

financesRouter.post(
  '/fee-structures',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const parsed = CreateFeeStructureSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const fee = await prisma.feeStructure.create({ data: parsed.data as any })
    res.status(201).json(fee)
  }
)

// ── INVOICES ─────────────────────────────────────────────
financesRouter.get('/invoices', verifyAuth, requireRole([...FINANCE_ROLES]), async (req, res) => {
  const { studentId, academicYear, term, status } = req.query
  const where: Record<string, unknown> = {}
  if (studentId) where.studentId = studentId
  if (academicYear) where.academicYear = academicYear
  if (term) where.term = Number(term)
  if (status) where.status = status
  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  res.json(invoices)
})

financesRouter.post(
  '/invoices/generate',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const parsed = GenerateInvoiceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const invoice = await feeService.generateInvoice(parsed.data, req.user!.uid, req.user!.role)
    res.status(201).json(invoice)
  }
)

// ── STUDENT BALANCE (for students to view own fees) ───────
financesRouter.get(
  '/balance/:studentId',
  verifyAuth,
  requireRole(['admin', 'finance', 'high_rank', 'student']),
  async (req, res) => {
    const id = String(req.params.studentId)
    // Students can only view their own balance
    if (req.user!.role === 'student' && req.user!.uid !== id) {
      return res.status(403).json({ error: 'Access denied' })
    }
    const { academicYear = '2025/2026' } = req.query
    const result = await feeService.getStudentBalance(id, academicYear as string)
    res.json(result)
  }
)

// ── RECORD PAYMENT ───────────────────────────────────────
financesRouter.post(
  '/payments',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const parsed = RecordPaymentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const result = await feeService.recordPayment(parsed.data, req.user!.uid, req.user!.role)
    res.status(201).json(result)
  }
)

// ── RECEIPT DOWNLOAD (signed URL) ────────────────────────
financesRouter.get(
  '/payments/:id/receipt',
  verifyAuth,
  requireRole(['admin', 'finance', 'student']),
  async (req, res) => {
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: String(req.params.id) },
    })
    if (!payment.receiptKey) return res.status(404).json({ error: 'Receipt not yet generated' })
    const url = await getViewUrl('sms-payslips', payment.receiptKey)
    res.json({ url })
  }
)

// ── EXPENSES ─────────────────────────────────────────────
financesRouter.get('/expenses', verifyAuth, requireRole([...FINANCE_ROLES]), async (req, res) => {
  const { academicYear = '2025/2026', term } = req.query
  const expenses = await prisma.expense.findMany({
    where: { academicYear: academicYear as string, ...(term ? { term: Number(term) } : {}) },
    orderBy: { incurredAt: 'desc' },
  })
  res.json(expenses)
})

financesRouter.post(
  '/expenses',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const parsed = CreateExpenseSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const expense = await prisma.expense.create({
      data: {
        ...parsed.data,
        recordedByUid: req.user!.uid,
        incurredAt: new Date(parsed.data.incurredAt),
      },
    })
    res.status(201).json(expense)
  }
)

financesRouter.patch(
  '/expenses/:id/approve',
  verifyAuth,
  requireRole(['admin', 'high_rank']),
  async (req, res) => {
    const expense = await prisma.expense.update({
      where: { id: String(req.params.id) },
      data: { status: 'APPROVED', approvedByUid: req.user!.uid, approvedAt: new Date() },
    })
    // Update budget spent amount
    await budgetService.updateBudgetSpent(
      expense.category,
      expense.academicYear,
      Number(expense.amount)
    )
    res.json(expense)
  }
)

// ── SCHOLARSHIPS ─────────────────────────────────────────
financesRouter.get(
  '/scholarships',
  verifyAuth,
  requireRole([...FINANCE_ROLES]),
  async (_req, res) => {
    res.json(await prisma.scholarship.findMany({ orderBy: { createdAt: 'desc' } }))
  }
)

financesRouter.post(
  '/scholarships',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const parsed = CreateScholarshipSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const s = await prisma.scholarship.create({ data: parsed.data as any })
    res.status(201).json(s)
  }
)

// ── BUDGET ───────────────────────────────────────────────
financesRouter.get(
  '/budget',
  verifyAuth,
  requireRole([...FINANCE_ROLES, 'high_rank']),
  async (req, res) => {
    const { academicYear = '2025/2026', term } = req.query
    const data = await budgetService.getBudgetVsActual(
      academicYear as string,
      term ? Number(term) : undefined
    )
    res.json(data)
  }
)

// POST /finances/invoices/:id/installments — create plan
financesRouter.post(
  '/invoices/:id/installments',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const { frequency, count, startDate } = req.body as {
      frequency: 'MONTHLY' | 'TERM_WISE'
      count: number
      startDate: string
    }
    if (!frequency || !count || !startDate) {
      return res.status(400).json({ error: 'frequency, count, and startDate are required' })
    }
    const planId = await installmentService.createInstallmentPlan(
      String(req.params.id),
      frequency,
      Number(count),
      new Date(startDate),
      req.user!.uid
    )
    res.status(201).json({ planId })
  }
)

// GET /finances/invoices/:id/installments — get plan
financesRouter.get(
  '/invoices/:id/installments',
  verifyAuth,
  requireRole(['admin', 'finance', 'student']),
  async (req, res) => {
    const plan = await installmentService.getInstallmentPlan(String(req.params.id))
    if (!plan) return res.status(404).json({ error: 'No installment plan for this invoice' })
    res.json(plan)
  }
)

// GET /finances/invoices/:id/notes
financesRouter.get(
  '/invoices/:id/notes',
  verifyAuth,
  requireRole(['admin', 'finance', 'high_rank']),
  async (req, res) => {
    const notes = await prisma.invoiceNote.findMany({
      where: { invoiceId: String(req.params.id) },
      orderBy: { createdAt: 'desc' },
    })
    res.json(notes)
  }
)

// POST /finances/invoices/:id/notes — add a sticky note
financesRouter.post(
  '/invoices/:id/notes',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const { body } = req.body as { body: string }
    if (!body?.trim()) return res.status(400).json({ error: 'Note body is required' })
    const note = await prisma.invoiceNote.create({
      data: {
        invoiceId: String(req.params.id),
        body: body.trim(),
        authorUid: req.user!.uid,
      },
    })
    res.status(201).json(note)
  }
)

// ── LIBRARY FINES BRIDGE ──────────────────────────────────

// GET /finances/library-fines — list all pending fines
financesRouter.get(
  '/library-fines',
  verifyAuth,
  requireRole(['admin', 'finance', 'library']),
  async (req, res) => {
    const { status = 'PENDING' } = req.query
    const fines = await prisma.libraryFine.findMany({
      where: { status: status as any },
      orderBy: { createdAt: 'desc' },
    })
    res.json(fines)
  }
)

// POST /finances/library-fines — librarian creates a fine
financesRouter.post(
  '/library-fines',
  verifyAuth,
  requireRole(['admin', 'library']),
  async (req, res) => {
    const { studentId, bookTitle, amount, reason, firestoreDocId } = req.body as {
      studentId: string
      bookTitle: string
      amount: number
      reason: string
      firestoreDocId: string
    }
    const fine = await prisma.libraryFine.create({
      data: { studentId, bookTitle, amount, reason, firestoreDocId, markedByUid: req.user!.uid },
    })
    res.status(201).json(fine)
  }
)

// PATCH /finances/library-fines/:id/pay — finance marks fine as paid
financesRouter.patch(
  '/library-fines/:id/pay',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const fine = await prisma.libraryFine.update({
      where: { id: String(req.params.id) },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        clearedByUid: req.user!.uid,
      },
    })

    // Sync cleared status back to Firestore library record
    const db = getFirestore()
    await db.collection('library_fines').doc(fine.firestoreDocId).update({
      finePaid: true,
      fineClearedAt: new Date().toISOString(),
    })

    res.json(fine)
  }
)

// PATCH /finances/library-fines/:id/waive — admin can waive a fine
financesRouter.patch(
  '/library-fines/:id/waive',
  verifyAuth,
  requireRole(['admin', 'high_rank']),
  async (req, res) => {
    const fine = await prisma.libraryFine.update({
      where: { id: String(req.params.id) },
      data: { status: 'WAIVED', clearedByUid: req.user!.uid },
    })
    const db = getFirestore()
    await db.collection('library_fines').doc(fine.firestoreDocId).update({
      fineWaived: true,
    })
    res.json(fine)
  }
)

// ── ADD import at top of finances.ts ──────────────────────
import { generateFinancialReport } from '../services/reportExportService'

// ── ADD route ─────────────────────────────────────────────

// POST /finances/reports/export
// Body: { type: "fee_collection"|"outstanding_balances"|"expense_breakdown"|"payroll_summary", academicYear, term }
financesRouter.post(
  '/reports/export',
  verifyAuth,
  requireRole(['admin', 'finance', 'high_rank']),
  async (req, res) => {
    const {
      type,
      academicYear = '2025/2026',
      term = 1,
    } = req.body as {
      type: string
      academicYear: string
      term: number
    }
    const validTypes = [
      'fee_collection',
      'outstanding_balances',
      'expense_breakdown',
      'payroll_summary',
    ]
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` })
    }
    const downloadUrl = await generateFinancialReport(type as any, academicYear, Number(term))
    res.json({ downloadUrl })
  }
)

// ── ADD route ─────────────────────────────────────────────

// POST /finances/reports/export
// Body: { type: "fee_collection"|"outstanding_balances"|"expense_breakdown"|"payroll_summary", academicYear, term }
financesRouter.post(
  '/reports/export',
  verifyAuth,
  requireRole(['admin', 'finance', 'high_rank']),
  async (req, res) => {
    const {
      type,
      academicYear = '2025/2026',
      term = 1,
    } = req.body as {
      type: string
      academicYear: string
      term: number
    }
    const validTypes = [
      'fee_collection',
      'outstanding_balances',
      'expense_breakdown',
      'payroll_summary',
    ]
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` })
    }
    const downloadUrl = await generateFinancialReport(type as any, academicYear, Number(term))
    res.json({ downloadUrl })
  }
)
