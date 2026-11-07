/**
 * [FILE]: apps/web/src/server/lib/guardian/parentDto.ts
 * [PURPOSE]: The ONLY shapes a guardian ever receives. Each mapper copies named fields
 *   out of a database row; nothing is spread, so a field added to a table tomorrow can
 *   never reach a parent by accident. To expose something new, add it HERE, in review.
 *
 *   Deliberately never mapped (a test scans this file for them): welfare and vulnerability
 *   notes, orphan status, medical alerts, support needs, exit reason/date/note, national ID
 *   (NRB), date of birth, other guardians, the student's own login (firebaseUid / email),
 *   payment references, who recorded a payment, scholarship details, staff user ids, attendance
 *   notes, raw subject breakdowns (CA/exam components), report-card file keys.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */
import { sanitizeCapabilities, isEnrolledForParent, type GuardianCapability } from '@shared/constants/guardianPortal'

type Row = Record<string, unknown>

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)                       // Prisma Decimal -> number
  return Number.isFinite(n) ? n : null
}
/** A rank or class size. The database stores 0 for "not computed yet", which must read as unknown, not "0 of 0". */
const positive = (v: unknown): number | null => { const n = num(v); return n !== null && n > 0 ? n : null }
const round1 = (v: unknown): number | null => { const n = num(v); return n === null ? null : Math.round(n * 10) / 10 }
const iso = (v: unknown): string | null => (v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString() : typeof v === 'string' ? v : null)

export interface ChildDto {
  /** The guardian-link id. The ONLY identifier a parent uses to name a child. */
  id: string
  firstName: string | null
  lastName: string | null
  admissionNumber: string | null
  className: string | null
  enrolled: boolean
  relationship: string
  capabilities: GuardianCapability[]
}

export function toChildDto(link: Row, student: Row | null, className: string | null): ChildDto {
  return {
    id: String(link.id),
    firstName: str(student?.firstName),
    lastName: str(student?.lastName),
    admissionNumber: str(student?.registrationNo),
    className: isEnrolledForParent(student?.status) ? className : null,
    enrolled: isEnrolledForParent(student?.status),
    relationship: String(link.relationship ?? 'Other'),
    capabilities: sanitizeCapabilities(link.capabilities),
  }
}

export interface ResultsTermDto {
  academicYear: string | null
  term: number | null
  withheld: boolean
  average: number | null
  grade: string | null
  classPosition: number | null
  classSize: number | null
  /** The term's pass/fail flag (a boolean in the database). null when it was not recorded. */
  passStatus: boolean | null
  attendanceDays: number | null
  absentDays: number | null
  subjects: { subject: string; average: number | null; grade: string | null; pass: boolean | null }[]
  teacherComment: string | null
  headComment: string | null
}

/** A term held back for unpaid fees carries NO marks at all, only the fact that it is withheld. */
export function toResultsTermDto(row: Row, withheld: boolean): ResultsTermDto {
  const base = { academicYear: str(row.academicYear), term: num(row.term), withheld }
  if (withheld) {
    return { ...base, average: null, grade: null, classPosition: null, classSize: null, passStatus: null, attendanceDays: null, absentDays: null, subjects: [], teacherComment: null, headComment: null }
  }
  const raw = row.subjectResults
  const subjects: ResultsTermDto['subjects'] = []
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [subject, v] of Object.entries(raw as Record<string, unknown>)) {
      const s = (v ?? {}) as Row
      subjects.push({ subject, average: round1(s.average), grade: str(s.grade), pass: typeof s.pass === 'boolean' ? s.pass : null })
    }
  }
  subjects.sort((a, b) => a.subject.localeCompare(b.subject))
  return {
    ...base,
    average: round1(row.average), grade: str(row.grade),
    classPosition: positive(row.classPosition), classSize: positive(row.classTotal),
    passStatus: typeof row.passStatus === 'boolean' ? row.passStatus : null,
    attendanceDays: num(row.attendanceDays), absentDays: num(row.absentDays),
    subjects, teacherComment: str(row.teacherComment), headComment: str(row.headComment),
  }
}

export interface InvoiceDto {
  invoiceNumber: string | null
  academicYear: string | null
  term: number | null
  totalAmount: number | null
  paidAmount: number | null
  balance: number | null
  status: string | null
  dueDate: string | null
}
export function toInvoiceDto(r: Row): InvoiceDto {
  return {
    invoiceNumber: str(r.invoiceNumber), academicYear: str(r.academicYear), term: num(r.term),
    totalAmount: num(r.totalAmount), paidAmount: num(r.paidAmount), balance: num(r.balance),
    status: str(r.status), dueDate: iso(r.dueDate),
  }
}

export interface PaymentDto { amount: number | null; method: string | null; paidAt: string | null }
export function toPaymentDto(r: Row): PaymentDto {
  return { amount: num(r.amount), method: str(r.method), paidAt: iso(r.paidAt) }
}

export interface AttendanceDto { date: string | null; status: string | null }
export function toAttendanceDto(r: Row): AttendanceDto {
  return { date: iso(r.date), status: str(r.status) }
}

export function summariseAttendance(rows: readonly Row[]): { windowSize: number; byStatus: Record<string, number> } {
  const byStatus: Record<string, number> = {}
  for (const r of rows) { const s = str(r.status) ?? 'UNKNOWN'; byStatus[s] = (byStatus[s] ?? 0) + 1 }
  return { windowSize: rows.length, byStatus }
}
