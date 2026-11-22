/** Response types for /reporting/academic/* — a teacher's own classes and subjects. */

export interface ApiTeachingClass {
  classId: string
  className: string
  form: number
  students: number
  /** form_teacher: owns the class; subject_teacher: assigned subjects only. */
  role: 'form_teacher' | 'subject_teacher' | 'both'
  subjects: string[]
}

export type SpreadKind = 'class-wide' | 'wide-spread'

export interface ApiTeachingSubjectRow {
  classId: string
  className: string
  form: number
  subject: string
  /** Students with a score (absent excluded). */
  assessed: number
  average: number | null
  median: number | null
  min: number | null
  max: number | null
  stdDev: number | null
  passRate: number | null
  passMark: number
  exams: number
  /** class-wide: low average with a tight spread; wide-spread: very uneven results. */
  spread: SpreadKind | null
}

export interface ApiTeachingReport {
  academicYear: string
  term: number
  classes: ApiTeachingClass[]
  subjects: ApiTeachingSubjectRow[]
  /** Ten 10%-wide bands across every assessed score in scope. */
  distribution: { bucket: string; count: number }[]
  /** Average and pass rate for each term of the academic year up to the selected term. */
  trend: { term: number; label: string; average: number | null; passRate: number | null; assessed: number }[]
  totals: { assessed: number; absentMarks: number; average: number | null; passRate: number | null; subjectsBelowPass: number }
}

export interface ApiAssignmentRow {
  assignmentId: string
  title: string
  subject: string
  classId: string
  className: string
  dueDate: string
  expected: number
  submitted: number
  late: number
  completionRate: number | null
  /** Due date passed and not everyone has submitted. */
  overdue: boolean
}

export interface ApiAssignmentReport {
  academicYear: string
  term: number
  totals: {
    assignments: number
    overdue: number
    expected: number
    submitted: number
    late: number
    completionRate: number | null
    lateRate: number | null
  }
  byClass: { classId: string; className: string; assignments: number; expected: number; submitted: number; completionRate: number | null }[]
  rows: ApiAssignmentRow[]
}

export type StudentFlag = 'LOW_AVERAGE' | 'SUBJECT_FAILS' | 'ABSENCE' | 'DECLINING'

export interface ApiStudentAttentionRow {
  studentId: string
  name: string
  className: string
  average: number | null
  failingSubjects: string[]
  absenceRate: number | null
  /** Average now minus the previous term's average (points); null without a previous term. */
  change: number | null
  flags: StudentFlag[]
}

export interface ApiStudentAttentionReport {
  academicYear: string
  term: number
  /** Listed students (capped, most concerning first). */
  students: ApiStudentAttentionRow[]
  /** Every student with at least one flag, before the list cap. */
  totalFlagged: number
  counts: Record<StudentFlag, number>
  /** Students with two or more flags. */
  multiRisk: number
  absenceThresholdPct: number
  decliningPoints: number
}

export interface ApiExamReadinessRow {
  examId: string
  title: string
  subject: string
  classId: string
  className: string
  date: string
  daysAway: number
  /** Active students in the class. */
  students: number
  /** Current-term average for this class and subject so far; null if nothing assessed yet. */
  previousAverage: number | null
  previousPassRate: number | null
  /** Students currently below the pass mark in this subject. */
  belowPass: number
}

export interface ApiExamReadiness {
  lookaheadDays: number
  rows: ApiExamReadinessRow[]
}
