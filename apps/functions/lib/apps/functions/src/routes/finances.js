"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.financesRouter = void 0;
const express_1 = require("express");
const firestore_1 = require("firebase-admin/firestore");
const auth_1 = require("../middleware/auth");
const finance_1 = require("../../../../packages/shared/schemas/finance");
const feeService = __importStar(require("../services/feeService"));
const budgetService = __importStar(require("../services/budgetService"));
const installmentService = __importStar(require("../services/installmentService"));
const storage_1 = require("../lib/storage");
const prisma_1 = require("../lib/prisma");
exports.financesRouter = (0, express_1.Router)();
const FINANCE_ROLES = ['admin', 'high_rank', 'finance'];
// ── SUMMARY ──────────────────────────────────────────────
exports.financesRouter.get('/summary', auth_1.verifyAuth, (0, auth_1.requireRole)([...FINANCE_ROLES]), async (req, res) => {
    const { academicYear = '2025/2026', term = '1' } = req.query;
    const summary = await feeService.getFinanceSummary(academicYear, Number(term));
    res.json(summary);
});
// ── FEE STRUCTURES ───────────────────────────────────────
exports.financesRouter.get('/fee-structures', auth_1.verifyAuth, (0, auth_1.requireRole)([...FINANCE_ROLES, 'high_rank']), async (req, res) => {
    const { academicYear = '2025/2026' } = req.query;
    const fees = await prisma_1.prisma.feeStructure.findMany({
        where: { academicYear: academicYear, isActive: true },
        orderBy: { name: 'asc' },
    });
    res.json(fees);
});
exports.financesRouter.post('/fee-structures', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance']), async (req, res) => {
    const parsed = finance_1.CreateFeeStructureSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ errors: parsed.error.flatten() });
    const fee = await prisma_1.prisma.feeStructure.create({ data: parsed.data });
    res.status(201).json(fee);
});
// ── INVOICES ─────────────────────────────────────────────
exports.financesRouter.get('/invoices', auth_1.verifyAuth, (0, auth_1.requireRole)([...FINANCE_ROLES]), async (req, res) => {
    const { studentId, academicYear, term, status } = req.query;
    const where = {};
    if (studentId)
        where.studentId = studentId;
    if (academicYear)
        where.academicYear = academicYear;
    if (term)
        where.term = Number(term);
    if (status)
        where.status = status;
    const invoices = await prisma_1.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
    });
    res.json(invoices);
});
exports.financesRouter.post('/invoices/generate', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance']), async (req, res) => {
    const parsed = finance_1.GenerateInvoiceSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ errors: parsed.error.flatten() });
    const invoice = await feeService.generateInvoice(parsed.data, req.user.uid, req.user.role);
    res.status(201).json(invoice);
});
// ── STUDENT BALANCE (for students to view own fees) ───────
exports.financesRouter.get('/balance/:studentId', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance', 'high_rank', 'student']), async (req, res) => {
    const id = String(req.params.studentId);
    // Students can only view their own balance
    if (req.user.role === 'student' && req.user.uid !== id) {
        return res.status(403).json({ error: 'Access denied' });
    }
    const { academicYear = '2025/2026' } = req.query;
    const result = await feeService.getStudentBalance(id, academicYear);
    res.json(result);
});
// ── RECORD PAYMENT ───────────────────────────────────────
exports.financesRouter.post('/payments', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance']), async (req, res) => {
    const parsed = finance_1.RecordPaymentSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ errors: parsed.error.flatten() });
    const result = await feeService.recordPayment(parsed.data, req.user.uid, req.user.role);
    res.status(201).json(result);
});
// ── RECEIPT DOWNLOAD (signed URL) ────────────────────────
exports.financesRouter.get('/payments/:id/receipt', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance', 'student']), async (req, res) => {
    const payment = await prisma_1.prisma.payment.findUniqueOrThrow({
        where: { id: String(req.params.id) },
    });
    if (!payment.receiptKey)
        return res.status(404).json({ error: 'Receipt not yet generated' });
    const url = await (0, storage_1.getViewUrl)('sms-payslips', payment.receiptKey);
    res.json({ url });
});
// ── EXPENSES ─────────────────────────────────────────────
exports.financesRouter.get('/expenses', auth_1.verifyAuth, (0, auth_1.requireRole)([...FINANCE_ROLES]), async (req, res) => {
    const { academicYear = '2025/2026', term } = req.query;
    const expenses = await prisma_1.prisma.expense.findMany({
        where: { academicYear: academicYear, ...(term ? { term: Number(term) } : {}) },
        orderBy: { incurredAt: 'desc' },
    });
    res.json(expenses);
});
exports.financesRouter.post('/expenses', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance']), async (req, res) => {
    const parsed = finance_1.CreateExpenseSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ errors: parsed.error.flatten() });
    const expense = await prisma_1.prisma.expense.create({
        data: {
            ...parsed.data,
            recordedByUid: req.user.uid,
            incurredAt: new Date(parsed.data.incurredAt),
        },
    });
    res.status(201).json(expense);
});
exports.financesRouter.patch('/expenses/:id/approve', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank']), async (req, res) => {
    const expense = await prisma_1.prisma.expense.update({
        where: { id: String(req.params.id) },
        data: { status: 'APPROVED', approvedByUid: req.user.uid, approvedAt: new Date() },
    });
    // Update budget spent amount
    await budgetService.updateBudgetSpent(expense.category, expense.academicYear, Number(expense.amount));
    res.json(expense);
});
// ── SCHOLARSHIPS ─────────────────────────────────────────
exports.financesRouter.get('/scholarships', auth_1.verifyAuth, (0, auth_1.requireRole)([...FINANCE_ROLES]), async (_req, res) => {
    res.json(await prisma_1.prisma.scholarship.findMany({ orderBy: { createdAt: 'desc' } }));
});
exports.financesRouter.post('/scholarships', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance']), async (req, res) => {
    const parsed = finance_1.CreateScholarshipSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ errors: parsed.error.flatten() });
    const s = await prisma_1.prisma.scholarship.create({ data: parsed.data });
    res.status(201).json(s);
});
// ── BUDGET ───────────────────────────────────────────────
exports.financesRouter.get('/budget', auth_1.verifyAuth, (0, auth_1.requireRole)([...FINANCE_ROLES, 'high_rank']), async (req, res) => {
    const { academicYear = '2025/2026', term } = req.query;
    const data = await budgetService.getBudgetVsActual(academicYear, term ? Number(term) : undefined);
    res.json(data);
});
// POST /finances/invoices/:id/installments — create plan
exports.financesRouter.post('/invoices/:id/installments', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance']), async (req, res) => {
    const { frequency, count, startDate } = req.body;
    if (!frequency || !count || !startDate) {
        return res.status(400).json({ error: 'frequency, count, and startDate are required' });
    }
    const planId = await installmentService.createInstallmentPlan(String(req.params.id), frequency, Number(count), new Date(startDate), req.user.uid);
    res.status(201).json({ planId });
});
// GET /finances/invoices/:id/installments — get plan
exports.financesRouter.get('/invoices/:id/installments', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance', 'student']), async (req, res) => {
    const plan = await installmentService.getInstallmentPlan(String(req.params.id));
    if (!plan)
        return res.status(404).json({ error: 'No installment plan for this invoice' });
    res.json(plan);
});
// GET /finances/invoices/:id/notes
exports.financesRouter.get('/invoices/:id/notes', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance', 'high_rank']), async (req, res) => {
    const notes = await prisma_1.prisma.invoiceNote.findMany({
        where: { invoiceId: String(req.params.id) },
        orderBy: { createdAt: 'desc' },
    });
    res.json(notes);
});
// POST /finances/invoices/:id/notes — add a sticky note
exports.financesRouter.post('/invoices/:id/notes', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance']), async (req, res) => {
    const { body } = req.body;
    if (!body?.trim())
        return res.status(400).json({ error: 'Note body is required' });
    const note = await prisma_1.prisma.invoiceNote.create({
        data: {
            invoiceId: String(req.params.id),
            body: body.trim(),
            authorUid: req.user.uid,
        },
    });
    res.status(201).json(note);
});
// ── LIBRARY FINES BRIDGE ──────────────────────────────────
// GET /finances/library-fines — list all pending fines
exports.financesRouter.get('/library-fines', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance', 'library']), async (req, res) => {
    const { status = 'PENDING' } = req.query;
    const fines = await prisma_1.prisma.libraryFine.findMany({
        where: { status: status },
        orderBy: { createdAt: 'desc' },
    });
    res.json(fines);
});
// POST /finances/library-fines — librarian creates a fine
exports.financesRouter.post('/library-fines', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'library']), async (req, res) => {
    const { studentId, bookTitle, amount, reason, firestoreDocId } = req.body;
    const fine = await prisma_1.prisma.libraryFine.create({
        data: { studentId, bookTitle, amount, reason, firestoreDocId, markedByUid: req.user.uid },
    });
    res.status(201).json(fine);
});
// PATCH /finances/library-fines/:id/pay — finance marks fine as paid
exports.financesRouter.patch('/library-fines/:id/pay', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance']), async (req, res) => {
    const fine = await prisma_1.prisma.libraryFine.update({
        where: { id: String(req.params.id) },
        data: {
            status: 'PAID',
            paidAt: new Date(),
            clearedByUid: req.user.uid,
        },
    });
    // Sync cleared status back to Firestore library record
    const db = (0, firestore_1.getFirestore)();
    await db.collection('library_fines').doc(fine.firestoreDocId).update({
        finePaid: true,
        fineClearedAt: new Date().toISOString(),
    });
    res.json(fine);
});
// PATCH /finances/library-fines/:id/waive — admin can waive a fine
exports.financesRouter.patch('/library-fines/:id/waive', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'high_rank']), async (req, res) => {
    const fine = await prisma_1.prisma.libraryFine.update({
        where: { id: String(req.params.id) },
        data: { status: 'WAIVED', clearedByUid: req.user.uid },
    });
    const db = (0, firestore_1.getFirestore)();
    await db.collection('library_fines').doc(fine.firestoreDocId).update({
        fineWaived: true,
    });
    res.json(fine);
});
// ── ADD import at top of finances.ts ──────────────────────
const reportExportService_1 = require("../services/reportExportService");
// ── ADD route ─────────────────────────────────────────────
// POST /finances/reports/export
// Body: { type: "fee_collection"|"outstanding_balances"|"expense_breakdown"|"payroll_summary", academicYear, term }
exports.financesRouter.post('/reports/export', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance', 'high_rank']), async (req, res) => {
    const { type, academicYear = '2025/2026', term = 1, } = req.body;
    const validTypes = [
        'fee_collection',
        'outstanding_balances',
        'expense_breakdown',
        'payroll_summary',
    ];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }
    const downloadUrl = await (0, reportExportService_1.generateFinancialReport)(type, academicYear, Number(term));
    res.json({ downloadUrl });
});
// ── ADD route ─────────────────────────────────────────────
// POST /finances/reports/export
// Body: { type: "fee_collection"|"outstanding_balances"|"expense_breakdown"|"payroll_summary", academicYear, term }
exports.financesRouter.post('/reports/export', auth_1.verifyAuth, (0, auth_1.requireRole)(['admin', 'finance', 'high_rank']), async (req, res) => {
    const { type, academicYear = '2025/2026', term = 1, } = req.body;
    const validTypes = [
        'fee_collection',
        'outstanding_balances',
        'expense_breakdown',
        'payroll_summary',
    ];
    if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }
    const downloadUrl = await (0, reportExportService_1.generateFinancialReport)(type, academicYear, Number(term));
    res.json({ downloadUrl });
});
//# sourceMappingURL=finances.js.map