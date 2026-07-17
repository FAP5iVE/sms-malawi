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
  candidateNo:   z.string().min(1),
  centerNo:      z.string().min(1),
  centerName:    z.string().min(1),
  academicYear:  z.string().min(1),
  subjectGrades: z.record(z.string()),
  overallGrade:  z.string().optional(),
  status:        z.enum(['REGISTERED','SITTING','RESULTS_RECEIVED','CERTIFIED']).default('REGISTERED'),
})

export const PromotionRulesSchema = z.object({
  minimumAverage:        z.number().min(0).max(100).default(50),
  requiredSubjectPasses: z.number().int().min(1).default(5),
  passMark:              z.number().min(0).max(100).default(50),
})

export type CreateExamInput       = z.input<typeof CreateExamSchema>
export type UpdateExamInput        = z.infer<typeof UpdateExamSchema>
export type BulkMarkEntryInput     = z.infer<typeof BulkMarkEntrySchema>
export type CreateManebRecordInput = z.infer<typeof CreateManebRecordSchema>
export type PromotionRulesInput    = z.infer<typeof PromotionRulesSchema>
export type ExamStatus             = z.infer<typeof ExamStatusSchema>
