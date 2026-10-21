/** Response types for /reporting/exams/* (mark completion, pipeline, blockers). */

export interface ApiMarkCompletionRow {
  examId: string
  title: string
  subject: string
  type: string
  classId: string
  className: string
  form: number
  status: string
  date: string
  teacherUid: string | null
  teacher: string | null
  /** Active students on the class roster at report time. */
  expected: number
  /** Marks entered (excluding students marked absent). */
  entered: number
  absent: number
  /** expected − entered − absent, never below 0. */
  missing: number
  /** Entered/absent marks that have been finalised (not draft). */
  finalised: number
  /** (entered + absent) ÷ expected; null when the roster is empty. */
  completionRate: number | null
  /** Days from the exam date to the last finalisation, when fully finalised. */
  turnaroundDays: number | null
}

export interface ApiCompletionGroup {
  key: string
  label: string
  exams: number
  expected: number
  entered: number
  absent: number
  missing: number
  completionRate: number | null
  /** Mean turnaround across the group's finalised exams; null if none. */
  avgTurnaroundDays: number | null
}

export interface ApiMarkCompletion {
  academicYear: string
  term: number
  totals: {
    exams: number
    expected: number
    entered: number
    absent: number
    missing: number
    completionRate: number | null
  }
  byClass: ApiCompletionGroup[]
  bySubject: ApiCompletionGroup[]
  byTeacher: ApiCompletionGroup[]
  /** One row per exam, least complete first. */
  rows: ApiMarkCompletionRow[]
  /** True when MANEB national exams were excluded (their marks are not school-entered). */
  excludesManeb: boolean
}

export type ExamStageKey =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'MARKS_PENDING'
  | 'MARKS_DRAFT'
  | 'MARKS_FINAL'
  | 'RESULTS_APPROVED'
  | 'RESULTS_RELEASED'

export interface ApiExamBlocker {
  examId: string
  title: string
  subject: string
  className: string
  status: string
  /** Why the exam is not moving to the next stage. */
  reason: string
  /** Who must act next. */
  owner: 'teacher' | 'exam_officer' | 'high_rank'
  missing: number
  daysWaiting: number | null
}

export interface ApiExamPipeline {
  academicYear: string
  term: number
  stages: { key: ExamStageKey; label: string; count: number }[]
  total: number
  /** Exams not progressing, most urgent first. */
  blockers: ApiExamBlocker[]
}

// ─── Exam workflow (/reporting/exams/workflow) ──────────────────────────────

export type ExamStageSource = 'audit' | 'marks' | 'exam_date' | 'updated_at'

export interface ApiExamWorkflowRow extends ApiMarkCompletionRow {
  /** Who must act next; null when nothing is due yet or the results are released. */
  owner: ApiExamBlocker['owner'] | null
  /** What that person has to do. */
  nextAction: string | null
  /** When the exam entered its current status, as best the records show. */
  stageEnteredAt: string | null
  /**
   * Where that time came from: the audit entry for the transition, the marks, the exam date,
   * or Exam.updatedAt (`updated_at`, approximate — it moves on any edit).
   */
  stageSource: ExamStageSource
  daysInStage: number | null
  delayed: boolean
  /** Days the exam may stay in this stage before it counts as delayed. */
  thresholdDays: number | null
  marksStartedAt: string | null
  finalisedAt: string | null
  approvedAt: string | null
  releasedAt: string | null
  /** Times the marks were unlocked for re-entry after being finalised. */
  unlockCount: number
  /** Times marks were corrected during review. */
  correctionCount: number
}

export interface ApiExamStageSummary {
  key: ExamStageKey
  label: string
  count: number
  delayed: number
  avgDaysInStage: number | null
  oldestDaysInStage: number | null
}

export interface ApiExamOwnerWork {
  owner: ApiExamBlocker['owner']
  exams: number
  delayed: number
  marksMissing: number
  oldestDays: number | null
}

export interface ApiExamAuditEvent {
  at: string
  action: string
  label: string
  /** Rewrites or releases results. */
  sensitive: boolean
  exam: string
  className: string | null
  subject: string | null
  actorRole: string
  actor: string | null
}

export interface ApiExamWorkflow {
  generatedAt: string
  academicYear: string
  term: number
  filters: { classId: string | null; subject: string | null; teacherUid: string | null; status: string | null }
  /** Choices for the filters, built from the whole scoped term so they never narrow as filters are applied. */
  options: {
    classes: { id: string; label: string }[]
    subjects: string[]
    teachers: { uid: string; label: string }[]
    statuses: { key: ExamStageKey; label: string }[]
  }
  /** Days an exam may stay in a stage before it counts as delayed (report defaults — the school stores none). */
  thresholds: { afterExamDate: number; marksEntry: number; approval: number; release: number }
  totals: ApiMarkCompletion['totals'] & { delayed: number; released: number }
  stages: ApiExamStageSummary[]
  byOwner: ApiExamOwnerWork[]
  byClass: ApiCompletionGroup[]
  bySubject: ApiCompletionGroup[]
  byTeacher: ApiCompletionGroup[]
  rows: ApiExamWorkflowRow[]
  rowsTruncated: boolean
  /** Rows whose stage time is `updated_at` (approximate). */
  approximateStageTimes: number
  /**
   * End-of-term results release readiness for the term (school-wide view only):
   * the same rule the release action enforces.
   */
  termRelease: {
    endTermExams: number
    approved: number
    released: number
    notReady: { className: string; status: string }[]
    readyToRelease: boolean
    allReleased: boolean
  } | null
  /** Status changes and sensitive result actions, newest first. Null without exam.viewExamAuditLog. */
  audit: ApiExamAuditEvent[] | null
  auditTruncated: boolean
  /** Always true: MANEB national exams are not school-entered and are reported separately. */
  excludesManeb: boolean
}

// ─── MANEB status (/reporting/exams/maneb-status) ───────────────────────────

export interface ApiManebStatus {
  generatedAt: string
  academicYear: string
  /** These are MANEB records held by the school — external national examination data, not school-entered marks. */
  source: 'external'
  types: {
    examType: string
    candidates: number
    byStatus: { status: string; count: number }[]
    awaitingResults: number
    resultsReceived: number
    resultsWithoutGrade: number
    /** Form that sits this exam (JCE: Form 2, MSCE: Form 4). */
    form: number | null
    /** Active students now in that form; null unless the year is the school's current year (past rosters are not kept). */
    eligible: number | null
    /** Eligible students without a MANEB record for the year; null when eligible is unknown. */
    notRegistered: number | null
  }[]
}
