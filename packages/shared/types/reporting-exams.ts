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
