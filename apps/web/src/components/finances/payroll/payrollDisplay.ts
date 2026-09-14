/**
 * apps/web/src/components/finances/payroll/payrollDisplay.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Shared display helpers for the Payroll Runs & Approvals /
 *   Salary Structure & Allowances / My Pay (Self-Service) / Financial
 *   Insights & Trends / PAYE & Pension Settings tabs (user-requested
 *   redesign). The real PayrollRun.status lifecycle
 *   (payrollApprovalService.ts) is PROCESSING → COMPLETED →
 *   PENDING_APPROVAL → APPROVED → LOCKED, with rollback returning a LOCKED
 *   run to PENDING_APPROVAL rather than a distinct status. STATUS_META maps
 *   that real, unmodified lifecycle onto the workflow-stepper and
 *   history-badge language from the reference design ("Calculated (Draft)",
 *   "Approved by Head", "Locked & Posted") — no new statuses were invented
 *   to match the design; only how each existing one is labelled.
 * [DEPENDS ON]: S/types/api.ts's ApiPayrollRun.status (payrollApprovalService.ts's PayrollStatus enum)
 */

export type PayrollStatus = 'PROCESSING' | 'COMPLETED' | 'PENDING_APPROVAL' | 'APPROVED' | 'LOCKED' | 'FAILED'

export const WORKFLOW_STEPS = [
  { key: 'COMPLETED',         step: 1, label: 'Calculated',      sublabel: 'Salaries & taxes computed' },
  { key: 'PENDING_APPROVAL',  step: 2, label: 'Submitted',       sublabel: 'Awaiting approval' },
  { key: 'APPROVED',          step: 3, label: 'Approved',        sublabel: 'Requires High Rank' },
  { key: 'LOCKED',            step: 4, label: 'Locked & Posted', sublabel: 'Journal entry posted' },
] as const

interface StatusMeta {
  /** History-table / current-cycle status text. */
  badge: string
  /** [PRODUCTION FIX, user-requested] Was a `bg-X/10 text-X` pill —
   *  changed to a plain colored-text treatment (no background highlight),
   *  per feedback that the fill looked heavy in the table. This is a fixed
   *  lookup keyed by the six real PayrollRun.status values from the
   *  database (payrollApprovalService.ts's PayrollStatus enum) — yes,
   *  intentionally hardcoded: there are exactly six possible statuses,
   *  they never change at runtime, and there's nothing here that should be
   *  admin-configurable, so a static map is the correct (not a shortcut)
   *  way to render them consistently everywhere this file is used.
   *  Two of the previous colors (text-sky-700, text-emerald-700) were raw,
   *  non-theme-aware Tailwind shades with no .dark override anywhere in
   *  globals.css — chosen for contrast against a light background, so on
   *  the actual dark theme (which redefines --brand-navy/-teal/-amber/
   *  -coral specifically to stay legible on a near-black background — see
   *  globals.css's own "Never use the same navy as light mode — it
   *  disappears on dark bg" comment) they read as dim, low-contrast text.
   *  Every status below now uses only the four theme-aware brand-* tokens,
   *  which already have correct light/dark HSL values defined, so no new
   *  dark: overrides are needed here — the same class works in both modes. */
  textClassName: string
  /** Which workflow step (1-4) this status corresponds to, for the stepper's
   *  "current" highlight. PROCESSING/FAILED aren't real steps in the 4-stage
   *  workflow — they render the stepper with nothing marked current instead. */
  step: number | null
}

const STATUS_META: Record<PayrollStatus, StatusMeta> = {
  PROCESSING:       { badge: 'Processing…',        textClassName: 'text-brand-amber', step: null },
  COMPLETED:        { badge: 'Calculated (Draft)',  textClassName: 'text-brand-navy',  step: 1 },
  PENDING_APPROVAL: { badge: 'Submitted',           textClassName: 'text-brand-amber', step: 2 },
  APPROVED:         { badge: 'Approved by Head',    textClassName: 'text-brand-teal',  step: 3 },
  LOCKED:           { badge: 'Locked & Posted',     textClassName: 'text-brand-teal',  step: 4 },
  FAILED:           { badge: 'Failed',              textClassName: 'text-brand-coral', step: null },
}

export function getStatusMeta(status: string): StatusMeta {
  return STATUS_META[status as PayrollStatus] ?? { badge: status, textClassName: 'text-muted', step: null }
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function formatRunPeriod(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? month} ${year}`
}

export function formatRunPeriodShort(month: number, year: number): string {
  return `${(MONTH_NAMES[month - 1] ?? String(month)).slice(0, 3)} ${year}`
}

export function formatWindowDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-MW', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Compact axis/label formatter for large MWK figures — e.g. 19,820,000 → "19.8M". */
export function formatCompactMWK(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(Math.round(v))
}
