/**
 * [CHANGE TYPE]: TARGETED EDIT (2026-09-05 addition, below the original
 *   PAYE/pension content — nothing above this file's original R16 section
 *   changed)
 * [FILE]: packages/shared/constants/malawi/finance.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan); 2026-09-05 —
 *   Invoice Entry & Allocation / Bulk Invoice Generator / Finance Fee
 *   Structure / Settings & Fee Catalog / Student Portal Statement redesign
 * [PURPOSE]: Original — single source of truth for Malawi statutory
 *   payroll/finance figures, resolving three independent copies of the same
 *   PAYE data (S/types/settings.ts's inline DEFAULT_PAYE_BRACKETS,
 *   payrollService.ts's R10 inline brackets, and this file).
 *   DEFAULT_PAYE_BRACKETS is versioned with source / effectiveFrom /
 *   lastVerified fields — an explicit staleness marker absent from every
 *   earlier copy. S/types/settings.ts now imports
 *   DEFAULT_PAYE_BRACKETS.brackets as its SETTING_META default rather than
 *   defining its own array.
 *   2026-09-05 addition — this is the finance-domain constants file, so the
 *   new FeeCategory/FeeSchedule/PaymentMethod display labels and the
 *   invoice-number formatter belong here rather than a new top-level file
 *   (avoiding a second, competing "finance constants" module).
 * [DEPENDS ON]: @shared/types/settings (PayeBracket — TYPE ONLY, erased at
 *   compile; no runtime import cycle: settings.ts imports this file's value,
 *   this file imports only settings.ts's type). 2026-09-05 addition also
 *   depends on @shared/schemas/finance (FeeCategorySchema/FeeScheduleSchema/
 *   PaymentMethodSchema — TYPE ONLY, same no-runtime-cycle reasoning).
 */
import type { PayeBracket } from '../../types/settings'

/**
 * Malawi PAYE (Pay As You Earn) income-tax schedule, applied to ANNUAL gross
 * salary in MWK. Marginal (bracket-by-bracket) taxation — see
 * payrollService.ts's calculateMonthlyPAYE(). Versioned so a stale schedule
 * is visible rather than silent.
 */
export const DEFAULT_PAYE_BRACKETS: {
  brackets: PayeBracket[]
  source: string
  effectiveFrom: string
  lastVerified: string
} = {
  brackets: [
    {
      minAnnualMwk: 0,
      maxAnnualMwk: 1_200_000,
      ratePercent: 0,
      label: 'Tax-free band (0 – MWK 1,200,000)',
    },
    {
      minAnnualMwk: 1_200_001,
      maxAnnualMwk: 2_400_000,
      ratePercent: 25,
      label: '25% band (MWK 1,200,001 – 2,400,000)',
    },
    {
      minAnnualMwk: 2_400_001,
      maxAnnualMwk: null,
      ratePercent: 30,
      label: '30% band (above MWK 2,400,000)',
    },
  ],
  source: 'Malawi Revenue Authority',
  effectiveFrom: '2024-04-01',
  lastVerified: '2026-01-01',
}

/** Employee pension contribution as a decimal fraction of gross salary
 *  (0.05 = 5%). The equivalent whole-number percent lives in
 *  SETTING_KEYS.FINANCE_PENSION_PERCENT (admin-configurable). */
export const PENSION_RATE = 0.05

/** Default late-payment penalty as a decimal fraction (0.05 = 5%). Resolves
 *  the 0.05-vs-'5' decimal/percent-string unit mismatch that existed between
 *  latePenaltiesJob.ts/feeService.ts (decimal) and FinanceSettings.tsx's
 *  setting default (string). Canonical unit is a decimal fraction. */
export const LATE_PAYMENT_PENALTY_DEFAULT = 0.05

// [ADDITION 2026-09-05] Fee-catalog display metadata and payment-mode
// labels for the Invoice Entry & Allocation / Bulk Invoice Generator /
// Finance Fee Structure / Settings & Fee Catalog / Student Portal
// Statement screens — see FeeCategory/FeeSchedule/PaymentMethod in
// schema.prisma. Pure display strings + one formatter each, following
// generateRegistrationNo()'s pattern in ./registration for the invoice
// number: the actual "find the next free sequence" logic stays server-side
// (studentService.ts's nextRegistrationNo() equivalent, for invoices, is
// invoiceNumberService.ts) — this file only knows how to format a
// year+sequence pair once one has been chosen.
import type { FeeCategorySchema, FeeScheduleSchema, PaymentMethodSchema } from '../../schemas/finance'
import type { z } from 'zod'

type FeeCategory = z.infer<typeof FeeCategorySchema>
type FeeSchedule = z.infer<typeof FeeScheduleSchema>
type PaymentMethod = z.infer<typeof PaymentMethodSchema>

// ─── INVOICE NUMBER FORMATTER ────────────────────────────
export function generateInvoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(4, '0')}`
}

// ─── FEE CATEGORY ─────────────────────────────────────────
export const FEE_CATEGORY_LABELS: Record<FeeCategory, string> = {
  TUITION: 'Tuition',
  TRANSPORT: 'Transport',
  UNIFORM: 'Uniform',
  BOARDING: 'Boarding',
  LEVY: 'Levy',
  ACTIVITY: 'Activity',
  OTHER: 'Other',
}

export const FEE_CATEGORY_OPTIONS = (Object.keys(FEE_CATEGORY_LABELS) as FeeCategory[]).map((value) => ({
  value,
  label: FEE_CATEGORY_LABELS[value],
}))

// ─── FEE SCHEDULE ─────────────────────────────────────────
export const FEE_SCHEDULE_LABELS: Record<FeeSchedule, string> = {
  PER_TERM: 'Per Term',
  ANNUAL: 'Annual',
  ONE_TIME: 'One-Time',
}

export const FEE_SCHEDULE_OPTIONS = (Object.keys(FEE_SCHEDULE_LABELS) as FeeSchedule[]).map((value) => ({
  value,
  label: FEE_SCHEDULE_LABELS[value],
}))

/** "Mandatory • Per Term" / "Optional • One-Time" — the status+schedule
 *  badge text used across the Fee Catalog, Finance Fee Structure, and
 *  Invoice Entry screens. */
export function formatFeeScheduleBadge(mandatory: boolean, schedule: FeeSchedule): string {
  return `${mandatory ? 'Mandatory' : 'Optional'} \u2022 ${FEE_SCHEDULE_LABELS[schedule]}`
}

// ─── PAYMENT METHOD ───────────────────────────────────────
// MOBILE_MONEY is a legacy value (existing Payment rows only) — deliberately
// excluded from SELECTABLE_PAYMENT_METHODS so new entries always pick the
// specific network (Airtel Money / TNM Mpamba) instead of the old generic
// bucket, while PAYMENT_METHOD_LABELS still renders it correctly wherever a
// historic payment is displayed.
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Deposit / Transfer',
  MOBILE_MONEY: 'Mobile Money',
  CHEQUE: 'Cheque',
  AIRTEL_MONEY: 'Airtel Money',
  TNM_MPAMBA: 'TNM Mpamba',
  POS_CARD: 'POS / Card',
}

export const SELECTABLE_PAYMENT_METHODS: PaymentMethod[] = [
  'BANK_TRANSFER',
  'AIRTEL_MONEY',
  'TNM_MPAMBA',
  'CASH',
  'CHEQUE',
  'POS_CARD',
]

export const PAYMENT_METHOD_OPTIONS = SELECTABLE_PAYMENT_METHODS.map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}))
