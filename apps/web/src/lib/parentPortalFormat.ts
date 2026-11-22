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

/** The Sun-Sat month grid the student's attendance page draws: blanks before day 1, then every day. */
export interface MonthGrid { leadingBlanks: number; days: { day: number; key: string }[] }
export function buildMonthGrid(year: number, monthIndex: number): MonthGrid {
  const count = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    leadingBlanks: new Date(Date.UTC(year, monthIndex, 1)).getUTCDay(),
    days: Array.from({ length: count }, (_, i) => ({ day: i + 1, key: `${year}-${pad(monthIndex + 1)}-${pad(i + 1)}` })),
  }
}

export function monthLabel(year: number, monthIndex: number): string {
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** yyyy-mm-dd -> status. Records are calendar days at UTC midnight, so the UTC date is the day. */
export function attendanceByDate(records: readonly { date: string | null; status: string | null }[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of records) if (r.date && r.status && /^\d{4}-\d{2}-\d{2}/.test(r.date)) out.set(r.date.slice(0, 10), r.status)
  return out
}

/** The next month would start in the future: the calendar's "next" button stops there. */
export function isFutureMonth(year: number, monthIndex: number, now: Date = new Date()): boolean {
  return Date.UTC(year, monthIndex, 1) > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
}

export function shiftMonth(year: number, monthIndex: number, by: number): { year: number; monthIndex: number } {
  const d = new Date(Date.UTC(year, monthIndex + by, 1))
  return { year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() }
}

const EXAM_TYPES: Readonly<Record<string, string>> = {
  WEEKLY_TEST: 'Weekly test', ASSIGNMENT: 'Assignment', QUIZ: 'Quiz', MIDTERM: 'Mid-term',
  END_TERM: 'End of term', MANEB_JCE: 'JCE (MANEB)', MANEB_MSCE: 'MSCE (MANEB)',
}
export function examTypeLabel(type: string): string { return EXAM_TYPES[type] ?? humanize(type) }
/** End-of-term exams open as the term's report card; every other exam opens its own detail. */
export function isEndTermExam(type: string): boolean { return type === 'END_TERM' }

/**
 * What tapping an exam does. An end-of-term exam IS the term's report card, so it opens that card
 * when the term has one; everything else (including an end-of-term exam whose card is not yet
 * available) opens the exam's own detail.
 */
export function examOpens(type: string, termHasReportCard: boolean): 'reportCard' | 'detail' {
  return isEndTermExam(type) && termHasReportCard ? 'reportCard' : 'detail'
}

/**
 * The headline result for a term, worded exactly as the student's own results screen words it:
 * "Points" for MSCE (Forms 3-4, the sum of the six best subjects, lower is better) and "Grade" for JCE.
 */
export function termHeadline(t: { gradingTrack: 'JCE' | 'MSCE' | null; aggregatePoints: number | null; grade: string | null }):
  { label: 'Points' | 'Grade'; value: string; hint: string } {
  if (t.gradingTrack === 'MSCE') {
    return {
      label: 'Points',
      value: t.aggregatePoints !== null ? String(t.aggregatePoints) : '—',
      hint: t.aggregatePoints !== null ? 'Aggregate of the six best subjects' : 'Needs six graded subjects',
    }
  }
  return { label: 'Grade', value: gradeText(t.grade) ?? '—', hint: 'Overall grade for the term' }
}

/** One auditable sentence, in the student view's words: the verdict and what it rests on. */
export function termVerdict(t: {
  term: number | null; passStatus: boolean | null; gradingTrack: 'JCE' | 'MSCE' | null; aggregatePoints: number | null
  grade: string | null; subjects: readonly { pass: boolean | null }[]
}): { passed: boolean; headline: string; detail: string } | null {
  if (t.passStatus === null) return null
  const passedCount = t.subjects.filter((s) => s.pass === true).length
  const tail = t.gradingTrack === 'MSCE' && t.aggregatePoints !== null ? `, aggregate ${t.aggregatePoints} points`
    : t.gradingTrack !== 'MSCE' && gradeText(t.grade) ? `, overall grade ${gradeText(t.grade)}` : ''
  return {
    passed: t.passStatus,
    headline: t.passStatus ? `Passed Term ${t.term ?? ''}`.trim() : 'Did not meet the pass requirement this term',
    detail: `${passedCount} of ${t.subjects.length} subject${t.subjects.length === 1 ? '' : 's'} passed${tail}`,
  }
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
