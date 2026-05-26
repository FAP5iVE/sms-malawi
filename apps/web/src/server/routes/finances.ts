
import { Router } from 'express'
import { getFirestore } from 'firebase-admin/firestore'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import {
  RecordPaymentSchema,
  GenerateInvoiceSchema,
  CreateFeeStructureSchema,
  CreateExpenseSchema,
  CreateScholarshipSchema,
} from '@shared/schemas/finance'
import { Prisma, InvoiceStatus, FineStatus } from '@prisma/client'
import * as feeService from '@/server/services/feeService'
import * as budgetService from '@/server/services/budgetService'
import * as installmentService from '@/server/services/installmentService'
import { generateFinancialReport } from '@/server/services/reportExportService'
import { getViewUrl } from '@/lib/storage'
import { prisma } from '@/lib/prisma'

export const financesRouter = Router()

const FINANCE_ROLES = ['admin', 'high_rank', 'finance'] as const

// Report type alias — replaces the broken Parameters<> utility type
type ReportType = 'fee_collection' | 'outstanding_balances' | 'expense_breakdown' | 'payroll_summary'
const VALID_REPORT_TYPES: ReportType[] = [
  'fee_collection', 'outstanding_balances', 'expense_breakdown', 'payroll_summary',
]

// ── SUMMARY
financesRouter.get('/summary', verifyAuth, requireRole([...FINANCE_ROLES]), async (req, res) => {
  const { academicYear = '2025/2026', term = '1' } = req.query
  const summary = await feeService.getFinanceSummary(academicYear as string, Number(term))
  res.json(summary)
})

// ── FEE STRUCTURES
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
    // CreateFeeStructureSchema only has: name, amount, classId, academicYear, term
    // isActive has a Prisma default (true) — don't pass it
    // description does NOT exist in the schema — don't pass it
    const fee = await prisma.feeStructure.create({
      data: {
        name: parsed.data.name,
        amount: parsed.data.amount,
        academicYear: parsed.data.academicYear,
        ...(parsed.data.term != null ? { term: parsed.data.term } : {}),
        ...(parsed.data.classId ? { classId: parsed.data.classId } : {}),
      },
    })
    res.status(201).json(fee)
  }
)

// ── INVOICES
financesRouter.get('/invoices', verifyAuth, requireRole([...FINANCE_ROLES]), async (req, res) => {
  const { studentId, academicYear, term, status } = req.query
  const where: Prisma.InvoiceWhereInput = {}
  if (studentId) where.studentId = String(studentId)
  if (academicYear) where.academicYear = String(academicYear)
  if (term) where.term = Number(term)
  // Cast to InvoiceStatus enum directly — NOT InvoiceWhereInput['status']
  // because that indexed type includes undefined which violates exactOptionalPropertyTypes
  if (status) where.status = String(status) as InvoiceStatus
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

// ── STUDENT BALANCE
financesRouter.get(
  '/balance/:studentId',
  verifyAuth,
  requireRole(['admin', 'finance', 'high_rank', 'student']),
  async (req, res) => {
    const id = String(req.params.studentId)
    if (req.user!.role === 'student' && req.user!.uid !== id) {
      return res.status(403).json({ error: 'Access denied' })
    }
    const { academicYear = '2025/2026' } = req.query
    const result = await feeService.getStudentBalance(id, academicYear as string)
    res.json(result)
  }
)

// ── RECORD PAYMENT
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

// ── RECEIPT DOWNLOAD
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

// ── EXPENSES
financesRouter.get('/expenses', verifyAuth, requireRole([...FINANCE_ROLES]), async (req, res) => {
  const { academicYear = '2025/2026', term } = req.query
  const where: Prisma.ExpenseWhereInput = { academicYear: academicYear as string }
  if (term) where.term = Number(term)
  const expenses = await prisma.expense.findMany({ where, orderBy: { incurredAt: 'desc' } })
  res.json(expenses)
})

financesRouter.post('/expenses', verifyAuth, requireRole(['admin', 'finance']), async (req, res) => {
  const parsed = CreateExpenseSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  const expense = await prisma.expense.create({
    data: {
      ...parsed.data,
      recordedByUid: req.user!.uid,
      incurredAt: new Date(parsed.data.incurredAt),
    } as Prisma.ExpenseUncheckedCreateInput,
  })
  res.status(201).json(expense)
})

financesRouter.patch(
  '/expenses/:id/approve',
  verifyAuth,
  requireRole(['admin', 'high_rank']),
  async (req, res) => {
    const expense = await prisma.expense.update({
      where: { id: String(req.params.id) },
      data: { status: 'APPROVED', approvedByUid: req.user!.uid, approvedAt: new Date() },
    })
    await budgetService.updateBudgetSpent(expense.category, expense.academicYear, Number(expense.amount))
    res.json(expense)
  }
)

// ── SCHOLARSHIPS
financesRouter.get('/scholarships', verifyAuth, requireRole([...FINANCE_ROLES]), async (_req, res) => {
  res.json(await prisma.scholarship.findMany({ orderBy: { createdAt: 'desc' } }))
})

financesRouter.post('/scholarships', verifyAuth, requireRole(['admin', 'finance']), async (req, res) => {
  const parsed = CreateScholarshipSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  const s = await prisma.scholarship.create({
    data: parsed.data as Prisma.ScholarshipUncheckedCreateInput,
  })
  res.status(201).json(s)
})

// ── BUDGET
financesRouter.get('/budget', verifyAuth, requireRole([...FINANCE_ROLES, 'high_rank']), async (req, res) => {
  const { academicYear = '2025/2026', term } = req.query
  const data = await budgetService.getBudgetVsActual(
    academicYear as string,
    term ? Number(term) : undefined
  )
  res.json(data)
})

// ── INSTALLMENTS
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
    if (!frequency || !count || !startDate)
      return res.status(400).json({ error: 'frequency, count, and startDate are required' })
    const planId = await installmentService.createInstallmentPlan(
      String(req.params.id), frequency, Number(count), new Date(startDate), req.user!.uid
    )
    res.status(201).json({ planId })
  }
)

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

// ── INVOICE NOTES
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

financesRouter.post(
  '/invoices/:id/notes',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const { body } = req.body as { body: string }
    if (!body?.trim()) return res.status(400).json({ error: 'Note body is required' })
    const note = await prisma.invoiceNote.create({
      data: { invoiceId: String(req.params.id), body: body.trim(), authorUid: req.user!.uid },
    })
    res.status(201).json(note)
  }
)

// ── LIBRARY FINES
financesRouter.get(
  '/library-fines',
  verifyAuth,
  requireRole(['admin', 'finance', 'library']),
  async (req, res) => {
    const { status = 'PENDING' } = req.query
    // Cast to FineStatus enum directly — avoids exactOptionalPropertyTypes violation
    const where: Prisma.LibraryFineWhereInput = {
      status: String(status) as FineStatus,
    }
    const fines = await prisma.libraryFine.findMany({ where, orderBy: { createdAt: 'desc' } })
    res.json(fines)
  }
)

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

financesRouter.patch(
  '/library-fines/:id/pay',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const fine = await prisma.libraryFine.update({
      where: { id: String(req.params.id) },
      data: { status: 'PAID', paidAt: new Date(), clearedByUid: req.user!.uid },
    })
    await getFirestore().collection('library_fines').doc(fine.firestoreDocId).update({
      finePaid: true,
      fineClearedAt: new Date().toISOString(),
    })
    res.json(fine)
  }
)

financesRouter.patch(
  '/library-fines/:id/waive',
  verifyAuth,
  requireRole(['admin', 'high_rank']),
  async (req, res) => {
    const fine = await prisma.libraryFine.update({
      where: { id: String(req.params.id) },
      data: { status: 'WAIVED', clearedByUid: req.user!.uid },
    })
    await getFirestore().collection('library_fines').doc(fine.firestoreDocId).update({
      fineWaived: true,
    })
    res.json(fine)
  }
)

// ── REPORTS EXPORT
financesRouter.post(
  '/reports/export',
  verifyAuth,
  requireRole(['admin', 'finance', 'high_rank']),
  async (req, res) => {
    const { type, academicYear = '2025/2026', term = 1 } = req.body as {
      type: string
      academicYear: string
      term: number
    }
    if (!VALID_REPORT_TYPES.includes(type as ReportType)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_REPORT_TYPES.join(', ')}` })
    }
    const downloadUrl = await generateFinancialReport(type as ReportType, academicYear, Number(term))
    res.json({ downloadUrl })
  }
)