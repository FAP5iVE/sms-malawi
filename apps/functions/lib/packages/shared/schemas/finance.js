"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateBudgetSchema = exports.CreateScholarshipSchema = exports.CreateExpenseSchema = exports.GenerateInvoiceSchema = exports.RecordPaymentSchema = exports.CreateFeeStructureSchema = exports.ExpenseCategorySchema = exports.PaymentMethodSchema = void 0;
const zod_1 = require("zod");
exports.PaymentMethodSchema = zod_1.z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE']);
exports.ExpenseCategorySchema = zod_1.z.enum([
    'SALARIES',
    'UTILITIES',
    'MAINTENANCE',
    'PROCUREMENT',
    'LIBRARY',
    'TRANSPORT',
    'MISCELLANEOUS',
]);
// ─── FEE STRUCTURE ───────────────────────────────────────
exports.CreateFeeStructureSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive('Amount must be positive'),
    classId: zod_1.z.string().optional(),
    academicYear: zod_1.z.string().regex(/^\d{4}\/\d{4}$/),
    term: zod_1.z.number().int().min(1).max(3).optional(),
});
// ─── RECORD PAYMENT ──────────────────────────────────────
exports.RecordPaymentSchema = zod_1.z.object({
    invoiceId: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive('Amount must be positive'),
    method: exports.PaymentMethodSchema,
    reference: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
// ─── GENERATE INVOICE ────────────────────────────────────
exports.GenerateInvoiceSchema = zod_1.z.object({
    studentId: zod_1.z.string().min(1),
    academicYear: zod_1.z.string().regex(/^\d{4}\/\d{4}$/),
    term: zod_1.z.number().int().min(1).max(3),
    dueDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
// ─── EXPENSE ─────────────────────────────────────────────
exports.CreateExpenseSchema = zod_1.z.object({
    category: exports.ExpenseCategorySchema,
    description: zod_1.z.string().min(1),
    amount: zod_1.z.number().positive(),
    academicYear: zod_1.z.string().regex(/^\d{4}\/\d{4}$/),
    term: zod_1.z.number().int().min(1).max(3),
    incurredAt: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
// ─── SCHOLARSHIP ─────────────────────────────────────────
exports.CreateScholarshipSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    studentId: zod_1.z.string().min(1),
    discountType: zod_1.z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
    value: zod_1.z.number().positive(),
    academicYear: zod_1.z.string().regex(/^\d{4}\/\d{4}$/),
    notes: zod_1.z.string().optional(),
});
// ─── BUDGET ──────────────────────────────────────────────
exports.CreateBudgetSchema = zod_1.z.object({
    academicYear: zod_1.z.string().regex(/^\d{4}\/\d{4}$/),
    term: zod_1.z.number().int().min(1).max(3).optional(),
    department: zod_1.z.string().min(1),
    category: zod_1.z.string().min(1),
    allocated: zod_1.z.number().positive(),
    description: zod_1.z.string().optional(),
});
//# sourceMappingURL=finance.js.map