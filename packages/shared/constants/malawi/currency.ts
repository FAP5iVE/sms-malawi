/**
 * [CHANGE TYPE]: NEW FILE (extracted from malawi.ts)
 * [FILE]: packages/shared/constants/malawi/currency.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Malawian Kwacha currency formatting. formatMWK is retained
 *   verbatim from malawi.ts (its ~18 consumers reach it unchanged through the
 *   preserved @shared/constants/malawi barrel); adds the CURRENCY_CODE /
 *   CURRENCY_SYMBOL constants so no consumer re-hardcodes 'MWK'/'MK'.
 * [DEPENDS ON]: none
 */

export const CURRENCY_CODE = 'MWK' as const
export const CURRENCY_SYMBOL = 'MK' as const

// ─── MWK CURRENCY FORMATTER ──────────────────────────────
export function formatMWK(amount: number): string {
  return new Intl.NumberFormat('en-MW', {
    style: 'currency',
    currency: CURRENCY_CODE,
    minimumFractionDigits: 2,
  }).format(amount)
}
