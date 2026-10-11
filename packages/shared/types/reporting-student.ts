/**
 * Response types for /reporting/student/* — a student's own record only.
 * Academic results are included only for terms whose fee gate is open
 * (see feeService.checkBalanceGate); withheld terms are listed, never described.
 */

export interface ApiStudentProgressTerm {
  academicYear: string
  term: number
  label: string
  average: number
  /** JCE overall grade, or "N pts" on the MSCE track. */
  grade: string
  aggregatePoints: number | null
  gradingTrack: string | null
  position: number | null
  classTotal: number | null
  passStatus: boolean
}

export interface ApiStudentSubjectRow {
  subject: string
  score: number
  grade: string
  pass: boolean
  previousScore: number | null
  /** score − previousScore (points). */
  change: number | null
  /** score − pass mark; negative means below the pass mark. */
  distanceFromPass: number
}

export interface ApiStudentProgress {
  academicYear: string
  term: number
  passMark: number
  /** Terms with released results and an open fee gate, oldest first. */
  terms: ApiStudentProgressTerm[]
  /** Terms whose results exist but are held back by an outstanding balance. */
  withheldTerms: { academicYear: string; term: number }[]
  /** The selected term's overall result, when visible. */
  current: ApiStudentProgressTerm | null
  classAverage: number | null
  subjects: ApiStudentSubjectRow[]
  /** True when the selected term's results exist but the fee gate is closed. */
  currentWithheld: boolean
}

export type StudentAssignmentStatus = 'SUBMITTED' | 'LATE' | 'PENDING' | 'OVERDUE'

export interface ApiStudentAssignmentRow {
  assignmentId: string
  title: string
  subject: string
  dueDate: string
  status: StudentAssignmentStatus
  submittedAt: string | null
}

export interface ApiStudentAssignments {
  academicYear: string
  term: number
  totals: { total: number; submitted: number; late: number; pending: number; overdue: number; completionRate: number | null }
  rows: ApiStudentAssignmentRow[]
}

export interface ApiStudentLoanRow {
  borrowingId: string
  bookTitle: string
  issuedAt: string
  dueDate: string
  daysOverdue: number
}

export interface ApiStudentLibrary {
  activeLoans: number
  overdueLoans: number
  loans: ApiStudentLoanRow[]
  borrowedThisYear: number
  finesPendingAmount: number
  finesPendingCount: number
}

export interface ApiStudentFees {
  academicYear: string
  invoiced: number
  paid: number
  balance: number
  /** Unpaid balance on invoices already past their due date. */
  overdue: number
  paidPct: number | null
  invoices: { term: number; total: number; paid: number; balance: number; status: string; dueDate: string; overdue: boolean }[]
  nextInstallment: { dueDate: string; amount: number } | null
}

export interface ApiStudentAttendance {
  academicYear: string
  term: number
  present: number
  late: number
  absent: number
  recorded: number
  attendanceRate: number | null
  weekly: { weekStart: string; label: string; rate: number | null; recorded: number }[]
  /** Most recent absence dates (ISO), newest first. */
  recentAbsences: string[]
}
