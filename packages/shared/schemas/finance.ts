/**
 * packages/shared/schemas/finance.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R14 — Analytics & Reports Domain
 * [PURPOSE]: CreateBudgetSchema.category was `z.string().min(1)` — free
 *   text — while Expense.category has always been the ExpenseCategory
 *   enum. The two are the join key that
 *   analyticsService.getFinanceBudgetVsActual() relies on, so an
 *   unconstrained Budget.category meant that join never matched and the
 *   report silently fell back to the stale cached Budget.spent column.
 *   R14 constrains Budget.category to ExpenseCategory in schema.prisma;
 *   this schema is the request-validation half of the same fix, so an
 *   off-enum category can no longer be written in the first place.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (Budget.category enum)
 */
import { z } from 'zod'

export const PaymentMethodSchema = z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE'])

export const ExpenseCategorySchema = z.enum([
  'SALARIES',
  'UTILITIES',
  'MAINTENANCE',
  'PROCUREMENT',
  'LIBRARY',
  'TRANSPORT',
  'MISCELLANEOUS',
])

// ─── FEE STRUCTURE ───────────────────────────────────────
export const CreateFeeStructureSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive('Amount must be positive'),
  classId: z.string().optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  term: z.number().int().min(1).max(3).optional(),
})

// ─── RECORD PAYMENT ──────────────────────────────────────
export const RecordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive('Amount must be positive'),
  method: PaymentMethodSchema,
  reference: z.string().optional(),
  notes: z.string().optional(),
})

// ─── GENERATE INVOICE ────────────────────────────────────
export const GenerateInvoiceSchema = z.object({
  studentId: z.string().min(1),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  term: z.number().int().min(1).max(3),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// ─── EXPENSE ─────────────────────────────────────────────
export const CreateExpenseSchema = z.object({
  category: ExpenseCategorySchema,
  description: z.string().min(1),
  amount: z.number().positive(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  term: z.number().int().min(1).max(3),
  incurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// ─── SCHOLARSHIP ─────────────────────────────────────────
export const CreateScholarshipSchema = z.object({
  name: z.string().min(1),
  studentId: z.string().min(1),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
  value: z.number().positive(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  notes: z.string().optional(),
})

// ─── INSTALLMENT PLAN ────────────────────────────────────
export const InstallmentFrequencySchema = z.enum(['MONTHLY', 'TERM_WISE'])

export const CreateInstallmentPlanSchema = z.object({
  frequency: InstallmentFrequencySchema,
  count: z.number().int().min(1, 'count must be at least 1'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// ─── BUDGET ──────────────────────────────────────────────
export const CreateBudgetSchema = z.object({
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  term: z.number().int().min(1).max(3).optional(),
  department: z.string().min(1),
  // [R14] Was z.string().min(1) — free text, accepting any value at all.
  // Prisma's Budget.category is now the ExpenseCategory enum (the same one
  // Expense.category has always used), so this schema must validate against
  // it too: a budget whose category is not a real ExpenseCategory member can
  // never join to an expense, which is exactly the defect R14 fixes.
  category: ExpenseCategorySchema,
  allocated: z.number().positive(),
  description: z.string().optional(),
})

// ─── LIBRARY FINE ────────────────────────────────────────
export const CreateLibraryFineSchema = z.object({
  studentId: z.string().min(1),
  bookTitle: z.string().min(1),
  amount: z.number().positive(),
  reason: z.string().min(1),
})

// ─── INFERRED TYPES ──────────────────────────────────────
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>
export type GenerateInvoiceInput = z.infer<typeof GenerateInvoiceSchema>
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>
export type CreateFeeStructureInput = z.infer<typeof CreateFeeStructureSchema>
export type CreateScholarshipInput = z.infer<typeof CreateScholarshipSchema>
export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>
export type CreateInstallmentPlanInput = z.infer<typeof CreateInstallmentPlanSchema>
export type CreateLibraryFineInput = z.infer<typeof CreateLibraryFineSchema>