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
  /**
   * What the late fee would be if the book were returned today (days overdue × the
   * school's daily rate). A running figure, NOT yet charged — the fine is only created
   * when the book is returned. 0 when the book is not overdue.
   */
  accruedLateFee: number
}

/** Why a library fine was raised. */
export type ApiStudentFineKind = 'LATE' | 'DAMAGED' | 'LOST' | 'OTHER'

/** One library fine charged to the student, with its outcome. */
export interface ApiStudentFineRow {
  id: string
  bookTitle: string
  kind: ApiStudentFineKind
  amount: number
  /** What the librarian recorded (e.g. "6 overdue day(s) at MWK 100/day", or a description of the damage). */
  reason: string
  status: 'PENDING' | 'PAID' | 'WAIVED'
  createdAt: string
  /** When it was paid or waived; null while pending. */
  settledAt: string | null
}

export interface ApiStudentLibrary {
  activeLoans: number
  overdueLoans: number
  loans: ApiStudentLoanRow[]
  borrowedThisYear: number
  finesPendingAmount: number
  finesPendingCount: number
  /** MWK charged per day a book is late — the school's setting. */
  finePerDay: number
  /** Sum of every open loan's accruedLateFee: what is building up on books still out. Not yet charged. */
  accruedLateFeeTotal: number
  /** Every library fine for this student, newest first (pending, paid and waived). */
  fines: ApiStudentFineRow[]
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

// ─── Placement (own record, published information only) ────────────────────

/**
 * - published         a CONFIRMED placement exists
 * - pending           the student's own claim is awaiting staff verification (not published)
 * - not_approved      the student's own claim was rejected
 * - none              eligible, but nothing has been recorded or published
 * - awaiting_results  graduated, MSCE not yet certified
 * - not_yet_eligible  not graduated, so placement does not apply yet
 */
export type ApiStudentPlacementState =
  | 'published' | 'pending' | 'not_approved' | 'none' | 'awaiting_results' | 'not_yet_eligible'

export interface ApiStudentPlacement {
  state: ApiStudentPlacementState
  headline: string
  detail: string
  eligibility: { graduated: boolean; certifiedMsce: boolean }
  /** Present only when state is "published". */
  placement: {
    university: string | null
    programme: string | null
    admissionYear: string | null
    confirmedOn: string | null
    source: 'school_list' | 'verified_claim'
  } | null
  /** The student's own submission; present only while pending or after a rejection. */
  claim: {
    university: string | null
    programme: string | null
    admissionYear: string | null
    reference: string | null
    evidenceNote: string | null
    submittedOn: string
    reviewedOn: string | null
    rejectionReason: string | null
  } | null
  /** True when the student may submit (or resubmit) a claim right now. */
  canClaim: boolean
}
