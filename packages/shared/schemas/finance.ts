/**
 * packages/shared/schemas/finance.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]: Foundation for the Invoice Entry & Allocation / Bulk Invoice
 *   Generator / Finance Fee Structure / Settings & Fee Catalog / Student
 *   Portal Statement redesign (see apps/web/prisma/schema.prisma's
 *   2026-09-05 schema extension for the matching data-model change):
 *     1. PaymentMethodSchema gains AIRTEL_MONEY / TNM_MPAMBA / POS_CARD.
 *     2. FeeCategorySchema / FeeScheduleSchema / FeeCommitmentStatusSchema
 *        — new enums matching the Prisma additions of the same name.
 *     3. CreateFeeStructureSchema now validates the full fee-catalog shape
 *        (code, category, mandatory, schedule, description) instead of
 *        just name/amount/classId/academicYear/term.
 *     4. UpdateFeeStructureSchema — partial update, used both for editing
 *        a catalog entry's rate/metadata and for the archive/restore
 *        toggle (isActive).
 *     5. CreateStudentFeeCommitmentSchema / UpdateStudentFeeCommitmentSchema
 *        — the Finance Fee Structure workstation's "Edit Add-on
 *        Commitments" action.
 *     6. BulkGenerateInvoicesSchema — formalises what the Bulk Invoice
 *        Generator actually submits (previously the route accepted raw,
 *        unvalidated req.body fields — see finances.ts's POST
 *        /invoices/bulk-generate). The four accounting-rule checkboxes on
 *        that screen (mandatory levies / enrolled optional services /
 *        scholarship & staff discounts / prior advance credit) map
 *        directly to boolean options here; "carry forward prior arrears"
 *        is a report-only figure (each term's Invoice is its own row —
 *        see bulkInvoiceService.ts) and is not one of these flags.
 *     7. AddInvoiceLineItemSchema — lets the bursar append one more fee
 *        type to an EXISTING invoice (the Invoice Entry screen's "+ Add a
 *        line" affordance when a student already has an invoice this
 *        term), distinct from GenerateInvoiceSchema which only applies to
 *        an invoice's initial creation.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (FeeCategory, FeeSchedule,
 *   FeeCommitmentStatus, PaymentMethod, FeeStructure.code/category/
 *   mandatory/schedule/description, StudentFeeCommitment)
 */
import { z } from 'zod'

export const PaymentMethodSchema = z.enum([
  'CASH',
  'BANK_TRANSFER',
  'MOBILE_MONEY',
  'CHEQUE',
  'AIRTEL_MONEY',
  'TNM_MPAMBA',
  'POS_CARD',
])

export const ExpenseCategorySchema = z.enum([
  'SALARIES',
  'UTILITIES',
  'MAINTENANCE',
  'PROCUREMENT',
  'LIBRARY',
  'TRANSPORT',
  'MISCELLANEOUS',
])

// ─── FEE CATALOG ──────────────────────────────────────────
export const FeeCategorySchema = z.enum([
  'TUITION',
  'TRANSPORT',
  'UNIFORM',
  'BOARDING',
  'LEVY',
  'ACTIVITY',
  'OTHER',
])

export const FeeScheduleSchema = z.enum(['PER_TERM', 'ANNUAL', 'ONE_TIME'])

export const FeeCommitmentStatusSchema = z.enum(['COMMITTED', 'WAIVED'])

// [PRODUCTION FIX] Full rewrite — previously just name/amount/classId/
// academicYear/term. The Settings & Fee Catalog screen needs the full
// accounting-metadata shape: a stable code, a category for grouping/
// badges, whether it's mandatory or an optional enrolled add-on, and its
// billing schedule. `code` is validated as uppercase-alnum-plus-hyphen so
// it reads consistently in tables ("TUI-01") regardless of how it was
// typed.
export const CreateFeeStructureSchema = z.object({
  name: z.string().min(1),
  code: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, and hyphens only')
    .transform((v) => v.toUpperCase()),
  category: FeeCategorySchema,
  amount: z.number().positive('Amount must be positive'),
  mandatory: z.boolean(),
  schedule: FeeScheduleSchema,
  description: z.string().max(500).optional(),
  classId: z.string().optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  term: z.number().int().min(1).max(3).optional(),
})

// Partial update — every field optional, plus the archive/restore toggle.
// A fee's `code`/`academicYear` pairing is what invoices already reference
// by name at generation time (InvoiceLineItem.feeStructureId is kept for
// reference only — see schema.prisma), so archiving never touches
// existing invoices or line items; it only removes the entry from new
// line-item pickers (feeService's active-only queries).
export const UpdateFeeStructureSchema = z.object({
  name: z.string().min(1).optional(),
  code: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers, and hyphens only')
    .transform((v) => v.toUpperCase())
    .optional(),
  category: FeeCategorySchema.optional(),
  amount: z.number().positive('Amount must be positive').optional(),
  mandatory: z.boolean().optional(),
  schedule: FeeScheduleSchema.optional(),
  description: z.string().max(500).optional(),
  classId: z.string().nullable().optional(),
  term: z.number().int().min(1).max(3).nullable().optional(),
  isActive: z.boolean().optional(),
})

// ─── STUDENT FEE COMMITMENTS (enrolled add-ons) ──────────
// A student opting into (or being waived from) an OPTIONAL fee type for a
// given academic year — see StudentFeeCommitment in schema.prisma. Only
// meaningful for a `mandatory: false` FeeStructure; mandatory fees apply
// to every student in the relevant class/term automatically and never
// need a commitment row.
export const CreateStudentFeeCommitmentSchema = z.object({
  studentId: z.string().min(1),
  feeStructureId: z.string().min(1),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  notes: z.string().max(300).optional(),
})

export const UpdateStudentFeeCommitmentSchema = z.object({
  status: FeeCommitmentStatusSchema,
  notes: z.string().max(300).optional(),
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

// [NEW] Append one more fee type to an EXISTING invoice — the Invoice
// Entry screen's "+ Add a line" affordance for a student who already has
// an invoice this term (e.g. they join Transport partway through the
// term). Distinct from GenerateInvoiceSchema, which only ever applies at
// an invoice's initial creation. See feeService.addInvoiceLineItem().
export const AddInvoiceLineItemSchema = z.object({
  invoiceId: z.string().min(1),
  feeStructureId: z.string().min(1),
})

// ─── BULK INVOICE GENERATOR ──────────────────────────────
// [NEW] Formalises the Bulk Invoice Generator's batch-run request — see
// bulkInvoiceService.bulkGenerateInvoices(). Each boolean option maps
// directly to one of the screen's "Accounting Rules & Fee Automation"
// checkboxes; `studentIds` narrows the run to the roster rows the person
// actually left checked in the dry-run preview (omit to run against every
// eligible student in the chosen cohort).
export const BulkGenerateInvoicesSchema = z.object({
  classId: z.union([z.literal('ALL'), z.string().min(1)]),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/),
  term: z.number().int().min(1).max(3),
  includeMandatory: z.boolean().default(true),
  includeEnrolledOptional: z.boolean().default(true),
  applyScholarships: z.boolean().default(true),
  consumeAdvanceCredit: z.boolean().default(true),
  studentIds: z.array(z.string().min(1)).optional(),
  // true = compute and return the roster preview (projected totals,
  // scholarship/credit/arrears figures) without creating anything --
  // the "PRE-EXECUTION DRY RUN ROSTER" step. false = actually create the
  // invoices. See bulkInvoiceService.bulkGenerateInvoices().
  dryRun: z.boolean().default(false),
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
export type AddInvoiceLineItemInput = z.infer<typeof AddInvoiceLineItemSchema>
export type BulkGenerateInvoicesInput = z.infer<typeof BulkGenerateInvoicesSchema>
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>
export type CreateFeeStructureInput = z.infer<typeof CreateFeeStructureSchema>
export type UpdateFeeStructureInput = z.infer<typeof UpdateFeeStructureSchema>
export type CreateStudentFeeCommitmentInput = z.infer<typeof CreateStudentFeeCommitmentSchema>
export type UpdateStudentFeeCommitmentInput = z.infer<typeof UpdateStudentFeeCommitmentSchema>
export type CreateScholarshipInput = z.infer<typeof CreateScholarshipSchema>
export type CreateBudgetInput = z.infer<typeof CreateBudgetSchema>
export type CreateInstallmentPlanInput = z.infer<typeof CreateInstallmentPlanSchema>
export type CreateLibraryFineInput = z.infer<typeof CreateLibraryFineSchema>
