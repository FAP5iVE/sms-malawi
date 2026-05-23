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

// ─── BUDGET ──────────────────────────────────────────────
export const CreateBudgetSchema = z.object({
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  term: z.number().int().min(1).max(3).optional(),
  department: z.string().min(1),
  category: z.string().min(1),
  allocated: z.number().positive(),
  description: z.string().optional(),
})

// ─── INFERRED TYPES ──────────────────────────────────────
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>
export type GenerateInvoiceInput = z.infer<typeof GenerateInvoiceSchema>
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>
export type CreateScholarshipInput = z.infer<typeof CreateScholarshipSchema>
export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>
