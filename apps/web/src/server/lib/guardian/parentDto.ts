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

/** One released exam and this child's own mark in it. The mark's teacher comment is deliberately not sent. */
export interface ExamDto {
  id: string
  title: string
  subject: string
  type: string
  academicYear: string | null
  term: number | null
  date: string | null
  maxMark: number | null
  /** null when the child was absent or no mark was recorded. */
  mark: number | null
  percent: number | null
  absent: boolean
}

export function toExamDto(exam: Row, mark: Row): ExamDto {
  const max = num(exam.maxMark)
  const absent = mark.absent === true
  const m = absent ? null : num(mark.mark)
  return {
    id: String(exam.id), title: str(exam.title) ?? 'Exam', subject: str(exam.subject) ?? '', type: str(exam.type) ?? 'OTHER',
    academicYear: str(exam.academicYear), term: num(exam.term), date: iso(exam.date),
    maxMark: max, mark: m, percent: m !== null && max !== null && max > 0 ? round1((m / max) * 100) : null, absent,
  }
}

export interface ResultsTermDto {
  academicYear: string | null
  term: number | null
  /** true = held back for unpaid fees; no marks and no exams are sent at all. */
  withheld: boolean
  /** false for a term that has released exams but no computed term result yet. */
  hasSummary: boolean
  average: number | null
  /** The overall grade (JCE). Empty for MSCE terms, whose overall result is aggregatePoints. */
  grade: string | null
  gradingTrack: 'JCE' | 'MSCE' | null
  /** MSCE only: the sum of the six best subjects (6-54, lower is better). null if fewer than six were graded. */
  aggregatePoints: number | null
  /** MSCE only: the subjects that made up the aggregate. */
  aggregateSubjects: string[]
  classPosition: number | null
  classSize: number | null
  /** The term's pass/fail flag (a boolean in the database). null when it was not recorded. */
  passStatus: boolean | null
  attendanceDays: number | null
  absentDays: number | null
  subjects: { subject: string; average: number | null; grade: string | null; pass: boolean | null }[]
  teacherComment: string | null
  headComment: string | null
  /** The child's marks in the term's released exams, newest first. */
  exams: ExamDto[]
  /** true when a report card may be opened for this term (released, fees clear, result computed). */
  reportCard: boolean
}

const EMPTY_SUMMARY = {
  hasSummary: false, average: null, grade: null, gradingTrack: null, aggregatePoints: null, aggregateSubjects: [],
  classPosition: null, classSize: null, passStatus: null, attendanceDays: null, absentDays: null,
  subjects: [], teacherComment: null, headComment: null,
} as const

interface TermExtras { exams: ExamDto[]; reportCard: boolean }

/** A term held back for unpaid fees carries NO marks and NO exams, only the fact that it is withheld. */
export function toResultsTermDto(row: Row, withheld: boolean, extras: TermExtras = { exams: [], reportCard: false }): ResultsTermDto {
  const base = { academicYear: str(row.academicYear), term: num(row.term), withheld }
  if (withheld) return { ...base, ...EMPTY_SUMMARY, aggregateSubjects: [], subjects: [], exams: [], reportCard: false }
  const raw = row.subjectResults
  const subjects: ResultsTermDto['subjects'] = []
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [subject, v] of Object.entries(raw as Record<string, unknown>)) {
      const s = (v ?? {}) as Row
      subjects.push({ subject, average: round1(s.average), grade: str(s.grade), pass: typeof s.pass === 'boolean' ? s.pass : null })
    }
  }
  subjects.sort((a, b) => a.subject.localeCompare(b.subject))
  const points = num(row.aggregatePoints)
  const track = row.gradingTrack === 'MSCE' || row.gradingTrack === 'JCE' ? row.gradingTrack : points !== null ? 'MSCE' : null
  const counted = Array.isArray(row.aggregateSubjects) ? row.aggregateSubjects.filter((x): x is string => typeof x === 'string').slice(0, 6) : []
  return {
    ...base, hasSummary: true,
    average: round1(row.average), grade: str(row.grade), gradingTrack: track,
    aggregatePoints: track === 'MSCE' ? points : null, aggregateSubjects: track === 'MSCE' ? counted : [],
    classPosition: positive(row.classPosition), classSize: positive(row.classTotal),
    passStatus: typeof row.passStatus === 'boolean' ? row.passStatus : null,
    attendanceDays: num(row.attendanceDays), absentDays: num(row.absentDays),
    subjects, teacherComment: str(row.teacherComment), headComment: str(row.headComment),
    exams: extras.exams, reportCard: extras.reportCard,
  }
}

/** A term with released exams but no computed term result yet (e.g. a mid-term test). */
export function toExamOnlyTermDto(academicYear: string | null, term: number | null, exams: ExamDto[]): ResultsTermDto {
  return { academicYear, term, withheld: false, ...EMPTY_SUMMARY, aggregateSubjects: [], subjects: [], exams, reportCard: false }
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

/**
 * The term figures a student sees on their own attendance page. The input is the student view's
 * own summary (daysPresent / daysAbsent / daysLate / totalDays / attendanceRate), so a parent and
 * their child can never be shown different numbers for the same term.
 */
export interface AttendanceSummaryDto { present: number; late: number; absent: number; recorded: number; attendanceRate: number | null }
export function toAttendanceSummaryDto(r: Row): AttendanceSummaryDto {
  const n = (v: unknown) => Math.max(0, Math.trunc(num(v) ?? 0))
  return { present: n(r.daysPresent), late: n(r.daysLate), absent: n(r.daysAbsent), recorded: n(r.totalDays), attendanceRate: num(r.attendanceRate) }
}
