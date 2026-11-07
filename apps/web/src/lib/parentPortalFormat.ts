/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/lib/parentPortalFormat.ts
 * [PHASE]: Guardian Portal — parent UI (T7c)
 * [PURPOSE]: Pure display helpers for the parent portal: money, term and date text, status
 *   wording, the attendance rate, and which sections of a child a guardian may open.
 *   Kept free of React so the places a parent could be misled (a wrong balance, a rate that
 *   counts the wrong thing, a section offered that the server will refuse) are unit-tested.
 * [DEPENDS ON]: @shared/constants/guardianPortal (GuardianCapability)
 */
import type { GuardianCapability } from '@shared/constants/guardianPortal'

/** "MK 150,000" (whole kwacha) or "MK 1,250.50"; "—" when unknown. Negative reads "-MK 500". */
export function formatMwk(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—'
  const whole = Number.isInteger(amount)
  const [int, frac] = Math.abs(amount).toFixed(whole ? 0 : 2).split('.')
  const grouped = int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${amount < 0 ? '-' : ''}MK ${grouped}${frac ? `.${frac}` : ''}`
}

/** "Term 2, 2026". */
export function termLabel(academicYear: string | null, term: number | null): string {
  if (term !== null && academicYear) return `Term ${term}, ${academicYear}`
  if (term !== null) return `Term ${term}`
  return academicYear ?? 'Term'
}

/** "07 Nov 2026". UTC, because the API sends calendar days at UTC midnight. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** "AIRTEL_MONEY" → "Airtel Money": a readable fallback for a code with no wording of its own. */
export function humanize(code: string): string {
  return code.toLowerCase().split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const PAYMENT_METHODS: Readonly<Record<string, string>> = {
  CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', MOBILE_MONEY: 'Mobile money', CHEQUE: 'Cheque',
  AIRTEL_MONEY: 'Airtel Money', TNM_MPAMBA: 'TNM Mpamba', POS_CARD: 'Card',
}
export function paymentMethodLabel(method: string | null): string {
  return method ? (PAYMENT_METHODS[method] ?? humanize(method)) : ''
}

const INVOICE_STATUSES: Readonly<Record<string, string>> = { UNPAID: 'Unpaid', PARTIAL: 'Part paid', PAID: 'Paid', OVERDUE: 'Overdue' }
export function invoiceStatusLabel(status: string | null): string {
  return status ? (INVOICE_STATUSES[status] ?? humanize(status)) : ''
}
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral'
export function invoiceStatusTone(status: string | null): StatusTone {
  return status === 'PAID' ? 'success' : status === 'OVERDUE' ? 'danger' : status === 'UNPAID' || status === 'PARTIAL' ? 'warning' : 'neutral'
}

const ATTENDANCE: Readonly<Record<string, string>> = { PRESENT: 'Present', ABSENT: 'Absent', LATE: 'Late' }
export function attendanceLabel(status: string | null): string {
  return status ? (ATTENDANCE[status] ?? humanize(status)) : ''
}
export function attendanceTone(status: string | null): StatusTone {
  return status === 'PRESENT' ? 'success' : status === 'LATE' ? 'warning' : status === 'ABSENT' ? 'danger' : 'neutral'
}

export interface AttendanceFigures { present: number; late: number; absent: number; other: number; total: number; attendedPercent: number | null }

/**
 * Counts for the recorded window. "Attended" means present OR late: a child who arrived late
 * was at school. The rate is null when nothing is recorded, never 0% (which would read as
 * "never attends").
 */
export function attendanceFigures(summary: { windowSize: number; byStatus: Record<string, number> }): AttendanceFigures {
  const n = (k: string) => Math.max(0, Math.trunc(summary.byStatus[k] ?? 0))
  const present = n('PRESENT'), late = n('LATE'), absent = n('ABSENT')
  const total = Math.max(0, Math.trunc(summary.windowSize))
  const other = Math.max(0, total - present - late - absent)
  return { present, late, absent, other, total, attendedPercent: total === 0 ? null : Math.round(((present + late) / total) * 100) }
}

export function percentText(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${value}%`
}

/** An empty grade string (Forms 3–4 have no overall grade) is "no grade", not a blank cell. */
export function gradeText(grade: string | null | undefined): string | null {
  return grade && grade.trim() !== '' ? grade : null
}

export function childName(c: { firstName: string | null; lastName: string | null }): string {
  return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Student'
}

export type ParentSection = 'results' | 'fees' | 'attendance'
export const PARENT_SECTIONS: readonly ParentSection[] = ['results', 'fees', 'attendance']
export const PARENT_SECTION_LABELS: Readonly<Record<ParentSection, string>> = { results: 'Results', fees: 'Fees', attendance: 'Attendance' }

/**
 * The sections to offer for a child, in display order. Only those the guardian was granted,
 * and none for a student who is no longer enrolled (the server refuses those with a 404, so
 * offering them would only produce an error).
 */
export function availableSections(capabilities: readonly GuardianCapability[], enrolled: boolean): ParentSection[] {
  if (!enrolled) return []
  return PARENT_SECTIONS.filter((s) => capabilities.includes(s))
}
