/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: packages/shared/types/api.ts
 * [R-PHASE]: R5 (ApiStudent/ApiConvertApplicationResult); further edited in
 *   R6 — Academics II: Classes, Assignments & the Attendance Rebuild; and
 *   R7 — Academics III: Exam Pipeline Repair & Grading Engine Unification;
 *   and R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment
 * [PURPOSE]: R6 adds `status` to ApiClass (the new archive/restore flow),
 *   `submissions` to ApiAssignment (GET /classes/:classId/assignments
 *   already includes this via Prisma but the client-facing type never
 *   declared it), and a new ApiAttendanceRecord type for the Postgres-
 *   backed attendance hooks. R7 adds ApiExamMark for the new GET
 *   /exams/:id/marks route (MarksEntrySheet.tsx's draft-restore fix). R8
 *   adds className/totalStudents/feeBlockedCount/marksEntered to ApiExam
 *   (examService.listExams()'s extension for ResultsReleaseWorkflow.tsx).
 *
 *   R14 — Analytics & Reports Domain — corrects ApiBudgetVsActualRow's key
 *   field from `department` to `category` (the Budget-to-Expense join key
 *   is Budget.category, now the ExpenseCategory enum — `department` is free
 *   text on Budget and does not exist on Expense at all, which is why the
 *   budget-vs-actual report never matched a live expense), and adds the
 *   response types for R14's newly-implemented endpoints:
 *   ApiScholarshipSummary (report.viewScholarshipSummary),
 *   ApiAttendanceSummaryRow / ApiOwnAttendanceSummary
 *   (report.viewAttendanceSummary / report.viewOwnAttendance),
 *   ApiLibraryDigitalStats, ApiHRReport and ApiAcademicReport (the last two
 *   back useReports.ts hooks that were built but had no frontend consumer
 *   and therefore no declared response type).
 * [DEPENDS ON]: none
 */

// Lightweight API response types shared between frontend hooks and backend routes
// These do NOT need to match Prisma types exactly — just the fields the frontend uses

export interface ApiStudent {
  id: string
  registrationNo: string
  firstName: string
  lastName: string
  otherNames?: string
  dateOfBirth: string
  sex: 'MALE' | 'FEMALE'
  nationality: string
  district: string
  village?: string
  address?: string
  email?: string
  phone?: string
  guardianName: string
  guardianPhone: string
  guardianRelation: string
  status: string
  classId?: string
  class?: { id: string; name: string; form: number }
  feeBalance?: number
  riskLevel?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
}

/** Response shape of POST /applications/:id/convert and POST /students/from-application/:id */
export interface ApiConvertApplicationResult {
  student: ApiStudent
  firebaseUid: string | null
  firebaseAccountCreated: boolean
  tempPasswordSet: boolean
}

export interface ApiStudentListResponse {
  students: ApiStudent[]
  total: number
  page: number
  pages: number
}

/** GET /students/at-risk — see riskService.getHighRiskStudents(). */
export interface ApiHighRiskStudent {
  id: string
  firstName: string
  lastName: string
  className: string | null
  riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'
  topFactor: string | null
}

export interface ApiHighRiskStudentsResponse {
  students: ApiHighRiskStudent[]
}

export interface ApiAssignmentSubmission {
  studentId: string
  status: 'SUBMITTED' | 'LATE' | 'MISSING'
  submittedAt: string
}

export interface ApiAssignment {
  id: string
  title: string
  description?: string | null
  subject: string
  classId: string
  dueDate: string
  createdByUid: string
  createdAt: string
  // Only populated by GET /classes/:classId/assignments (assignmentsRouter's
  // Prisma `include: { submissions: ... }`) — not present when an
  // Assignment is read via classService.getClass()'s own nested include.
  submissions?: ApiAssignmentSubmission[]
}

export interface ApiClass {
  id: string
  name: string
  form: number
  stream?: string
  room?: string
  teacherId?: string
  // [MAINT 2026-09-16 — Class Subject Presets / class teacher display]
  // Application-level join onto StaffProfile by teacherId (a plain Firebase
  // UID string — no DB-level FK is possible, matching the established
  // pattern in hrService.ts) — populated by classService's
  // attachTeacherNames() helper on every read path (listClasses/getClass),
  // never a second client-side fetch. Null when teacherId is unset, or set
  // but the staff record can't be resolved.
  teacherName?: string | null
  status: 'ACTIVE' | 'ARCHIVED'
  academicYear: string
  // Null = subject presets never set for this class yet (see
  // ClassSubjectsMeta.locked for the derived 5-day lock state).
  subjectsSetAt?: string | null
  students?: ApiStudent[]
  _count?: { students: number }
  // Only populated by GET /classes/:id (classService.getClass()'s include) — list endpoints omit this
  assignments?: ApiAssignment[]
}

/** Response shape of GET /classes/:id/subject-assignments and
 *  GET /classes/subject-assignments/mine (ClassSubjectAssignment rows). */
export interface ApiSubjectAssignment {
  id: string
  classId: string
  subject: string
  teacherUid: string
  academicYear: string
}

/**
 * Response shape of GET /classes/:id/subjects (classService.
 * getClassSubjectsMeta) and the return value of PUT /classes/:id/subjects
 * (classService.setClassSubjectPresets) — the class's preset subject list
 * plus the derived 5-day edit-window lock state. `subjects: []` with
 * `subjectsSetAt: null` means presets were never configured for this class
 * (the transition-bridge state classService.assertSubjectOfferedByClass()
 * also reads — every subject is accepted until a first preset is set).
 */
export interface ApiClassSubjectsMeta {
  classId: string
  academicYear: string
  subjects: string[]
  subjectsSetAt: string | null
  /** subjectsSetAt + 5 days — null until subjectsSetAt is set. */
  lockedAt: string | null
  /** true once now() has passed lockedAt — the list can no longer change
   *  for the rest of this Class row's academicYear. */
  locked: boolean
}

/** Response shape of GET /attendance/class/:classId and GET /attendance/student/:studentId */
export interface ApiAttendanceRecord {
  id: string
  studentId: string
  classId: string
  date: string
  status: 'PRESENT' | 'ABSENT' | 'LATE'
  markedBy: string
  createdAt: string
}

export interface ApiTimetableSlot {
  id: string
  classId: string
  day: string
  periodStart: string
  periodEnd: string
  subject: string
  teacherUid: string
  room?: string
  type: string
  approvedAt?: string | null
  approvedByUid?: string | null
  /** Only populated by GET /classes/my-timetable/today. */
  class?: { name: string }
}

export interface ApiApplication {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  sex: 'MALE' | 'FEMALE'
  nationality: string
  district: string
  guardianName: string
  guardianPhone: string
  guardianRelation: string
  applyingForForm: number
  status: string
  createdAt: string
  notes?: string
}

/**
 * Response shape of GET /applications (R15 — the list gained real
 * pagination; it previously returned every matching row unbounded).
 */
export interface ApiApplicationListResponse {
  applications: ApiApplication[]
  total: number
  page: number
  pages: number
}

// ─── FINANCE API TYPES ────────────────────────────────────

// [PRODUCTION FIX] One row per fee type on an invoice -- see
// InvoiceLineItem in schema.prisma.
export interface ApiInvoiceLineItem {
  id: string
  invoiceId: string
  feeStructureId: string | null
  feeName: string
  amount: number
  paidAmount: number
  balance: number
}

export interface ApiInvoice {
  id: string
  invoiceNumber: string
  studentId: string
  academicYear: string
  term: number
  subtotal: number
  discount: number
  latePenalty: number
  totalAmount: number
  paidAmount: number
  balance: number
  status: string
  dueDate: string
  payments?: ApiPayment[]
  /** Joined from Invoice.student — R9: replaces the raw studentId truncation the UI previously showed. */
  student?: { firstName: string; lastName: string }
  // [PRODUCTION FIX] The fee-type breakdown this invoice covers — see
  // ApiInvoiceLineItem above. Always present now; an invoice with no line
  // items is not a valid state under the new generation flow.
  lineItems: ApiInvoiceLineItem[]
}

// [PRODUCTION FIX] A student's unapplied credit from a prior overpayment
// -- see StudentCredit in schema.prisma. Auto-applied to their next
// invoice at generation time; shown read-only here for transparency.
export interface ApiStudentCredit {
  id: string
  studentId: string
  amount: number
  originalAmount: number
  reason: string | null
  createdAt: string
  lastAppliedAt: string | null
}

// [PRODUCTION FIX] Was declared ad hoc inside useFinances.ts with none
// of the 2026-09-05 fee-catalog fields -- moved here alongside every
// other finance Api* type and extended to match FeeStructure's real
// shape (code/category/mandatory/schedule/description), so every new
// consumer (Settings & Fee Catalog, Finance Fee Structure, Invoice
// Entry, Bulk Invoice Generator) shares one definition instead of each
// re-declaring its own partial copy.
export interface ApiFeeStructure {
  id: string
  name: string
  code: string
  category: string
  amount: number
  mandatory: boolean
  schedule: string
  description: string | null
  classId: string | null
  academicYear: string
  term: number | null
  isActive: boolean
}

// [NEW] A student's opt-in to an OPTIONAL fee type for a given academic
// year -- see StudentFeeCommitment in schema.prisma. `feeStructure` is
// joined server-side wherever a list of a student's commitments is
// returned (the Finance Fee Structure workstation always needs the
// fee's own name/category/amount alongside the commitment row).
export interface ApiStudentFeeCommitment {
  id: string
  studentId: string
  feeStructureId: string
  academicYear: string
  status: 'COMMITTED' | 'WAIVED'
  notes: string | null
  createdByUid: string
  createdAt: string
  updatedAt: string
  feeStructure?: Pick<ApiFeeStructure, 'id' | 'name' | 'category' | 'amount' | 'mandatory' | 'schedule'>
}

// [NEW] Per-student outcome row and overall summary for POST
// /finances/invoices/bulk-generate -- see bulkInvoiceService.ts. Mirrors
// that service's internal StudentInvoiceResult/BulkInvoiceResult types,
// plus the dry-run-only fields (scholarshipAbsorbed/advanceCreditConsumed/
// priorArrears) the Bulk Invoice Generator's roster preview displays
// before anything is actually committed.
export interface ApiBulkInvoiceStudentResult {
  studentId: string
  registrationNo: string
  fullName: string
  classId: string
  className: string
  outcome: 'CREATED' | 'EXISTING' | 'SKIPPED' | 'ERROR'
  invoiceId?: string
  totalAmount?: number
  discount?: number
  scholarshipAbsorbed?: number
  advanceCreditConsumed?: number
  priorArrears?: number
  lineItemCount?: number
  error?: string
}

export interface ApiBulkInvoiceResult {
  academicYear: string
  term: number
  created: number
  existing: number
  skipped: number
  errors: number
  totalRevenue: number
  students: ApiBulkInvoiceStudentResult[]
}

export interface ApiInvoiceNote {
  id: string
  invoiceId: string
  body: string
  authorUid: string
  createdAt: string
  /** Joined from StaffProfile by authorUid — R9: replaces the raw authorUid truncation the UI previously showed. */
  author?: { firstName: string; lastName: string }
}

export interface ApiPayment {
  id: string
  invoiceId: string
  amount: number
  method: string
  reference?: string
  receiptKey?: string
  receiptUrl?: string // signed URL from R2 — generated on request
  paidAt: string
}

export interface ApiExpense {
  id: string
  category: string
  description: string
  amount: number
  academicYear: string
  term: number
  status: string
  incurredAt: string
  /** Appwrite file ID, set once a receipt has been uploaded — R9. */
  receiptKey?: string | null
  /** [PRODUCTION FIX 2026-07-27] null on an APPROVED expense = an unpaid
   *  vendor/company debt (posted to ledger 2000 Accounts Payable). Set at
   *  approval (paid immediately) or later via PATCH .../mark-paid. */
  paidAt?: string | null
  paidByUid?: string | null
}

/** GET /finances/debts */
export interface ApiDebtsSummary {
  vendorDebts: ApiExpense[]
  totalVendorDebt: number
  staffLoans: ApiStaffLoan[]
  totalStaffLoanBalance: number
}

export interface ApiPayrollRun {
  id: string
  month: number
  year: number
  status: string
  totalGross: number
  totalNet: number
  runByUid?: string
  /** R10 — approval workflow audit trail. */
  submittedByUid?: string
  approvedByUid?: string
  approvedAt?: string
  completedAt?: string
  payslips?: ApiPayslip[]
  /** Present on GET /payroll (payrollService.getPayrollHistory), absent on workflow-action responses. */
  _count?: { payslips: number }
  /** Sum of every payslip's paye/pension on this run — computed in
   *  getPayrollHistory()/getPayrollRunDetail(), not stored columns (avoids a
   *  denormalized total that could drift from the real payslip rows). Present
   *  on GET /payroll and GET /payroll/:id; absent on workflow-action responses. */
  totalPaye?: number
  totalPension?: number
  /** Staff display names resolved server-side from the raw *ByUid audit
   *  fields above (StaffProfile has no Prisma relation to these — same
   *  Firebase-UID-as-plain-string pattern as staffName on ApiPayslip).
   *  Present on GET /payroll and GET /payroll/:id only. */
  runByName?: string
  submittedByName?: string
  approvedByName?: string
}

/**
 * GET /payroll/run-window — whether payroll for a given month/year can be
 * triggered right now, and the school's configured run window either side of
 * Settings > Finance > Payroll Processing Day. Backs the "Run Payroll" button
 * enable/disable state and the "opens on/opened on" copy in Payroll Runs &
 * Approvals — the run window is a real, enforced business rule
 * (payrollService.processMonthlyPayroll rejects a run attempted outside it),
 * not just UI decoration.
 */
export interface ApiPayrollRunWindow {
  month: number
  year: number
  /** ISO date-time the window opens for this month/year. */
  opensAt: string
  /** ISO date-time the window closes for this month/year. */
  closesAt: string
  /** Whether `now` falls within [opensAt, closesAt]. */
  isOpen: boolean
  /** Whether a PayrollRun already exists for this month/year (the
   *  @@unique([month,year]) constraint means at most one ever will). */
  alreadyRun: boolean
  existingRun?: { id: string; status: string }
  /** Count of staff with a SalaryStructure row — "N Staff Members Enrolled". */
  enrolledStaffCount: number
  /** The two settings this window is computed from, echoed back for display. */
  windowStartDay: number
  windowLengthDays: number
}

/**
 * GET /analytics/finance/payroll-breakdown — one point per completed-or-later
 * payroll run in the trailing window, with the full gross/paye/pension/net
 * split (not just totalNet like the older single-series payroll-trend point)
 * for Payroll's Financial Insights & Trends tab.
 */
export interface ApiPayrollBreakdownPoint {
  month: number
  year: number
  label: string
  totalGross: number
  totalPaye: number
  totalPension: number
  totalNet: number
  staffCount: number
}

export interface ApiPayslip {
  id: string
  staffUid: string
  staffName: string
  grossSalary: number
  paye: number
  pension: number
  loanDeduction: number
  netSalary: number
  payslipUrl?: string // signed URL from R2
  /** Present on GET /payroll/my-payslips (payrollService.getStaffPayslips's
   *  include); absent on a specific run's embedded payslips array, which is
   *  already scoped to one run. */
  payrollRun?: { month: number; year: number }
}

/**
 * One itemized allowance line as returned by the payroll self-service
 * endpoints (GET /payroll/my-salary) — distinct from useHR.ts's own
 * ApiAllowance (the HR salary-*management* CRUD contract against
 * GET/POST/DELETE /hr/:id/allowances), which independently serializes the
 * same StaffAllowance rows as raw Prisma Decimal strings. This one is
 * server-normalized to plain numbers since it's a fresh, view-only contract.
 */
export interface ApiPayrollAllowance {
  id:        string
  type:      string
  amount:    number
  recurring: boolean
  paidMonth: number | null
  paidYear:  number | null
  notes:     string | null
}

/**
 * GET /payroll/my-salary — self-service current salary structure (the
 * caller's own, or another staff member's when the caller holds
 * hr.viewAnyPayslips — the "Viewing Employee" picker in My Pay).
 * [PRODUCTION FIX] The route this type documents did not exist at all —
 * useMySalaryStructure() called it and 404'd. Rebuilt against the real
 * computation payrollService.processMonthlyPayroll() already performs
 * (base salary + itemized StaffAllowance, not the stale flat
 * SalaryStructure.allowances/loanBalance columns confirmed to have zero
 * readers — see payrollService.ts's own header comment).
 */
export interface ApiSalaryStructure {
  id:                   string
  staffUid:             string
  staffName:            string
  department:           string | null
  jobTitle:             string | null
  baseSalary:           number
  monthlyLoanDeduction: number
  /** baseSalary + every currently-recurring allowance — the real figure
   *  next month's payslip would show, mirroring payrollService's own gross
   *  computation exactly. */
  monthlyGross:         number
  updatedAt:            string
  allowances:           ApiPayrollAllowance[]
}

export interface ApiLibraryFine {
  id: string
  studentId: string | null
  staffId?: string | null
  bookTitle: string
  amount: number
  reason: string
  status: 'PENDING' | 'PAID' | 'WAIVED'
  createdAt: string
  paidAt?: string
  waivedAt?: string
  /** Joined from Student by studentId — R10: LibraryFine has no Prisma relation to Student. */
  student?: { firstName: string; lastName: string }
}

/** R12 — matches libraryWorkflowService.ts's ResourceRecommendation shape.
 *  R21 — adds requesterName/requesterRole/requesterClass (display-only
 *  fields captured on the redesigned "Recommend a Resource" form). */
export interface ApiResourceRecommendation {
  id: string
  requestedByUid: string
  title: string
  author?: string
  isbn?: string
  type: 'BOOK' | 'EBOOK' | 'JOURNAL' | 'OTHER'
  subject?: string
  reason: string
  requesterName?: string
  requesterRole?: string
  requesterClass?: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewedByUid?: string
  reviewNotes?: string
  reviewedAt?: string
  createdAt: string
}

/** R12 — matches libraryWorkflowService.ts's FineWaiverRequest shape. */
export interface ApiFineWaiverRequest {
  id: string
  fineId: string
  requestedByUid: string
  reason: string
  amount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewedByUid?: string
  reviewNotes?: string
  reviewedAt?: string
  createdAt: string
}

export interface ApiFinanceSummary {
  totalCollected: number
  totalOutstanding: number
  totalExpenses: number
  collectionTarget: number
  collectionPercent: number // 0–100
}

export interface ApiScholarship {
  id: string
  name: string
  studentId: string
  discountType: string
  value: number
  academicYear: string
  isActive: boolean
  /** Joined from Scholarship.student — R9: replaces the raw studentId truncation the UI previously showed. */
  student?: { firstName: string; lastName: string }
}
export interface ApiExam {
  id: string
  type: string
  subject: string
  classId: string
  title: string
  date: string
  timeStart: string
  timeEnd: string
  venue: string
  maxMark: number
  weightPercent: number
  academicYear: string
  term: number
  status: string
  createdByUid: string
  _count?: { marks: number }
  /** Only populated by GET /exams (examService.listExams(), R8) */
  className?:       string
  totalStudents?:   number
  feeBlockedCount?: number
  marksEntered?:    number
}

/** Response shape of GET /exams/:id/marks (R7) — previously-saved marks
 *  for an exam, consumed by MarksEntrySheet.tsx to restore draft progress
 *  instead of resetting to blank on every open. */
export interface ApiExamMark {
  id: string
  examId: string
  studentId: string
  mark: number | null
  absent: boolean
  comment: string | null
  enteredByUid: string
  isDraft: boolean
  finalizedAt: string | null
}

export interface ApiTermResult {
  id: string
  studentId: string
  classId: string
  academicYear: string
  term: number
  totalMark: number
  average: number
  /** JCE track (Forms 1-2) ONLY — the overall letter grade for the term.
   *  Always an empty string on the MSCE track: Forms 3-4 have no overall
   *  grade. Read aggregatePoints instead and label it "Points". */
  grade: string
  /** MSCE track (Forms 3-4) ONLY — sum of the point values of the six best
   *  subjects (6-54, lower is better). Null on the JCE track, and null on
   *  the MSCE track when fewer than six subjects were recorded. */
  aggregatePoints: number | null
  /** The (up to six) subjects whose points make up aggregatePoints. */
  aggregateSubjects: string[] | null
  /** 'JCE' | 'MSCE' — which grading system produced this row. */
  gradingTrack: 'JCE' | 'MSCE' | null
  /** The form (1-4) of the class this result belongs to. */
  classForm: number | null
  position: number | null
  classPosition: number
  classTotal: number
  passStatus: boolean
  subjectResults: Record<string, { average: number; grade: string; pass: boolean }>
  attendanceDays: number
  absentDays: number
  teacherComment: string | null
  headComment: string | null
  reportCardKey: string | null
  releasedAt: string | null
  classAverage: number | null
  /** MSCE track — the class's mean aggregate, the points-to-points
   *  equivalent of classAverage. Null when no sibling has an aggregate. */
  classAveragePoints: number | null
  classSize: number | null
}

export interface ApiRankedStudent {
  studentId:      string
  name:           string
  registrationNo: string
  classId:        string
  className:      string
  value:          number
  /** MSCE-track rows only — the aggregate the ranking used (lower is
   *  better). Null on the JCE track and when no aggregate exists. */
  points:         number | null
  position:       number
}

export interface ApiClassAnalyticsSummary {
  classId:       string
  className:     string
  form:          number
  gradingTrack:  'JCE' | 'MSCE'
  total:         number
  classAverage:  number | null
  averagePoints: number | null
  passRate:      number | null
  atRiskCount:   number
}

export interface ApiExamAnalytics {
  metric:            'overall' | 'subject'
  subject:           string | null
  classId:           string | null
  className:         string | null
  form:              number | null
  gradingTrack:      'JCE' | 'MSCE' | null
  /** True when no class was selected. `perClass` is populated and top/bottom
   *  are empty: ranking a Form 2 JCE result against a Form 4 MSCE aggregate
   *  compares two different grading systems and is not meaningful. */
  schoolWide:        boolean
  /** Populated when the selection returned nothing, explaining which of the
   *  several possible causes applied. */
  emptyReason:       string | null
  total:             number
  classAverage:      number | null
  /** MSCE-track — mean aggregate points across the scope. */
  averagePoints:     number | null
  passRate:          number | null
  atRiskCount:       number
  gradeDistribution: { grade: string; count: number }[]
  top:               ApiRankedStudent[]
  bottom:            ApiRankedStudent[]
  perClass:          ApiClassAnalyticsSummary[]
}

export interface ApiManebRecord {
  id: string
  studentId: string
  examType: 'JCE' | 'MSCE'
  candidateNo: string
  centerNo: string
  centerName: string
  academicYear: string
  subjectGrades: Record<string, string>
  overallGrade: string | null
  aggregatePoints: number | null
  studentName: string | null
  registrationNo: string | null
  status: 'REGISTERED' | 'SITTING' | 'RESULTS_RECEIVED' | 'CERTIFIED'
}
export interface ApiStaffProfile {
  id: string
  uid: string
  employeeNo: string
  firstName: string
  lastName: string
  role: string
  department: string
  jobTitle: string
  status: string
  employmentType: string
  contractExpiry?: string
  photoKey?: string
  dateJoined: string
}

/**
 * The richer single-staff-member shape returned by GET /hr/:id
 * (hrService.getStaffProfile) — includes email/phone (which the lighter
 * directory-list shape above omits) plus this term's leave balances,
 * recent leave requests, active loans, and recent performance notes.
 * Backs the read-only staff profile page and StaffForm's edit mode.
 */
export interface ApiStaffDetail extends ApiStaffProfile {
  email: string
  phone?: string
  salaryStructureId?: string
  leaveBalances: {
    id: string
    leaveType: string
    totalDays: number
    usedDays: number
    pendingDays: number
    year: number
  }[]
  leaveRequests: ApiLeaveRequest[]
  loans: ApiStaffLoan[]
  performanceNotes: {
    id: string
    academicYear: string
    term: number
    rating: number
    notes: string
    authorUid: string
    createdAt: string
  }[]
}

export interface ApiLeaveRequest {
  id: string
  staffId: string
  leaveType: string
  startDate: string
  endDate: string
  days: number
  reason: string
  status: string
  reviewNotes?: string
  staff?: { firstName: string; lastName: string; department: string }
}

export interface ApiContractAlert {
  id: string
  firstName: string
  lastName: string
  department: string
  contractExpiry: string
}

export interface ApiStaffLoan {
  id: string
  staffId: string
  amount: number
  monthlyDeduction: number
  totalRepaid: number
  balance: number
  reason: string
  status: 'PENDING' | 'APPROVED' | 'DISBURSED' | 'REPAYING' | 'SETTLED' | 'REJECTED'
  approvedByUid?: string
  approvedAt?: string
  disbursedAt?: string
  createdAt: string
  /** Joined from StaffLoan.staff — R11. */
  staff?: { firstName: string; lastName: string; employeeNo: string; department: string }
}
export interface ApiBook {
  id: string
  title: string
  author: string
  isbn?: string
  category: string
  publisher?: string
  publishedYear?: number
  totalCopies: number
  availableCopies: number
  barcode?: string
  /** R21 — physical shelf/location label, e.g. "M-02". */
  shelf?: string
  /** Only present on GET /library/:id — active loans for this title. */
  borrowings?: ApiBorrowing[]
}

export interface ApiBorrowing {
  id: string
  bookId: string
  studentId?: string
  staffId?: string
  borrowerType: string
  issuedAt: string
  dueDate: string
  returnedAt?: string
  status: string
  condition?: string
  notes?: string
  fineAmount?: number
  book?: { title: string; author: string; isbn?: string; barcode?: string }
  /** R21 — joined in listBorrowings() so the Borrowings table can show a
   *  real borrower name/registration/class without a second round trip. */
  student?: { firstName: string; lastName: string; registrationNo: string; class?: { name: string } }
  staff?: { firstName: string; lastName: string; employeeNo: string; department: string }
}

export interface ApiAsset {
  id: string
  name: string
  category: string
  description?: string
  serialNumber?: string
  quantity: number
  condition: string
  status: string
  location?: string
  acquisitionDate?: string
  acquisitionCost?: number
  supplier?: string
  warrantyExpiry?: string
  photoKey?: string
  notes?: string
  createdByUid: string
  createdAt: string
  updatedAt: string
  assignments?: ApiAssetAssignment[]
}

export interface ApiAssetAssignment {
  id: string
  assetId: string
  assignedToType: string
  staffId?: string
  departmentOrRoom?: string
  quantity: number
  assignedByUid: string
  assignedAt: string
  returnedAt?: string
  status: string
  conditionOnReturn?: string
  notes?: string
  asset?: ApiAsset
}

export interface ApiAssetRequest {
  id: string
  requestedByUid: string
  title: string
  category: string
  quantity: number
  department?: string
  justification?: string
  status: string
  reviewedByUid?: string
  reviewedAt?: string
  reviewNotes?: string
  fulfilledAssetId?: string
  fulfilledAsset?: ApiAsset
  createdAt: string
  updatedAt: string
}

export interface ApiAssetAdvance {
  id: string
  assetRequestId: string
  supplier: string
  amount: number
  advancedByUid: string
  advancedAt: string
  status: string
  reconciledByUid?: string
  reconciledAt?: string
  notes?: string
  createdAt: string
  updatedAt: string
  assetRequest?: { title: string; department?: string }
}

export interface ApiDigitalResource {
  id: string
  title: string
  type: string
  subject?: string
  form?: number
  academicYear?: string
  fileSize: number
  mimeType: string
  approved: boolean
  uploadedByUid: string
  approvedAt?: string
}

export interface ApiLibraryStats {
  totalBooks: number
  activeBorrowings: number
  overdueBorrowings: number
  pendingFines: number
  /** R21 — MK total of PENDING library fines (pendingFines above stayed a
   *  count; the redesigned summary tile needs the amount too). */
  pendingFinesAmount: number
  digitalCount: number
}

/** R21 — one row of libraryService.getConditionReport(): a returned copy
 *  recorded as DAMAGED or LOST, for the "no way to see how many/what books
 *  are lost or damaged" gap in the Reports & Fines ledger. */
export interface ApiLibraryConditionEntry {
  id: string
  bookId: string
  bookTitle: string
  condition: 'DAMAGED' | 'LOST'
  notes?: string
  returnedAt?: string
  borrowerName: string
  /** [R21.2] 'RETURN' — set via the return flow, tied to a real loan and
   *  borrower. 'CATALOG' — a shelf copy marked directly from the Catalog
   *  (see BookConditionLog), no borrower involved. */
  source: 'RETURN' | 'CATALOG'
}

// ─── REPORT RESPONSE TYPES ───────────────────────────────
export interface ApiAdminReport {
  totalStudents:  number
  activeStudents: number
  totalStaff:     number
  totalInvoices:  number
  paidInvoices:   number
  totalExams:     number
}

export interface ApiClassStat {
  // [PRODUCTION FIX] id/form were always present in the raw response —
  // getSchoolPerformanceReport's class.findMany() uses `include`, which
  // never restricts scalar fields — just never declared here, so no
  // consumer could reference them type-safely. Additive only; nothing
  // that already read `name`/`_count.students` is affected.
  id:     string
  name:   string
  form:   number
  _count: { students: number }
}

export interface ApiSchoolReport {
  overall?:    { passRate: number; average: number; total: number }
  classStats?: ApiClassStat[]
  // [PRODUCTION FIX] Computed and returned by getSchoolPerformanceReport
  // (server/services/reportService.ts) since it was first written, but
  // never declared here — so useSchoolReport's ApiSchoolReport type made it
  // inaccessible to any caller even though the backend was already sending
  // it on every response. Grouped by classId, active students only (see
  // the groupBy's `where: { status: 'ACTIVE' }`) — despite the backend
  // variable's name, this is not actually grouped by form/grade.
  enrollmentByForm?: { classId: string; _count: number }[]
}

export interface ApiFinanceReport {
  collected?:     number   // NOTE: backend returns 'collected', not 'totalCollected'
  outstanding?:   number
  target?:        number
  collectionPct?: number
}

export interface ApiLibraryReport {
  stats?:             { _sum?: { totalCopies?: number; availableCopies?: number } }
  overdueBorrowings?: unknown[]
  pendingApprovals?:  number
}

export interface ApiExamReport {
  pendingMarks?:    number
  approvedResults?: number
  manebRecords?:    Pick<ApiManebRecord, 'id'>[]
}

export interface ApiStudentReport {
  results: Pick<ApiTermResult, 'id' | 'academicYear' | 'term' | 'average' | 'grade' | 'position' | 'passStatus'>[]
}

/** GET /reports/hr — reportService.getHRReport() */
export interface ApiHRReport {
  staffByDept:       { department: string; _count: number }[]
  leaveUsage:        { leaveType: string; _count: number }[]
  activeLoans:       number
  totalLoanBalance:  number
  expiringContracts: number
  /** Admin-configurable lookahead window the expiringContracts count used. */
  lookaheadDays:     number
}

/** GET /reports/academic — reportService.getAcademicReport() */
export interface ApiAcademicClassSummary {
  classId:   string
  className: string
  form:      number
  total:     number
  passRate:  number
  avg:       number
}

export interface ApiAcademicReport {
  summaries:    ApiAcademicClassSummary[]
  teacherUid:   string
  academicYear: string
}

export interface ApiAuditLogEntry {
  id:         string
  action:     string
  entityType: string
  entityId:   string
  actorUid:   string
  actorRole:  string
  createdAt:  string
  /** [NEW] Resolved from actorUid against StaffProfile/Student — null when
   *  the actor is neither (a deleted account, or a system/cron actor). */
  actorName?:           string | null
  actorEmployeeNo?:     string | null
  actorRegistrationNo?: string | null
}

export interface ApiAuditLogResponse {
  logs: ApiAuditLogEntry[]
  /** [R14] reportService.getAuditLogs() has always returned these three
   *  pagination fields alongside `logs`; the declared type omitted them, so
   *  the audit panel had to cast to read `total` at all. */
  total: number
  page:  number
  pages: number
}

// ─── ANALYTICS TYPES ─────────────────────────────────────────────────────────

export interface ApiTimeSeriesPoint       { label: string; value: number }
export interface ApiDualSeriesPoint       { label: string; value: number; value2: number }
export interface ApiCategoryBreakdown     { category: string; value: number; pct: number }

export interface ApiLoginTrendPoint {
  date:        string
  successful:  number
  failed:      number
}

export interface ApiActivityHeatmapCell {
  hour:       number
  dayOfWeek:  number
  count:      number
}

export interface ApiClassPerformanceStat {
  className:    string
  form:         number
  studentCount: number
  passRate:     number
  average:      number
  term:         number
}

export interface ApiSubjectAverageStat {
  subject:      string
  average:      number
  passRate:     number
  studentCount: number
}

export interface ApiTeacherEffectivenessRow {
  teacherUid:     string
  teacherName:    string
  department:     string
  subjectCount:   number
  avgStudentScore: number
  avgPassRate:    number
  classesCount:   number
}

export interface ApiEnrollmentTrendPoint {
  month:    string
  enrolled: number
  departed: number
  net:      number
}

export interface ApiApplicationFunnelStage {
  stage: string
  count: number
  pct:   number
}

export interface ApiLibraryInventoryHealth {
  totalTitles:      number
  totalCopies:      number
  availableCopies:  number
  borrowedCopies:   number
  lostCopies:       number
  overdueCount:     number
  availabilityRate: number
}

export interface ApiTopBorrowedBook {
  bookId:      string
  title:       string
  author:      string
  category:    string
  borrowCount: number
}

export interface ApiStudentPerformancePoint {
  academicYear:  string
  term:          number
  average:       number
  /** JCE track: the overall letter grade. MSCE track: the aggregate
   *  rendered as "34 pts" — Forms 3-4 have no overall grade. */
  grade:         string
  aggregatePoints: number | null
  gradingTrack:  string | null
  position:      number | null
  classTotal:    number
  passStatus:    boolean
  attendancePct: number
}

export interface ApiStudentSubjectScore {
  subject: string
  score:   number
  grade:   string
  maxMark: number
}

export interface ApiStudentFeeStatement {
  invoiceId:    string
  academicYear: string
  term:         number
  totalAmount:  number
  paidAmount:   number
  balance:      number
  status:       string
  dueDate:      string
  payments:     { amount: number; method: string; paidAt: string }[]
}

export interface ApiManebSubjectResult  { subject: string; grade: string }

export interface ApiManebResultSummary {
  candidateNo:   string
  studentId:     string
  examType:      string
  overallGrade:  string | null
  subjectGrades: ApiManebSubjectResult[]
  status:        string
}

export interface ApiManebSchoolStat {
  examType:          string
  total:             number
  passCount:         number
  passRate:          number
  gradeDistribution: ApiCategoryBreakdown[]
  subjectAverages:   { subject: string; passCount: number; total: number; passRate: number }[]
}

export interface ApiCashFlowRow {
  academicYear: string
  term:         number
  revenue:      number
  expenses:     number
  payroll:      number
  net:          number
}

export interface ApiBudgetVsActualRow {
  /** ExpenseCategory enum member — the real Budget-to-Expense join key. */
  category:    string
  allocated:   number
  spent:       number
  utilisation: number
}

/** GET /analytics/finance/outstanding-by-class. Not a plain
 *  ApiCategoryBreakdown — it carries a classId and a student count. */
/** GET /analytics/academic/subject-performance. The service returns each
 *  subject stat tagged with the class it belongs to, since one teacher's
 *  subject can run in several of their classes. */
export interface ApiAcademicSubjectPerformanceRow extends ApiSubjectAverageStat {
  className: string
}

export interface ApiOutstandingByClassRow {
  classId:      string
  className:    string
  outstanding:  number
  studentCount: number
}

export interface ApiScholarshipSummaryRow {
  name:           string
  discountType:   'PERCENTAGE' | 'FIXED_AMOUNT'
  recipientCount: number
  totalDiscount:  number
}

export interface ApiScholarshipSummary {
  academicYear:        string
  activeScholarships:  number
  recipientCount:      number
  totalDiscountMwk:    number
  byScholarship:       ApiScholarshipSummaryRow[]
}

export interface ApiAttendanceSummaryRow {
  classId:        string
  className:      string
  form:           number
  studentCount:   number
  daysPresent:    number
  daysAbsent:     number
  daysLate:       number
  attendanceRate: number
}

export interface ApiAttendanceSummary {
  academicYear:   string
  term:           number
  daysPresent:    number
  daysAbsent:     number
  daysLate:       number
  attendanceRate: number
  byClass:        ApiAttendanceSummaryRow[]
}

export interface ApiOwnAttendanceSummary {
  academicYear:   string
  term:           number
  daysPresent:    number
  daysAbsent:     number
  daysLate:       number
  totalDays:      number
  attendanceRate: number
}

export interface ApiLibraryDigitalStats {
  byType:        ApiCategoryBreakdown[]
  bySubject:     ApiCategoryBreakdown[]
  total:         number
  approvedCount: number
}

export interface ApiAssignmentCompletionRow {
  assignmentId:    string
  title:           string
  subject:         string
  dueDate:         string
  submitted:       number
  total:           number
  completionRate:  number
}

export interface ApiMarksDistributionBucket {
  bucket: string
  count:  number
}

export interface ApiSchoolPerformanceTrendPoint {
  academicYear: string
  term:         number
  passRate:     number
  average:      number
  total:        number
}

// ─── ADMIN / SYSTEM TYPES ────────────────────────────────

export interface ApiFirebaseUser {
  uid:                    string
  email:                  string
  displayName?:           string
  phone?:                 string
  role?:                  string
  disabled:               boolean
  requiresPasswordChange: boolean
  lastSignIn?:            string
  /** [PRODUCTION FIX 2026-07-28] Joined from StaffProfile/Student by uid —
   *  null when the account has neither (e.g. admin/hr with no staff
   *  record yet, or the account isn't linked to a student). */
  employeeNo?:     string | null
  registrationNo?: string | null
  /** [MOBILE UI AUDIT FIX] StaffProfile.id / Student.id for the same join
   *  above — lets the UI link a row straight to /hr/:id or /students/:id
   *  without a second lookup. null under the same conditions as
   *  employeeNo/registrationNo above. */
  staffProfileId?: string | null
  studentId?:      string | null
}

export interface ApiUserListResponse {
  users: ApiFirebaseUser[]
}

export interface ApiServiceHealth {
  name:       string
  status:     'ok' | 'degraded' | 'down'
  latencyMs?: number
  details?:   string
}

export interface ApiSystemHealth {
  overall:            string
  checkedAt:          string
  actionsLast24h:     number
  activeUsersLastHr:  number
  services:           ApiServiceHealth[]
}
// ─── PLACEMENTS (R18 — university placement & advisory, redesigned) ──────────
// Matches the "Malawi Higher Education Placement & Advisory" reference
// module's three-status workflow: a placement is either entered directly by
// staff (immediately CONFIRMED) or claimed by a graduated student
// (PENDING_APPROVAL until a staff member approves or rejects it).

export interface ApiUniversityPlacement {
  id:                    string
  studentId:             string
  manebRecordId:         string
  status:                string   // PlacementStatus: PENDING_APPROVAL | CONFIRMED | REJECTED
  entrySource:           string   // PlacementEntrySource: STAFF_OFFICIAL | STUDENT_CLAIM
  admissionYear:         string
  placedUniversityId:    string | null
  placedProgrammeId:     string | null
  placedUniversityName:  string | null
  placedProgrammeName:   string | null
  ncheBatchRef:          string | null
  claimProofNote:        string | null
  rejectionReason:       string | null
  recordedByUid:         string | null
  verifiedByUid:         string | null
  verifiedAt:            string | null
  notes:                 string | null
  createdAt:             string
  updatedAt:             string
  // Denormalized for staff list views (registry / eligible cohort / claims
  // queue) so the UI never needs a second round-trip per row.
  student?: {
    id:              string
    firstName:       string
    lastName:        string
    otherNames:      string | null
    registrationNo:  string
    sex:             string
    /** The candidate's MSCE exam number (ManebRecord.candidateNo), e.g. 'M1042/009'. */
    candidateNo?:    string
    /** ManebRecord.aggregatePoints — the official best-6 aggregate MANEB/exams already computed. */
    aggregatePoints?: number | null
  }
  // Human-readable staff names resolved server-side from recordedByUid /
  // verifiedByUid (StaffProfile lookup) — never make the UI show a raw
  // Firebase UID for a "recorded/verified by" line.
  recordedByName?:       string | null
  verifiedByName?:       string | null
}

// One row of the "mandatory prerequisite audit" table — mirrors the
// reference module's Prerequisite Subject / Required Grade / Your Grade /
// Compliance Status columns. requiredGrade/yourGrade are null for a
// group-choice or total-credit-count check (see `note` instead).
export interface ApiPrerequisiteAuditRow {
  label:          string
  requiredGrade:  number | null
  yourGrade:      number | null
  satisfied:      boolean
  note?:          string
}

export interface ApiPlacementRecommendation {
  universityId:         string
  universityName:       string
  programmeId:          string
  programmeName:        string
  faculty:              string | null
  durationYears:        number | null
  cutOffPoints:          number | null
  /** The published requirement text as transcribed from the source — real
   *  catalogue data, shown in place of invented marketing copy. */
  minimumRequirements:  string[]
  eligible:             boolean
  meetsCutOff:          boolean | null
  missingSubjects:      string[]
  prerequisiteAudit:    ApiPrerequisiteAuditRow[]
  /** The grades-entered candidate's own best-six aggregate (advisory only). */
  aggregate:            number
  score:                number
  // Present only on `top` results from the diversified/preference-aware
  // pipeline (server/services/matching/) — absent (undefined) on `chosen`
  // results, which are a direct lookup of specific programmes the caller
  // already picked and are never diversified or preference-filtered.
  fieldCategory?:            string | null
  careerTags?:               string[]
  matchedPreferredField?:    boolean
  matchedPreferredCareer?:   boolean
}

// The signed-in student's own claim/placement + graduation eligibility.
export interface ApiMyPlacementResponse {
  record:            ApiUniversityPlacement | null
  // True once Student.status === 'GRADUATED' — the Student Claim Portal tab
  // only ever renders when this is true (below-MSCE / still-enrolled
  // students never see it).
  isGraduated:       boolean
  // True once a certified MSCE ManebRecord exists for this student — a
  // graduate cannot submit a claim before their MSCE record is certified.
  hasCertifiedMsce:  boolean
}

// Self-service qualification checker (advisory calculator, all roles).
export interface ApiAdvisoryChosenResult extends ApiPlacementRecommendation {
  rank: number
}

// Which tier of the preference degrade path actually produced `top` — see
// server/services/matching/index.ts. Only meaningful when a preference was
// sent in the request; 'full' with both flags false whenever no preference
// was set at all (nothing to relax).
export interface ApiAppliedTier {
  tier: 'full' | 'relaxed_no_career' | 'relaxed_no_preferences'
  droppedCareerTag: boolean
  droppedFieldCategory: boolean
}

export interface ApiAdvisoryResponse {
  top:          ApiPlacementRecommendation[]
  chosen?:      ApiAdvisoryChosenResult[]
  subjectsUsed: number
  appliedTier?: ApiAppliedTier
}

// Public NCHE-selection listing (no auth) — name + where + what only.
export interface ApiPublicPlacement {
  studentName:    string
  registrationNo: string
  university:     string
  programme:      string
  status:         string
  academicYear:   string
}

// A Form 4 / certified-MSCE candidate available to be given an official
// placement (GET /placements/eligible) — carries their existing placement
// status, if any, so the Staff Entry picker can show "already placed".
export interface ApiPlacementEligibleStudent {
  studentId:        string
  registrationNo:   string
  firstName:        string
  lastName:         string
  sex:              string
  manebRecordId:    string
  /** MSCE exam number (ManebRecord.candidateNo), e.g. 'M1042/009'. */
  candidateNo:      string
  /** ManebRecord.aggregatePoints — MANEB's own precomputed best-6 aggregate. */
  aggregatePoints:  number | null
  /** Parsed numeric subject grades, for the candidate-list grade pills. */
  subjectGrades:    Record<string, number>
  existingStatus:   string | null   // this candidate's current PlacementStatus, if any
}

export interface ApiPlacementAnalytics {
  academicYear:         string
  cohortSize:            number   // certified-MSCE graduates this year (the whole cohort)
  confirmedCount:        number   // officially placed (staff entry or approved claim)
  pendingApprovalCount:  number   // student claims awaiting verification
  rejectedCount:         number
  genderBreakdown:       { male: number; female: number }   // among CONFIRMED placements
  topUniversities:       Array<{ universityId: string; universityName: string; count: number }>
}
