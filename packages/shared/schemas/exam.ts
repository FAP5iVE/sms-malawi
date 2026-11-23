/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: packages/shared/schemas/exam.ts
 * [R-PHASE]: R7 — Academics III: Exam Pipeline Repair & Grading Engine
 *   Unification
 * [PURPOSE]: Adds ExamStatusSchema (mirroring the Prisma ExamStatus enum,
 *   which cannot be imported client-side) and
 *   EXAM_MARKS_ENTERABLE_STATUSES, a schema-derived constant replacing the
 *   hand-typed ['SCHEDULED','IN_PROGRESS','MARKS_PENDING','MARKS_DRAFT']
 *   literal previously duplicated inline in exams/page.tsx — matches the
 *   .extract()-derived-subset pattern established in R5's
 *   ApplicationStatusTransitionSchema. Full constants centralization is
 *   R15's job; this is the immediate correctness fix since the enum values
 *   were a disconnected, independently-typed literal with no single source
 *   of truth. Also adds UpdateExamSchema (a .partial() of CreateExamSchema,
 *   matching the UpdateClassSchema/UpdateStudentSchema convention) for the
 *   new PATCH /exams/:id route — no update schema existed since no PATCH
 *   route existed before this phase.
 * [DEPENDS ON]: none
 */
import { z } from 'zod'

export const ExamStatusSchema = z.enum([
  'SCHEDULED',
  'IN_PROGRESS',
  'MARKS_PENDING',
  'MARKS_DRAFT',
  'MARKS_FINAL',
  'RESULTS_APPROVED',
  'RESULTS_RELEASED',
])

// Statuses during which a teacher can still open MarksEntrySheet and enter
// marks for an exam — everything up through MARKS_DRAFT, before finalization.
export const EXAM_MARKS_ENTERABLE_STATUSES = ExamStatusSchema.extract([
  'SCHEDULED',
  'IN_PROGRESS',
  'MARKS_PENDING',
  'MARKS_DRAFT',
]).options

// Statuses during which an exam may still be EDITED or DELETED by its owner:
// everything up to the moment the teacher confirms (finalizes) the marks.
// From MARKS_FINAL onward approval/release build on those marks, so the exam
// is locked. Same set as EXAM_MARKS_ENTERABLE_STATUSES on purpose - one
// moment ends both "marks can still be typed in" and "exam can still be
// changed" - but named separately so each rule reads for what it means.
export const EXAM_MODIFIABLE_STATUSES = EXAM_MARKS_ENTERABLE_STATUSES

export const CreateExamSchema = z.object({
  type:          z.enum(['WEEKLY_TEST','ASSIGNMENT','QUIZ','MIDTERM','END_TERM','MANEB_JCE','MANEB_MSCE']),
  subject:       z.string().min(1),
  classId:       z.string().min(1),
  title:         z.string().min(3).max(200),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeStart:     z.string().regex(/^\d{2}:\d{2}$/),
  timeEnd:       z.string().regex(/^\d{2}:\d{2}$/),
  venue:         z.string().min(1),
  maxMark:       z.number().positive().max(1000).default(100),
  weightPercent: z.number().min(1).max(100).default(100),
  // Which continuous-assessment slot (CA 1, CA 2, ...) this exam fills. Required
  // by examService for WEEKLY_TEST/ASSIGNMENT/QUIZ/MIDTERM exams while CA
  // aggregation is on; must be empty for END_TERM. Range-checked there against
  // the configured CA count (this schema cannot know it).
  caSlot:        z.number().int().min(1).max(10).nullable().optional(),
  academicYear:  z.string().min(1),
  term:          z.number().int().min(1).max(3),
})

// Every field optional — a PATCH only needs to send what's actually
// changing. Matches the .partial() pattern established for
// UpdateClassSchema/UpdateStudentSchema.
export const UpdateExamSchema = CreateExamSchema.partial()

export const MarkEntrySchema = z.object({
  examId:    z.string().min(1),
  studentId: z.string().min(1),
  mark:      z.number().min(0).optional(),
  absent:    z.boolean().default(false),
  comment:   z.string().optional(),
})

export const BulkMarkEntrySchema = z.object({
  entries: z.array(MarkEntrySchema).min(1),
  isDraft: z.boolean().default(true),
})

// POST /exams/:id/finalize. `entries` is the sheet as the teacher sees it, so
// saving the marks and confirming them happen in one atomic step; omit it to
// finalize whatever is already saved.
export const FinalizeMarksSchema = z.object({
  entries: z.array(MarkEntrySchema).min(1).optional(),
})

export const TeacherCommentSchema = z.object({
  studentId:      z.string().min(1),
  academicYear:   z.string().min(1),
  term:           z.number().int().min(1).max(3),
  teacherComment: z.string().max(500).optional(),
  headComment:    z.string().max(500).optional(),
})

export const CreateManebRecordSchema = z.object({
  studentId:     z.string().min(1),
  examType:      z.enum(['JCE', 'MSCE']),
  // Marks entry takes these from the candidate's registration when left out; the server
  // refuses the record if the student is not on the registered list for this exam and year.
  candidateNo:   z.string().min(1).optional(),
  centerNo:      z.string().min(1).optional(),
  centerName:    z.string().min(1).optional(),
  academicYear:  z.string().min(1),
  subjectGrades: z.record(z.string()),
  overallGrade:  z.string().optional(),
  status:        z.enum(['REGISTERED','SITTING','RESULTS_RECEIVED','CERTIFIED']).default('REGISTERED'),
})

// ── MANEB candidate registration (the school's own record; candidates register with MANEB online)
const ExamTypeEnum = z.enum(['JCE', 'MSCE'])
const trimmedOpt   = z.string().trim().max(120).optional().or(z.literal('').transform(() => undefined))

export const ManebRegistrationFieldsSchema = z.object({
  registeredVia: z.enum(['SELF', 'SCHOOL']).default('SELF'),
  candidateNo:   trimmedOpt,
  centerNo:      trimmedOpt,
  invoiceNo:     trimmedOpt,
  feePaid:       z.boolean().default(false),
  subjects:      z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  notes:         z.string().trim().max(500).optional().or(z.literal('').transform(() => undefined)),
})

export const RegisterManebCandidateSchema = ManebRegistrationFieldsSchema.extend({
  studentId:    z.string().min(1),
  examType:     ExamTypeEnum,
  academicYear: z.string().min(1),
})

export const BulkRegisterManebCandidatesSchema = z.object({
  studentIds:    z.array(z.string().min(1)).min(1).max(500),
  examType:      ExamTypeEnum,
  academicYear:  z.string().min(1),
  registeredVia: z.enum(['SELF', 'SCHOOL']).default('SELF'),
})

export const UpdateManebRegistrationSchema = ManebRegistrationFieldsSchema.partial()

export const WithdrawManebRegistrationSchema = z.object({
  reason: z.string().trim().min(3, 'Give a short reason.').max(300),
})

export const ImportManebNumbersSchema = z.object({
  academicYear: z.string().min(1),
  examType:     ExamTypeEnum,
  rows: z.array(z.object({
    registrationNo: z.string().trim().min(1),
    candidateNo:    z.string().trim().min(1).max(40),
  })).min(1).max(500),
})

export const ManebListScopeSchema = z.object({
  academicYear: z.string().min(1),
  examType:     ExamTypeEnum,
})

export const PromotionRulesSchema = z.object({
  minimumAverage:        z.number().min(0).max(100).default(50),
  requiredSubjectPasses: z.number().int().min(1).default(5),
  passMark:              z.number().min(0).max(100).default(50),
})

export type CreateExamInput       = z.input<typeof CreateExamSchema>
export type UpdateExamInput        = z.infer<typeof UpdateExamSchema>
export type BulkMarkEntryInput     = z.infer<typeof BulkMarkEntrySchema>
export type FinalizeMarksInput     = z.infer<typeof FinalizeMarksSchema>
export type CreateManebRecordInput = z.infer<typeof CreateManebRecordSchema>
export type RegisterManebCandidateInput = z.infer<typeof RegisterManebCandidateSchema>
export type UpdateManebRegistrationInput = z.infer<typeof UpdateManebRegistrationSchema>
export type PromotionRulesInput    = z.infer<typeof PromotionRulesSchema>
export type ExamStatus             = z.infer<typeof ExamStatusSchema>
