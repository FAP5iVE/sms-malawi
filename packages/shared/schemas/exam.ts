import { z } from 'zod'

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
export type BulkMarkEntryInput     = z.infer<typeof BulkMarkEntrySchema>
export type CreateManebRecordInput = z.infer<typeof CreateManebRecordSchema>
export type PromotionRulesInput    = z.infer<typeof PromotionRulesSchema>
