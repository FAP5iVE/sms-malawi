/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/constants/malawi/finance.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Single source of truth for Malawi statutory payroll/finance
 *   figures, resolving three independent copies of the same PAYE data
 *   (S/types/settings.ts's inline DEFAULT_PAYE_BRACKETS, payrollService.ts's
 *   R10 inline brackets, and this file). DEFAULT_PAYE_BRACKETS is versioned
 *   with source / effectiveFrom / lastVerified fields — an explicit staleness
 *   marker absent from every earlier copy. S/types/settings.ts now imports
 *   DEFAULT_PAYE_BRACKETS.brackets as its SETTING_META default rather than
 *   defining its own array.
 * [DEPENDS ON]: @shared/types/settings (PayeBracket — TYPE ONLY, erased at
 *   compile; no runtime import cycle: settings.ts imports this file's value,
 *   this file imports only settings.ts's type)
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
