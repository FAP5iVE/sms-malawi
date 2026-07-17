/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/constants/exams.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Exam-type presentation constants — the labels/lists only.
 *   EXAM_TYPES is the schedulable ExamType value/label list moved from
 *   ExamForm.tsx; EXAM_TYPE_LABELS is the grading-scale-key label map moved
 *   from settings/ExamGradingSettings.tsx.
 *
 *   NOTE: these are two genuinely distinct concepts confirmed from source —
 *   EXAM_TYPES keys the Prisma `ExamType` enum (WEEKLY_TEST … MANEB_MSCE);
 *   EXAM_TYPE_LABELS keys the grading-scale selector (MSCE/JCE/INTERNAL_*).
 *   They are NOT "the same seven strings"; both are centralized here as the
 *   single source for their respective label sets.
 *
 *   EXPLICITLY EXCLUDED (grading-boundary reconciliation, resolved in R7/R8
 *   by making gradeService.ts the sole authority — not re-litigated here):
 *   PrintableReportCard.tsx's GRADE_SCALE, examService.ts's MSCE_GRADES/
 *   JCE_GRADES, gradeService.ts's GradingScale.
 * [DEPENDS ON]: none
 */

// ─── SCHEDULABLE EXAM TYPES (Prisma ExamType) ────────────
export interface ExamTypeOption {
  value: string
  label: string
}

export const EXAM_TYPES: readonly ExamTypeOption[] = [
  { value: 'WEEKLY_TEST', label: 'Weekly Test' },
  { value: 'ASSIGNMENT', label: 'Assignment' },
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'MIDTERM', label: 'Midterm Exam' },
  { value: 'END_TERM', label: 'End of Term Exam' },
  { value: 'MANEB_JCE', label: 'MANEB JCE (Form 2)' },
  { value: 'MANEB_MSCE', label: 'MANEB MSCE (Form 4)' },
] as const

// ─── GRADING-SCALE KEY LABELS ────────────────────────────
export type ExamTypeKey = 'MSCE' | 'JCE' | 'INTERNAL_F1F2' | 'INTERNAL_F3F4'

export const EXAM_TYPE_LABELS: Record<ExamTypeKey, string> = {
  MSCE: 'MANEB MSCE (Form 4)',
  JCE: 'MANEB JCE (Form 2)',
  INTERNAL_F1F2: 'Internal — Forms 1 & 2',
  INTERNAL_F3F4: 'Internal — Forms 3 & 4',
}
