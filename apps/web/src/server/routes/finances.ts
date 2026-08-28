/**
 * apps/web/src/server/routes/finances.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT — R9's five independent fixes (below),
 *   plus R10's GET /forecast addition and MAJOR REWRITE of the
 *   Finance↔Library fine-settlement routes.
 * [R-PHASE]: R9 — Finance I: Invoicing, Fees & the Accounting Ledger
 *   Reconnection; R10 — Finance II: Payroll, Forecasting & the
 *   Finance↔Library Reconciliation
 * [PURPOSE — R9]:
 *   1. GET /payments/:id/receipt — added an explicit ownership check
 *      (studentService.assertStudentOwnership) alongside the existing role
 *      list; a student-role user could previously fetch any other
 *      student's receipt by iterating payment IDs. Also fixed a
 *      build-breaking call to a nonexistent `getViewUrl` export — the real
 *      helper is `getSignedViewUrl(fileId)`, which returns this app's own
 *      authenticated proxy URL rather than a bucket/fileId pair.
 *   2. GET /invoices/:id/installments — same ownership-check pattern.
 *   3. POST /invoices/:id/installments — replaced the raw
 *      type-assertion-only body handling with real Zod validation
 *      (CreateInstallmentPlanSchema: a frequency enum and a count minimum
 *      of 1), closing both the silent-misinterpretation-as-TERM_WISE bug
 *      and the count:0 -> Infinity baseAmount division in
 *      installmentService.createInstallmentPlan().
 *   4. /library-fines routes — out of scope R9, addressed in R10 below.
 *   5. Added `import 'server-only'` (was previously absent from this file).
 *   6. GET /invoices, GET /scholarships — added a joined student name
 *      (feeService.ts fix #2's "every list function returning invoices to
 *      a UI" pattern — the real list logic lives inline in these route
 *      handlers, not in a named feeService.ts function, so that is where
 *      the include was added) for InvoicesTab.tsx's/ScholarshipTab.tsx's
 *      "Student" columns.
 *   7. GET /invoices/:id/notes — added a joined author name via a manual
 *      StaffProfile lookup (authorUid is a Firebase-UID plain string with
 *      no Prisma relation) for InvoiceNotes.tsx's author display.
 *   8. GET /balance/:studentId — a student-role requester's Firebase UID
 *      is now resolved to their real Prisma Student.id before querying
 *      (Invoice.studentId is a Prisma FK, never a Firebase UID) — the
 *      Firebase-UID-to-Prisma-ID resolution InvoicesTab.tsx's switch to
 *      this endpoint for student self-service viewing depends on.
 * [PURPOSE — R10]:
 *   9. Added GET /forecast, calling forecastService.getCashFlowForecast()
 *      — ForecastPanel.tsx has been calling this exact path since its own
 *      phase with no matching route anywhere in the Express app.
 *  10. MAJOR REWRITE of the Finance↔Library fine-settlement routes
 *      (PATCH /library-fines/:id/pay, .../waive, POST /library-fines).
 *      Removed the unsafe Prisma-and-Firestore dual write entirely —
 *      Prisma is now the sole system of record for library fines
 *      (consistent with R6's Attendance decision); POST /library-fines
 *      never actually created the Firestore document its sibling routes
 *      assumed existed, so .../pay and .../waive's `.update()` calls on a
 *      nonexistent document were always one crash away from surfacing.
 *      Role lists corrected against the real permission matrix (verified
 *      directly, not assumed): GET /library-fines →
 *      ['high_rank','finance','library'] (finance.viewLibraryFines' real
 *      grant); PATCH .../pay → ['finance','library']
 *      (finance.clearLibraryFine); PATCH .../waive → ['library'] only
 *      (finance.waiveFine is held exclusively by library — neither admin
 *      nor high_rank holds it). PATCH .../pay now also posts to the
 *      accounting ledger under the already-seeded "4300 Library Fine
 *      Revenue" account, the third revenue category (after tuition/R9 and
 *      payroll/this same phase) the chart of accounts anticipated but
 *      nothing ever posted to. POST /library-fines now validates with
 *      CreateLibraryFineSchema instead of a raw type assertion (it no
 *      longer accepts a client-supplied firestoreDocId at all).
 */

import 'server-only'
import { Router } from 'express'
import multer from 'multer'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import {
  RecordPaymentSchema,
  GenerateInvoiceSchema,
  CreateFeeStructureSchema,
  CreateExpenseSchema,
  CreateScholarshipSchema,
  CreateInstallmentPlanSchema,
  CreateLibraryFineSchema,
  CreateBudgetSchema,
} from '@shared/schemas/finance'
import { Prisma, InvoiceStatus, FineStatus } from '@prisma/client'
import * as feeService from '@/server/services/feeService'
import * as budgetService from '@/server/services/budgetService'
import * as installmentService from '@/server/services/installmentService'
import * as studentService from '@/server/services/studentService'
import * as accountingService from '@/server/services/accountingService'
import * as forecastService from '@/server/services/forecastService'
import { generateFinancialReport } from '@/server/services/reportExportService'
import { getSignedViewUrl, uploadFile, FILE_PREFIX } from '@/lib/storage'
import { prisma } from '@/lib/prisma'
import { bulkGenerateInvoices } from '@/server/services/bulkInvoiceService'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }) // 10MB

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
    // [R9] Joined student name — the frontend never resolves a raw
    // studentId to a name itself (InvoicesTab.tsx's "Student" column).
    include: { student: { select: { firstName: true, lastName: true } } },
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
    let id = String(req.params.studentId)
    if (req.user!.role === 'student') {
      // [R9] A student-role client only ever knows its own Firebase UID —
      // resolve it to the real Prisma Student.id before querying, since
      // Invoice.studentId is a Prisma FK, never a Firebase UID. This also
      // makes the check tamper-proof: the URL param is ignored entirely
      // for this role, so it cannot be swapped for another student's ID.
      const student = await studentService.resolveStudentFromUid(req.user!.uid)
      if (!student) {
        return res.status(403).json({ error: 'No student record linked to your account.' })
      }
      id = student.id
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
      include: { invoice: { select: { studentId: true } } },
    })
    // [R9] Ownership check — a student-role user may only fetch a receipt
    // for a payment belonging to their own invoice. Prior to this fix, the
    // role list alone let any student-role user fetch any other student's
    // receipt by iterating payment IDs.
    if (req.user!.role === 'student') {
      await studentService.assertStudentOwnership(req.user!.uid, payment.invoice.studentId)
    }
    if (!payment.receiptKey) return res.status(404).json({ error: 'Receipt not yet generated' })
    const url = await getSignedViewUrl(payment.receiptKey)
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

// [R9] Maps each ExpenseCategory to the chart-of-accounts expense code
// accountingService.seedChartOfAccounts() seeds. LIBRARY and TRANSPORT
// have no dedicated seeded account — mapped to 5900 Miscellaneous Expense
// rather than adding new accounts, since this phase makes no change to
// accountingService.ts's own ledger logic (the seeded chart is untouched).
const EXPENSE_CATEGORY_ACCOUNT: Record<string, string> = {
  SALARIES: '5000',
  UTILITIES: '5100',
  MAINTENANCE: '5200',
  PROCUREMENT: '5300',
  LIBRARY: '5900',
  TRANSPORT: '5900',
  MISCELLANEOUS: '5900',
}

// [R9] Receipt upload — an Appwrite file ID stored on Expense.receiptKey,
// matching the field this session's schema.prisma comment fix corrects
// from a stale "R2 object key" reference. Mirrors assignments.ts's
// confirmed POST /:id/submit multer + uploadFile() pattern.
financesRouter.post(
  '/expenses/:id/receipt',
  verifyAuth,
  requireRole(['admin', 'finance']),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const uploaded = await uploadFile(
      FILE_PREFIX.EXPENSE_RECEIPT,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    )
    const expense = await prisma.expense.update({
      where: { id: String(req.params.id) },
      data: { receiptKey: uploaded.fileId },
    })
    res.status(201).json({ receiptKey: expense.receiptKey })
  }
)

// [R9] Receipt view — mirrors GET /payments/:id/receipt's signed-proxy-URL
// pattern; expense receipts are staff-only (no student ownership concept
// applies here), matching READ_ROLES['expense_receipt'] = ['admin','finance'].
financesRouter.get(
  '/expenses/:id/receipt',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const expense = await prisma.expense.findUniqueOrThrow({
      where: { id: String(req.params.id) },
      select: { receiptKey: true },
    })
    if (!expense.receiptKey) return res.status(404).json({ error: 'Receipt not yet uploaded' })
    const url = await getSignedViewUrl(expense.receiptKey)
    res.json({ url })
  }
)

financesRouter.patch(
  '/expenses/:id/approve',
  verifyAuth,
  requireRole(['admin', 'high_rank']),
  async (req, res) => {
    // [PRODUCTION FIX 2026-07-27] paidImmediately decides which ledger
    // account the approval posts against: Cash (already paid) or Accounts
    // Payable (owed — a vendor/company debt, cleared later via mark-paid).
    // Defaults to true so any caller that doesn't yet send this field keeps
    // today's behaviour (approval = paid) rather than silently starting to
    // create payables it never intended.
    const paidImmediately = req.body?.paidImmediately !== false
    const expense = await prisma.expense.update({
      where: { id: String(req.params.id) },
      data: {
        status: 'APPROVED',
        approvedByUid: req.user!.uid,
        approvedAt: new Date(),
        ...(paidImmediately ? { paidAt: new Date(), paidByUid: req.user!.uid } : {}),
      },
    })
    await budgetService.updateBudgetSpent(expense.category, expense.academicYear, Number(expense.amount))
    // [R9] Reconnect approved expenses to the double-entry ledger — Phase
    // 4B confirmed no money-movement operation reached accountingService
    // before this session (not just payments). A posting failure is
    // logged for reconciliation rather than reverting the already-applied
    // approval, matching feeService.recordPayment()'s identical pattern.
    try {
      const accountCode = EXPENSE_CATEGORY_ACCOUNT[expense.category] ?? '5900'
      const entryId = await accountingService.createJournalEntry({
        reference: `EXP-${expense.id.slice(-8).toUpperCase()}`,
        description: `Expense approved — ${expense.description} (${expense.category})`,
        entryDate: new Date(),
        actorUid: req.user!.uid,
        lines: paidImmediately
          ? [
              { accountCode, debit: Number(expense.amount), description: expense.description },
              { accountCode: '1000', credit: Number(expense.amount), description: 'Cash paid for expense' },
            ]
          : [
              { accountCode, debit: Number(expense.amount), description: expense.description },
              { accountCode: '2000', credit: Number(expense.amount), description: `Owed — ${expense.description}` },
            ],
      })
      await accountingService.postEntry(entryId, req.user!.uid)
    } catch (err) {
      // Best-effort accounting-ledger posting — the primary operation
      // (expense/fine record) already succeeded and stays 200; this is
      // purely a secondary-write failure. Previously only logger.error'd,
      // meaning a real financial-integrity gap (a record exists with no
      // posted journal entry) was invisible to Sentry. Now captured, tagged
      // 'finances' — sentry.server.config.ts's own beforeSend additionally
      // auto-escalates to level:fatal + critical_module:'finance' if the
      // thrown message mentions JOURNAL/PAYROLL/INVOICE.
      logger.error({ event: 'accounting.expense_posting_failed', expenseId: expense.id, err })
      Sentry.captureException(err, { tags: { module: 'finances', event: 'accounting.expense_posting_failed' } })
    }
    res.json(expense)
  }
)

// [PRODUCTION FIX 2026-07-27] Clears a vendor/company debt — an expense
// that was approved with paidImmediately=false (posted to 2000 Accounts
// Payable, still unpaid). Posts the offsetting entry (DR 2000 / CR 1000)
// and stamps paidAt so it drops out of the debts list.
financesRouter.patch(
  '/expenses/:id/mark-paid',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const expense = await prisma.expense.findUniqueOrThrow({ where: { id: String(req.params.id) } })
    if (expense.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Only approved expenses can be marked as paid.' })
    }
    if (expense.paidAt) {
      return res.status(400).json({ error: 'This expense is already marked as paid.' })
    }
    const updated = await prisma.expense.update({
      where: { id: expense.id },
      data: { paidAt: new Date(), paidByUid: req.user!.uid },
    })
    try {
      const entryId = await accountingService.createJournalEntry({
        reference: `EXP-PAY-${expense.id.slice(-8).toUpperCase()}`,
        description: `Payable settled — ${expense.description}`,
        entryDate: new Date(),
        actorUid: req.user!.uid,
        lines: [
          { accountCode: '2000', debit: Number(expense.amount), description: 'Clear payable' },
          { accountCode: '1000', credit: Number(expense.amount), description: 'Cash paid' },
        ],
      })
      await accountingService.postEntry(entryId, req.user!.uid)
    } catch (err) {
      // Best-effort accounting-ledger posting — the primary operation
      // (expense/fine record) already succeeded and stays 200; this is
      // purely a secondary-write failure. Previously only logger.error'd,
      // meaning a real financial-integrity gap (a record exists with no
      // posted journal entry) was invisible to Sentry. Now captured, tagged
      // 'finances' — sentry.server.config.ts's own beforeSend additionally
      // auto-escalates to level:fatal + critical_module:'finance' if the
      // thrown message mentions JOURNAL/PAYROLL/INVOICE.
      logger.error({ event: 'accounting.expense_markpaid_posting_failed', expenseId: expense.id, err })
      Sentry.captureException(err, { tags: { module: 'finances', event: 'accounting.expense_markpaid_posting_failed' } })
    }
    res.json(updated)
  }
)

// [PRODUCTION FIX 2026-07-27] Debts overview — approved-but-unpaid expenses
// (vendor/company debts, mirrors ledger account 2000's balance) alongside
// a staff-loan summary. Staff loan MANAGEMENT stays on the HR page's Loans
// tab (already fully built) — this only reads a summary so Finance has
// visibility without duplicating that UI.
financesRouter.get('/debts', verifyAuth, requireRole([...FINANCE_ROLES]), async (_req, res) => {
  const [vendorDebts, staffLoans] = await Promise.all([
    prisma.expense.findMany({
      where: { status: 'APPROVED', paidAt: null },
      orderBy: { approvedAt: 'asc' },
    }),
    prisma.staffLoan.findMany({
      where: { status: { in: ['DISBURSED', 'REPAYING'] } },
      orderBy: { createdAt: 'desc' },
      include: { staff: { select: { firstName: true, lastName: true, employeeNo: true } } },
    }),
  ])
  const totalVendorDebt = vendorDebts.reduce((sum, e) => sum + Number(e.amount), 0)
  const totalStaffLoanBalance = staffLoans.reduce((sum, l) => sum + Number(l.balance), 0)
  res.json({ vendorDebts, totalVendorDebt, staffLoans, totalStaffLoanBalance })
})

// [R9] NEW — expense rejection, the workflow's second outcome. Gated on
// the now-real finance.rejectExpense permission (previously granted to
// zero roles) rather than requireRole, since this is new surface with no
// legacy convention to preserve — see S/types/permissions.ts's header
// comment for why high_rank is the exact mirror of finance.approveExpense.
// No ledger posting — only an APPROVED expense reaches accountingService.
financesRouter.patch(
  '/expenses/:id/reject',
  verifyAuth,
  requirePermission('finance.rejectExpense'),
  async (req, res) => {
    const expense = await prisma.expense.update({
      where: { id: String(req.params.id) },
      data: { status: 'REJECTED' },
    })
    res.json(expense)
  }
)

// ── SCHOLARSHIPS
financesRouter.get('/scholarships', verifyAuth, requireRole([...FINANCE_ROLES]), async (_req, res) => {
  const scholarships = await prisma.scholarship.findMany({ orderBy: { createdAt: 'desc' } })
  // [R9] Joined student name — Scholarship.studentId has no Prisma
  // @relation (same gap as LibraryFine.studentId), so this is the same
  // manual-lookup pattern used for library fines and invoice-note
  // authors, not a Prisma `include`. Unlike LibraryFine.studentId,
  // Scholarship.studentId is non-nullable, so no null-filter is needed
  // here. ScholarshipTab.tsx no longer shows a raw truncated studentId.
  const studentIds = [...new Set(scholarships.map((s) => s.studentId))]
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: { id: true, firstName: true, lastName: true },
  })
  const studentById = new Map(students.map((s) => [s.id, s]))
  res.json(
    scholarships.map((s) => ({
      ...s,
      student: studentById.get(s.studentId) ?? undefined,
    }))
  )
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

// [PRODUCTION FIX 2026-07-28] budgetService.createBudget() already existed
// and worked — there was simply no route calling it, so the Budget tab had
// no way to create a budget at all (confirmed: CreateBudgetSchema and the
// service function had zero callers anywhere).
financesRouter.post('/budget', verifyAuth, requireRole([...FINANCE_ROLES]), async (req, res) => {
  const parsed = CreateBudgetSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid budget data.' })
  }
  const budget = await budgetService.createBudget(parsed.data, req.user!.uid)
  res.status(201).json(budget)
})

// ── ACCOUNTING LEDGER
// [R9] NEW — AccountingLedgerTab.tsx (Phase D6, confirmed already
// correctly built) has always called these three paths, and
// accountingService.getIncomeStatement()/getTrialBalance()/
// getAccountLedger() have always been correct — but no route ever backed
// any of the three, and the component's own import (`apiClient` — no such
// export exists in api-client.ts, only `apiFetch`) was independently
// build-breaking. Both gaps are hotfixed here: this phase's own headline
// acceptance criterion ("a tuition payment produces a posting visible in
// AccountingLedgerTab.tsx... within the same request cycle") is otherwise
// unsatisfiable no matter how correct the write-side reconnection is.
financesRouter.get(
  '/accounting/income-statement',
  verifyAuth,
  requireRole([...FINANCE_ROLES]),
  async (req, res) => {
    const { from, to } = req.query as { from?: string; to?: string }
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' })
    const statement = await accountingService.getIncomeStatement(new Date(from), new Date(to))
    res.json(statement)
  }
)

financesRouter.get(
  '/accounting/trial-balance',
  verifyAuth,
  requireRole([...FINANCE_ROLES]),
  async (_req, res) => {
    res.json(await accountingService.getTrialBalance())
  }
)

financesRouter.get(
  '/accounting/ledger/:code',
  verifyAuth,
  requireRole([...FINANCE_ROLES]),
  async (req, res) => {
    const { from, to } = req.query as { from?: string; to?: string }
    const lines = await accountingService.getAccountLedger(
      String(req.params.code),
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined
    )
    res.json(lines)
  }
)

// ── FORECAST
// [R10] NEW — ForecastPanel.tsx has been calling this exact path since
// its own phase with no matching route anywhere in the Express app.
financesRouter.get(
  '/forecast',
  verifyAuth,
  requireRole([...FINANCE_ROLES]),
  async (req, res) => {
    const { academicYear = '2025/2026', forwardMonths } = req.query as {
      academicYear?: string
      forwardMonths?: string
    }
    const report = await forecastService.getCashFlowForecast(
      academicYear,
      forwardMonths ? Number(forwardMonths) : undefined
    )
    res.json(report)
  }
)

// ── INSTALLMENTS
financesRouter.post(
  '/invoices/:id/installments',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const parsed = CreateInstallmentPlanSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const planId = await installmentService.createInstallmentPlan(
      String(req.params.id),
      parsed.data.frequency,
      parsed.data.count,
      new Date(parsed.data.startDate),
      req.user!.uid,
    )
    res.status(201).json({ planId })
  }
)

financesRouter.get(
  '/invoices/:id/installments',
  verifyAuth,
  requireRole(['admin', 'finance', 'student']),
  async (req, res) => {
    const invoiceId = String(req.params.id)
    // [R9] Ownership check — same pattern as GET /payments/:id/receipt.
    if (req.user!.role === 'student') {
      const invoice = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        select: { studentId: true },
      })
      await studentService.assertStudentOwnership(req.user!.uid, invoice.studentId)
    }
    const plan = await installmentService.getInstallmentPlan(invoiceId)
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
    // [R9] Joined author name — authorUid is a Firebase UID plain string
    // (no Prisma relation exists for it, per this schema's convention of
    // unenforced-string references to a person's Firebase identity), so
    // resolving a display name is a manual StaffProfile lookup rather than
    // a Prisma `include`. InvoiceNotes.tsx no longer shows a raw
    // truncated authorUid.
    const authorUids = [...new Set(notes.map((n) => n.authorUid))]
    const authors = await prisma.staffProfile.findMany({
      where: { uid: { in: authorUids } },
      select: { uid: true, firstName: true, lastName: true },
    })
    const authorByUid = new Map(authors.map((a) => [a.uid, a]))
    res.json(
      notes.map((note) => ({
        ...note,
        author: authorByUid.get(note.authorUid) ?? undefined,
      }))
    )
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

// ── POST /finances/invoices/bulk-generate (admin | finance) ──────────────────
financesRouter.post(
  '/invoices/bulk-generate',
  verifyAuth,
  requireRole(['admin', 'finance']),
  async (req, res) => {
    const { classId = 'ALL', academicYear, term } = req.body as {
      classId?: string
      academicYear: string
      term: number
    }

    if (!academicYear || !term) {
      return res.status(400).json({ error: 'academicYear and term are required' })
    }

    const result = await bulkGenerateInvoices(
      classId,
      academicYear,
      Number(term),
      req.user!.uid,
    )
    return res.status(201).json(result)
  },
)

// ── LIBRARY FINES
// [R10] Prisma is now the sole system of record for library fines — see
// header comment for the full rationale (POST never created the
// Firestore document its siblings assumed existed; consistent with R6's
// identical Attendance system-of-record decision).
financesRouter.get(
  '/library-fines',
  verifyAuth,
  requireRole(['high_rank', 'finance', 'library']),
  async (req, res) => {
    const { status = 'PENDING' } = req.query
    // Cast to FineStatus enum directly — avoids exactOptionalPropertyTypes violation
    const where: Prisma.LibraryFineWhereInput = {
      status: String(status) as FineStatus,
    }
    const fines = await prisma.libraryFine.findMany({ where, orderBy: { createdAt: 'desc' } })
    // [R10] Joined student name — LibraryFine has no Prisma relation to
    // Student (studentId is a plain string, no @relation), so this is a
    // manual lookup, the same pattern established for invoice-note
    // authors in R9. LibraryFinesTab.tsx previously showed no student
    // identification at all (studentId existed on the interface but was
    // never rendered in any form).
    // [R12] studentId is now nullable — a staff-borrower fine (this
    // phase) has none — so null is filtered out before the lookup.
    const studentIds = [...new Set(fines.map((f) => f.studentId).filter((id): id is string => id !== null))]
    const students = await prisma.student.findMany({
      where:  { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true },
    })
    const studentById = new Map(students.map((s) => [s.id, s]))
    res.json(
      fines.map((fine) => ({
        ...fine,
        student: fine.studentId && studentById.get(fine.studentId)
          ? {
              firstName: studentById.get(fine.studentId)!.firstName,
              lastName:  studentById.get(fine.studentId)!.lastName,
            }
          : undefined,
      }))
    )
  }
)

financesRouter.post(
  '/library-fines',
  verifyAuth,
  requireRole(['admin', 'library']),
  async (req, res) => {
    const parsed = CreateLibraryFineSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const fine = await prisma.libraryFine.create({
      data: { ...parsed.data, markedByUid: req.user!.uid },
    })
    res.status(201).json(fine)
  }
)

financesRouter.patch(
  '/library-fines/:id/pay',
  verifyAuth,
  requireRole(['finance', 'library']),
  async (req, res) => {
    const fine = await prisma.libraryFine.update({
      where: { id: String(req.params.id) },
      data: { status: 'PAID', paidAt: new Date(), clearedByUid: req.user!.uid },
    })
    // [R10] Reconnect library fine payments to the double-entry ledger —
    // the third revenue category (after tuition/R9 and payroll/this same
    // phase) the chart of accounts anticipated (4300 Library Fine
    // Revenue) but nothing ever posted to. A posting failure is logged
    // for reconciliation rather than reverting the already-recorded
    // payment, matching the identical pattern established in R9.
    try {
      const entryId = await accountingService.createJournalEntry({
        reference:   `LIB-${fine.id.slice(-8).toUpperCase()}`,
        description: `Library fine paid — ${fine.bookTitle} (${fine.reason})`,
        entryDate:   new Date(),
        actorUid:    req.user!.uid,
        lines: [
          { accountCode: '1000', debit: Number(fine.amount), description: 'Cash received' },
          { accountCode: '4300', credit: Number(fine.amount), description: 'Library fine revenue' },
        ],
      })
      await accountingService.postEntry(entryId, req.user!.uid)
    } catch (err) {
      // Best-effort accounting-ledger posting — the primary operation
      // (expense/fine record) already succeeded and stays 200; this is
      // purely a secondary-write failure. Previously only logger.error'd,
      // meaning a real financial-integrity gap (a record exists with no
      // posted journal entry) was invisible to Sentry. Now captured, tagged
      // 'finances' — sentry.server.config.ts's own beforeSend additionally
      // auto-escalates to level:fatal + critical_module:'finance' if the
      // thrown message mentions JOURNAL/PAYROLL/INVOICE.
      logger.error({ event: 'accounting.library_fine_posting_failed', fineId: fine.id, err })
      Sentry.captureException(err, { tags: { module: 'finances', event: 'accounting.library_fine_posting_failed' } })
    }
    res.json(fine)
  }
)

financesRouter.patch(
  '/library-fines/:id/waive',
  verifyAuth,
  requireRole(['library']),
  async (req, res) => {
    const fine = await prisma.libraryFine.update({
      where: { id: String(req.params.id) },
      data: { status: 'WAIVED', waivedAt: new Date(), waivedByUid: req.user!.uid, clearedByUid: req.user!.uid },
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

// ── REPORTS — IN-SYSTEM VIEW
// [PRODUCTION FIX 2026-07-28] ReportsExportPanel.tsx only ever offered
// .xlsx export — no way to actually look at the data without downloading
// and opening a spreadsheet. Mirrors the exact same Prisma queries
// reportExportService.ts's four build*Sheet() functions already use, just
// returning JSON instead of writing into a workbook — same source of
// truth, two presentations.
financesRouter.get(
  '/reports/data',
  verifyAuth,
  requireRole(['admin', 'finance', 'high_rank']),
  async (req, res) => {
    const { type, academicYear = '2025/2026', term = '1' } = req.query as {
      type: string
      academicYear: string
      term: string
    }
    if (!VALID_REPORT_TYPES.includes(type as ReportType)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_REPORT_TYPES.join(', ')}` })
    }
    const yearNum = Number(term)

    if (type === 'fee_collection') {
      const invoices = await prisma.invoice.findMany({
        where: { academicYear, term: yearNum },
        orderBy: { status: 'asc' },
        // Same convention GET /invoices already uses above ([R9]) — never
        // surface a raw studentId cuid in a UI-facing report.
        include: { student: { select: { firstName: true, lastName: true, registrationNo: true } } },
      })
      return res.json(invoices.map((inv) => ({
        student: inv.student ? `${inv.student.firstName} ${inv.student.lastName}` : '—',
        studentRegNo: inv.student?.registrationNo ?? '—',
        academicYear: inv.academicYear, term: inv.term,
        total: Number(inv.totalAmount), paid: Number(inv.paidAmount), balance: Number(inv.balance),
        status: inv.status, dueDate: inv.dueDate,
      })))
    }
    if (type === 'outstanding_balances') {
      const overdue = await prisma.invoice.findMany({
        where: { academicYear, term: yearNum, status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
        orderBy: { balance: 'desc' },
        include: { student: { select: { firstName: true, lastName: true, registrationNo: true } } },
      })
      return res.json(overdue.map((inv) => ({
        student: inv.student ? `${inv.student.firstName} ${inv.student.lastName}` : '—',
        studentRegNo: inv.student?.registrationNo ?? '—',
        term: inv.term, balance: Number(inv.balance),
        status: inv.status, dueDate: inv.dueDate,
      })))
    }
    if (type === 'expense_breakdown') {
      const expenses = await prisma.expense.findMany({
        where: { academicYear, term: yearNum },
        orderBy: [{ category: 'asc' }, { incurredAt: 'desc' }],
      })
      return res.json(expenses.map((e) => ({
        category: e.category, description: e.description, amount: Number(e.amount),
        date: e.incurredAt, status: e.status,
      })))
    }
    // payroll_summary — uses calendar year, not academicYear/term
    const runs = await prisma.payrollRun.findMany({
      where: { year: Number(academicYear.slice(0, 4)) },
      orderBy: { month: 'asc' },
    })
    return res.json(runs.map((r) => ({
      month: new Date(r.year, r.month - 1).toLocaleString('en', { month: 'long' }),
      totalGross: Number(r.totalGross), totalNet: Number(r.totalNet),
      status: r.status, runDate: r.completedAt,
    })))
  }
)