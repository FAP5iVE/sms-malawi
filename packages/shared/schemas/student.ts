import { z } from 'zod'

// ─── ENUMS ───────────────────────────────────────────────
export const StudentStatusSchema = z.enum([
  'ACTIVE',
  'AWAITING_MANEB_RESULTS',
  'GRADUATED',
  'ARCHIVED',
])

export const SexSchema = z.enum(['MALE', 'FEMALE'])

// ─── CREATE STUDENT ──────────────────────────────────────
export const CreateStudentSchema = z.object({
  firstName: z.string().min(1, 'First name required').max(100),
  lastName: z.string().min(1, 'Last name required').max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  sex: SexSchema,
  nationality: z.string().min(1).default('Malawian'),
  district: z.string().min(1, 'District required'),
  village: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  guardianName: z.string().min(1, 'Guardian name required'),
  guardianPhone: z.string().min(10, 'Valid guardian phone required'),
  guardianRelation: z.string().min(1, 'Relationship required'),
  classId: z.string().optional(),
  status: StudentStatusSchema.optional(),
})

export const UpdateStudentSchema = CreateStudentSchema.partial().extend({
  status: StudentStatusSchema.optional(),
})

// ─── APPLICATION ─────────────────────────────────────────
export const ApplicationStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'DENIED',
  'AWAITING_ADMISSION',
  'ADMITTED',
])

export const CreateApplicationSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sex: SexSchema,
  nationality: z.string().min(1),
  district: z.string().min(1),
  village: z.string().optional(),
  guardianName: z.string().min(1),
  guardianPhone: z.string().min(10),
  guardianRelation: z.string().min(1),
  applyingForForm: z.number().int().min(1).max(4),
})

// ─── CLASS ───────────────────────────────────────────────
export const CreateClassSchema = z.object({
  name: z.string().min(1),
  form: z.number().int().min(1).max(4),
  stream: z.string().optional(),
  teacherId: z.string().optional(),
  room: z.string().optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: 2025/2026'),
})

// ─── TIMETABLE SLOT ──────────────────────────────────────
export const CreateTimetableSlotSchema = z.object({
  classId: z.string().min(1),
  day: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']),
  periodStart: z.string().regex(/^\d{2}:\d{2}$/),
  periodEnd: z.string().regex(/^\d{2}:\d{2}$/),
  subject: z.string().min(1),
  teacherUid: z.string().min(1),
  room: z.string().optional(),
  type: z.enum(['REGULAR', 'EXAM', 'MANEB', 'LAB']).default('REGULAR'),
  academicYear: z.string(),
  term: z.number().int().min(1).max(3),
})

// ─── PUBLIC APPLICATION (unauthenticated /apply page) ───────
// Extended version of CreateApplicationSchema — includes all fields
// from the multi-step apply form (§3.3)
export const PublicApplicationSchema = z.object({
  firstName: z.string().min(2).max(100),
  otherNames: z.string().optional(),
  surname: z.string().min(2).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sex: z.enum(['male', 'female']),
  nationality: z.string().min(1),
  district: z.string().optional(),
  religion: z.string().optional(),
  address: z.string().min(5),
  phone: z.string().min(7), // already formatted with country code
  email: z.string().email().optional().or(z.literal('')),
  classApplying: z.enum(['Form 1', 'Form 2', 'Form 3', 'Form 4']),
  previousSchool: z.string().optional(),
  reasonForTransfer: z.string().optional(),
  academicYear: z.string().min(4),
  guardianName: z.string().min(2),
  guardianRelationship: z.string().min(1),
  guardianPhone: z.string().min(7),
  guardianEmail: z.string().email().optional().or(z.literal('')),
  guardianAddress: z.string().optional(),
})

export type PublicApplicationInput = z.infer<typeof PublicApplicationSchema>

// ─── ANNOUNCEMENT ─────────────────────────────────────────
export const AnnouncementSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(10),
  targetAll: z.boolean().default(false),
  targetRoles: z.array(z.string()).optional(),
  targetClass: z.string().optional(), // classId if targeting specific class
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED']).default('DRAFT'),
})

// ─── INFERRED TYPES ──────────────────────────────────────
export type CreateStudentInput = z.infer<typeof CreateStudentSchema>
export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>
export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>
export type CreateClassInput = z.infer<typeof CreateClassSchema>
export type CreateTimetableSlotInput = z.infer<typeof CreateTimetableSlotSchema>
