/**
 * apps/web/src/lib/hills/chip.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 8b-1 follow-up, RULEBOOK R2.7)
 * [PURPOSE]: ONE look for a selectable filter chip. A chip is a CONTROL, so it keeps a
 *   border, but it uses the same corner radius as buttons and inputs (rounded-xl) and
 *   NOT a full pill, so it can never be mistaken for the status pills the theme removed
 *   (R2.1). Selected = filled brand pair (same pair as primary buttons, contrast proven
 *   in tools/hills/check-contrast.mts); not selected = outline. The selected state
 *   differs by fill and weight, not by hue alone. 44px tap target (R10).
 *   Callers keep their own aria-pressed and onClick; this file is class text only.
 */

export const CHIP = 'inline-flex items-center justify-center min-h-11 px-3.5 rounded-xl text-sm font-medium border transition-colors'
export const CHIP_ON = 'bg-btn-brand text-btn-brand-fg border-brand-teal'
export const CHIP_OFF = 'border-base text-muted hover:text-body hover:bg-page'

/** Class text for one chip. */
export function chipClass(selected: boolean): string {
  return `${CHIP} ${selected ? CHIP_ON : CHIP_OFF}`
}
