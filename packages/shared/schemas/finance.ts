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
// [PRODUCTION FIX] A payment now allocates across the invoice's fee-type
// line items instead of being one undifferentiated amount against the
// whole invoice -- see InvoiceLineItem/PaymentAllocation/StudentCredit in
// schema.prisma and feeService.recordPayment() for the full accounting
// model this supports (per-fee-type balances, and overpayment on any one
// fee type becoming a credit rather than an invalid negative balance).
export const PaymentAllocationSchema = z.object({
  lineItemId: z.string().min(1),
  amount: z.number().positive('Allocation amount must be positive'),
})

export const RecordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive('Amount must be positive'),
  method: PaymentMethodSchema,
  reference: z.string().optional(),
  notes: z.string().optional(),
  allocations: z.array(PaymentAllocationSchema).min(1, 'Allocate this payment to at least one fee.'),
  // Set true only on a resubmission after the user has seen and confirmed
  // an overpayment warning (see feeService.recordPayment()'s
  // OverpaymentConfirmationRequired error) -- the first submission always
  // omits or leaves this false so the warning is never silently skipped.
  confirmOverpayment: z.boolean().optional().default(false),
})

// ─── GENERATE INVOICE ────────────────────────────────────
// [PRODUCTION FIX] Replaced the old single-lump-sum model -- an invoice now
// covers one or more specific fee types (School Fee, Transport, Uniform,
// ...), each sourced from an actual active FeeStructure row rather than
// blindly summing every fee structure that happens to apply to the
// student's class/term. dueDate removed entirely: it was a free-typed date
// with no real meaning in this system (no per-invoice payment terms are
// negotiated) -- feeService.generateInvoice() now sets it automatically
// (net-30 from generation) rather than asking for a manual, arbitrary value.
export const GenerateInvoiceSchema = z.object({
  studentId: z.string().min(1),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  term: z.number().int().min(1).max(3),
  feeStructureIds: z.array(z.string().min(1)).min(1, 'Select at least one fee type.'),
  // Manual, additional discount on top of whatever an active scholarship
  // already applies -- for one-off cases (a hardship waiver, a goodwill
  // adjustment) that aren't modeled as a Scholarship record.
  // feeService.generateInvoice() adds it to the scholarship discount if
  // both are present, and distributes the total discount proportionally
  // across the selected fee types' line items.
  manualDiscount: z.number().min(0).optional(),
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
export type PaymentAllocationInput = z.infer<typeof PaymentAllocationSchema>
export type GenerateInvoiceInput = z.infer<typeof GenerateInvoiceSchema>
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>
export type CreateFeeStructureInput = z.infer<typeof CreateFeeStructureSchema>
export type CreateScholarshipInput = z.infer<typeof CreateScholarshipSchema>
export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>
export type CreateInstallmentPlanInput = z.infer<typeof CreateInstallmentPlanSchema>
export type CreateLibraryFineInput = z.infer<typeof CreateLibraryFineSchema>