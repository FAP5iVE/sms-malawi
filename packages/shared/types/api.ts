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
  status: 'ACTIVE' | 'ARCHIVED'
  academicYear: string
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

export interface ApiInvoice {
  id: string
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

/** GET /payroll/my-salary — self-service current salary structure. */
export interface ApiSalaryStructure {
  id:                   string
  staffUid:             string
  baseSalary:           number
  allowances:           number
  loanBalance:           number
  monthlyLoanDeduction: number
  updatedAt:            string
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

/** R12 — matches libraryWorkflowService.ts's ResourceRecommendation shape. */
export interface ApiResourceRecommendation {
  id: string
  requestedByUid: string
  title: string
  author?: string
  isbn?: string
  type: 'BOOK' | 'EBOOK' | 'JOURNAL' | 'OTHER'
  subject?: string
  reason: string
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
  grade: string
  position: number | null
  passStatus: boolean
  subjectResults: Record<string, { average: number; grade: string; pass: boolean }>
  attendanceDays: number
  absentDays: number
  teacherComment: string | null
  headComment: string | null
  reportCardKey: string | null
  releasedAt: string | null
  classAverage: number | null
  classSize: number | null
}

export interface ApiRankedStudent {
  studentId:      string
  name:           string
  registrationNo: string
  classId:        string
  className:      string
  value:          number
  position:       number
}

export interface ApiExamAnalytics {
  metric:            'overall' | 'subject'
  subject:           string | null
  total:             number
  classAverage:      number | null
  passRate:          number | null
  atRiskCount:       number
  gradeDistribution: { grade: string; count: number }[]
  top:               ApiRankedStudent[]
  bottom:            ApiRankedStudent[]
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
  fineAmount?: number
  book?: { title: string; author: string; isbn?: string }
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
  digitalCount: number
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
  name:   string
  _count: { students: number }
}

export interface ApiSchoolReport {
  overall?:    { passRate: number; average: number; total: number }
  classStats?: ApiClassStat[]
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
  grade:         string
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
// ─── PLACEMENTS (R18 — advisory university placement) ────────────────────────

export interface ApiPlacementChoice {
  id:                     string
  placementId:            string
  rank:                   number
  universityId:           string | null
  programmeId:            string | null
  universityNameFreeText: string | null
  programmeNameFreeText:  string | null
  isEligible:             boolean
  score:                  number | null
  missingSubjects:        string[]
  createdAt:              string
}

export interface ApiUniversityPlacement {
  id:                    string
  studentId:             string
  manebRecordId:         string
  status:                string
  eligibilityComputedAt: string | null
  placedUniversityId:    string | null
  placedProgrammeId:     string | null
  placedUniversityName:  string | null
  placedProgrammeName:   string | null
  isVerified:            boolean
  recordedByUid:         string | null
  verifiedByUid:         string | null
  verifiedAt:            string | null
  notes:                 string | null
  choices:               ApiPlacementChoice[]
  createdAt:             string
  updatedAt:             string
}

export interface ApiPlacementRecommendation {
  universityId:    string
  universityName:  string
  programmeId:     string
  programmeName:   string
  eligible:        boolean
  meetsCutOff:     boolean | null
  missingSubjects: string[]
  score:           number
}

export interface ApiPlacementResponse {
  placement:       ApiUniversityPlacement | null
  recommendations: ApiPlacementRecommendation[]
}

// Self-service qualification checker (pre-placement advisory).
export interface ApiAdvisoryChosenResult extends ApiPlacementRecommendation {
  rank: number
}

export interface ApiAdvisoryResponse {
  top:          ApiPlacementRecommendation[]
  chosen?:      ApiAdvisoryChosenResult[]
  subjectsUsed: number
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

export interface ApiPlacementEligibleStudent {
  studentId:      string
  registrationNo: string
  firstName:      string
  lastName:       string
  manebRecordId:  string
}

export interface ApiPlacementAnalytics {
  academicYear:      string
  cohortSize:        number
  placementsStarted: number
  byStatus:          Record<string, number>
  verifiedCount:     number
  placedCount:       number
  confirmedCount:    number
  declinedCount:     number
  notPlacedCount:    number
  topUniversities:   Array<{ universityId: string; universityName: string; count: number }>
}

export interface ApiPlacementBatchResult {
  cohortSize: number
  generated:  number
  errors:     Array<{ studentId: string; error: string }>
}