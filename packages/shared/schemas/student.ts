/**
 * [CHANGE TYPE]: MAJOR REWRITE (application-schema portion only, R5); further
 *   edited in R6 — Academics II: Classes, Assignments & the Attendance
 *   Rebuild; further edited in R13 — Announcements, Timetable & Calendar
 *   Domain
 * [FILE]: packages/shared/schemas/student.ts
 * [PURPOSE]: R5 unified the two independently-diverged application schemas
 *   (CreateApplicationSchema: lastName/guardianRelation/applyingForForm:number
 *   vs. PublicApplicationSchema: surname/guardianRelationship/
 *   classApplying:string) into one canonical ApplicationSchema, used by both
 *   the unauthenticated /apply page and the internal application-intake
 *   route. R6 adds: ClassStatusSchema + UpdateClassSchema (the Class entity
 *   had no update schema at all — PATCH /classes/:id didn't exist before
 *   this phase); CreateAssignmentSchema + SubmitAssignmentSchema (the
 *   assignments route previously did manual, non-Zod field validation);
 *   AttendanceStatusSchema + AttendanceEntrySchema + MarkAttendanceSchema
 *   (new — backs the Postgres-based Attendance rebuild). CreateStudentSchema/
 *   UpdateStudentSchema/CreateClassSchema/CreateTimetableSlotSchema are
 *   unchanged. R13 removes AnnouncementSchema entirely — it was misfiled
 *   here with no relation to the Student domain; relocated to the new
 *   packages/shared/schemas/announcement.ts, which also reconciles it
 *   against the two other previously-independent announcement-audience
 *   vocabularies (see that file's header).
 * [DEPENDS ON]: none
 */
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

// Subset of ApplicationStatusSchema that a reviewer may transition an
// application to via PATCH /applications/:id/status — PENDING (the initial
// state) and ADMITTED (set only by the convert-to-student flow) are excluded.
// Derived with .extract() rather than a hand-typed literal array so it can
// never drift out of sync with the canonical status enum above.
export const ApplicationStatusTransitionSchema = ApplicationStatusSchema.extract([
  'APPROVED',
  'DENIED',
  'AWAITING_ADMISSION',
])

// ─── APPLICATION (unified — replaces the former CreateApplicationSchema
// and PublicApplicationSchema, which independently diverged on field names
// for the same concepts: lastName/surname and guardianRelation/
// guardianRelationship. One schema, one naming convention, used by both the
// unauthenticated /apply page and the internal (staff-entered) creation
// path. countryCode/guardianCountryCode are UI-only concerns (the calling-
// code selects next to the phone number inputs on the /apply form) — the
// service layer never re-derives `phone`/`guardianPhone` from them; the
// client is expected to have already produced the fully-formatted number
// before submitting. ───────────────────────────────────────
export const ApplicationSchema = z.object({
  firstName: z.string().min(2, 'First name is required').max(100),
  otherNames: z.string().optional(),
  surname: z.string().min(2, 'Surname is required').max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  sex: SexSchema,
  nationality: z.string().min(1, 'Nationality is required'),
  district: z.string().optional(),
  village: z.string().optional(),
  religion: z.string().optional(),
  address: z.string().min(5, 'Address is required'),
  countryCode: z.string().min(1, 'Select country code'),
  phone: z.string().min(7, 'Phone number is required'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  classApplying: z.enum(['Form 1', 'Form 2', 'Form 3', 'Form 4'], {
    required_error: 'Please select the form',
  }),
  previousSchool: z.string().optional(),
  reasonForTransfer: z.string().optional(),
  academicYear: z.string().min(1, 'Academic year is required'),
  guardianName: z.string().min(2, 'Guardian name is required'),
  guardianRelationship: z.string().min(1, 'Relationship is required'),
  guardianCountryCode: z.string().min(1, 'Select country code'),
  guardianPhone: z.string().min(7, 'Guardian phone is required'),
  guardianEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  guardianAddress: z.string().optional(),
})

export type ApplicationInput = z.infer<typeof ApplicationSchema>

// ─── CLASS ───────────────────────────────────────────────
export const ClassStatusSchema = z.enum(['ACTIVE', 'ARCHIVED'])

export const CreateClassSchema = z.object({
  name: z.string().min(1),
  form: z.number().int().min(1).max(4),
  stream: z.string().optional(),
  teacherId: z.string().optional(),
  room: z.string().optional(),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: 2025/2026'),
})

// Partial of CreateClassSchema — every field optional, since a PATCH only
// needs to send the fields actually changing. `status` is intentionally
// NOT part of CreateClassSchema (a class is always created ACTIVE) but is
// a valid PATCH target for the archive/restore flow.
export const UpdateClassSchema = CreateClassSchema.partial().extend({
  status: ClassStatusSchema.optional(),
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

// ─── ASSIGNMENT ──────────────────────────────────────────
export const CreateAssignmentSchema = z.object({
  title: z.string().min(3, 'Title is required').max(200),
  description: z.string().optional(),
  subject: z.string().min(1, 'Subject is required'),
  dueDate: z.string().min(1, 'Due date is required'),
})

// The file itself arrives as multipart form data (multer), not JSON — this
// schema validates only the metadata fields sent alongside the file.
export const SubmitAssignmentSchema = z.object({
  note: z.string().optional(),
})

// ─── ATTENDANCE ──────────────────────────────────────────
export const AttendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE'])

export const AttendanceEntrySchema = z.object({
  studentId: z.string().min(1),
  status: AttendanceStatusSchema,
})

export const MarkAttendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  entries: z.array(AttendanceEntrySchema).min(1, 'At least one attendance entry is required'),
})

// ─── INFERRED TYPES ──────────────────────────────────────
export type CreateStudentInput = z.infer<typeof CreateStudentSchema>
export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>
export type CreateClassInput = z.infer<typeof CreateClassSchema>
export type UpdateClassInput = z.infer<typeof UpdateClassSchema>
export type CreateTimetableSlotInput = z.infer<typeof CreateTimetableSlotSchema>
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentSchema>
export type SubmitAssignmentInput = z.infer<typeof SubmitAssignmentSchema>
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceSchema>
export type AttendanceEntryInput = z.infer<typeof AttendanceEntrySchema>
