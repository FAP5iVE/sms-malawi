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
import {
  MALAWI_SUBJECTS,
  ADMISSION_TYPES,
  ORPHAN_STATUSES,
  SUPPORT_NEED_TYPES,
  EXIT_REASONS,
  NRB_NUMBER_MIN,
  NRB_NUMBER_MAX,
} from '@shared/constants/malawi'

// ─── ENUMS ───────────────────────────────────────────────
export const StudentStatusSchema = z.enum([
  'ACTIVE',
  'AWAITING_MANEB_RESULTS',
  'GRADUATED',
  'ARCHIVED',
])

export const SexSchema = z.enum(['MALE', 'FEMALE'])

// ─── DEMOGRAPHIC FIELDS (shared by student create/update) ─────────────
// All optional. A blank string means "not recorded / clear it" - the service
// normalises '' to null, so a form can send an empty input without a special case.
const optionalText = (max: number) => z.string().trim().max(max).optional()

// NRB number: length (and, in the DB, uniqueness) only. The real number format
// is NOT enforced until it has been verified with NRB.
const nrbNumberField = z
  .string()
  .trim()
  .min(NRB_NUMBER_MIN, `NRB number must be at least ${NRB_NUMBER_MIN} characters`)
  .max(NRB_NUMBER_MAX, `NRB number must be at most ${NRB_NUMBER_MAX} characters`)
  .optional()
  .or(z.literal(''))

export const StudentDemographicsShape = {
  nrbNumber:            nrbNumberField,
  traditionalAuthority: optionalText(100),
  religion:             optionalText(60),
  homeLanguage:         optionalText(60),
  // Where the student currently stays (free text). `address` is the postal address.
  physicalAddress:      optionalText(300),
  admissionType:        z.enum(ADMISSION_TYPES).optional(),
  previousSchool:       optionalText(200),
  reasonForTransfer:    optionalText(500),
} as const

// ─── WELFARE (sensitive — student.editWelfare) ─────────────────────────
// Deliberately NOT part of Create/UpdateStudentSchema: welfare data travels only
// through the welfare endpoints, which check student.editWelfare and audit every
// write. '' on a text field clears it.
export const UpdateWelfareSchema = z.object({
  orphanStatus:      z.enum(ORPHAN_STATUSES).optional(),
  isVulnerable:      z.boolean().optional(),
  vulnerabilityNote: z.string().trim().max(1000).optional(),
  medicalAlert:      z.string().trim().max(500).optional(),
})

export const SupportNeedInputSchema = z.object({
  type:            z.enum(SUPPORT_NEED_TYPES),
  accommodation:   z.string().trim().max(300).optional(),
  assistiveDevice: z.string().trim().max(200).optional(),
  identifiedAt:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').optional().or(z.literal('')),
})

export const UpdateSupportNeedSchema = SupportNeedInputSchema.partial()

export type UpdateWelfareInput = z.infer<typeof UpdateWelfareSchema>
export type SupportNeedInput = z.infer<typeof SupportNeedInputSchema>
export type UpdateSupportNeedInput = z.infer<typeof UpdateSupportNeedSchema>

// ─── EXIT (archiving a student) ───────────────────────────────────────
// Reason and date are required whenever a student is archived; the note is
// optional free text and is treated as sensitive (it is only ever returned with
// the welfare data). The date cannot be in the future.
export const StudentExitSchema = z.object({
  exitReason: z.enum(EXIT_REASONS),
  exitDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
    .refine((v) => new Date(`${v}T00:00:00Z`).getTime() <= Date.now() + 24 * 60 * 60 * 1000, 'Exit date cannot be in the future'),
  exitNote: z.string().trim().max(500).optional(),
})
export type StudentExitInput = z.infer<typeof StudentExitSchema>

// ─── GUARDIANS ────────────────────────────────────────────────────────
// Phone length matches CreateStudentSchema.guardianPhone (min 10). The
// relationship is a free string validated against GUARDIAN_RELATIONSHIPS by the
// form's <select>, same as Student.guardianRelation, so legacy values stay valid.
export const GuardianInputSchema = z.object({
  fullName:           z.string().trim().min(1, 'Guardian name required').max(120),
  relation:           z.string().trim().min(1, 'Relationship required').max(60),
  phone:              z.string().trim().min(10, 'Valid phone number required').max(30),
  altPhone:           z.string().trim().max(30).optional(),
  email:              z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  address:            z.string().trim().max(300).optional(),
  nrbNumber:          nrbNumberField,
  isPrimary:          z.boolean().optional(),
  isFeePayer:         z.boolean().optional(),
  isEmergencyContact: z.boolean().optional(),
  livesWithStudent:   z.boolean().nullable().optional(),
})

export const UpdateGuardianSchema = GuardianInputSchema.partial()

export type GuardianInput = z.infer<typeof GuardianInputSchema>
export type UpdateGuardianInput = z.infer<typeof UpdateGuardianSchema>

// ─── CREATE STUDENT ──────────────────────────────────────
export const CreateStudentSchema = z.object({
  firstName: z.string().min(1, 'First name required').max(100),
  lastName: z.string().min(1, 'Last name required').max(100),
  otherNames: z.string().max(100).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  sex: SexSchema,
  nationality: z.string().min(1).default('Malawian'),
  district: z.string().min(1, 'District required'),
  village: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  // Personal email is the login identifier: the system creates a Firebase
  // account, emails a generated temporary password, and forces a reset on
  // first login (the universal credential flow, matching staff).
  email: z.string().email('Enter a valid email').min(1, 'Email required'),
  guardianName: z.string().min(1, 'Guardian name required'),
  guardianPhone: z.string().min(10, 'Valid guardian phone required'),
  guardianRelation: z.string().min(1, 'Relationship required'),
  classId: z.string().optional(),
  status: StudentStatusSchema.optional(),
  ...StudentDemographicsShape,
})

// First-login registration form (student self-service). ONLY low-risk fields: identity fields
// (name, email, date of birth, sex, nationality, district, guardian) are deliberately absent, so
// a student cannot change them here. Unknown keys are stripped by zod.
export const StudentSelfRegistrationSchema = z.object({
  traditionalAuthority: optionalText(100),
  village:              optionalText(100),
  religion:             optionalText(60),
  homeLanguage:         optionalText(60),
  address:              optionalText(300),
  physicalAddress:      optionalText(300),
  phone:                optionalText(30),
  previousSchool:       optionalText(200),
  reasonForTransfer:    optionalText(500),
  nrbNumber:            nrbNumberField,
})
export type StudentSelfRegistrationInput = z.infer<typeof StudentSelfRegistrationSchema>

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
// A special need as an applicant can state it: the type plus an optional note on what
// helps. (Date identified and assistive device are recorded by staff on the student.)
export const ApplicationSupportNeedSchema = SupportNeedInputSchema.pick({
  type: true,
  accommodation: true,
  assistiveDevice: true,
})
export type ApplicationSupportNeed = z.infer<typeof ApplicationSupportNeedSchema>

export const ApplicationSchema = z.object({
  firstName: z.string().min(2, 'First name is required').max(100),
  otherNames: z.string().optional(),
  surname: z.string().min(2, 'Surname is required').max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  sex: SexSchema,
  nationality: z.string().min(1, 'Nationality is required'),
  district: z.string().optional(),
  village: z.string().optional(),
  traditionalAuthority: optionalText(100),
  religion: optionalText(60),
  homeLanguage: optionalText(60),
  // National ID (NRB / birth certificate) - optional; same length rule as the student.
  nrbNumber: nrbNumberField,
  // Home: where the applicant currently stays (free text, optional). The admission type is
  // NOT asked on the application; staff choose it when they admit the applicant.
  physicalAddress: optionalText(300),
  // Welfare, health and special needs - all optional and sensitive. Stored on the
  // application, shown only to student.viewWelfare roles, copied to the student
  // on admission (see studentService.createFromApplication).
  orphanStatus: z.enum(ORPHAN_STATUSES).optional(),
  isVulnerable: z.boolean().optional(),
  vulnerabilityNote: z.string().trim().max(1000).optional(),
  medicalAlert: z.string().trim().max(500).optional(),
  supportNeeds: z.array(ApplicationSupportNeedSchema).max(SUPPORT_NEED_TYPES.length).optional(),
  address: z.string().min(5, 'Address is required'),
  countryCode: z.string().min(1, 'Select country code'),
  phone: z.string().min(7, 'Phone number is required'),
  email: z.string().email('Enter a valid email').min(1, 'Email is required'),
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
}).superRefine((v, ctx) => {
  // The /apply form only shows the district field to Malawian applicants
  // ("Malawi" in the country list, "Malawian" on the Student default). It used
  // to be optional for them too and was saved as '' - a district the student
  // record then required. A foreign applicant has no Malawian district, so only
  // Malawians are held to it.
  const isMalawian = v.nationality === 'Malawi' || v.nationality === 'Malawian'
  if (isMalawian && !v.district?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['district'], message: 'District of origin is required' })
  }
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

// ─── CLASS SUBJECT ASSIGNMENT ────────────────────────────
// Canonical subject-teacher assignment (backs ClassSubjectAssignment). The
// single authority for exam/marks ownership: a teacher may schedule/enter/
// finalize an exam only for the (classId, subject) pairs assigned here.
export const CreateSubjectAssignmentSchema = z.object({
  classId: z.string().min(1),
  subject: z.string().min(1),
  teacherUid: z.string().min(1),
  academicYear: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: 2025/2026'),
})

// ─── CLASS SUBJECT PRESETS ───────────────────────────────
// [NEW 2026-09-16 — Class Subject Presets] The set of subjects a class is
// offered — distinct from CreateSubjectAssignmentSchema above (which pairs
// a teacher to one already-offered subject). classId travels in the route
// param, not the body (matches CreateTimetableSlotSchema's own classId-in-
// body/param split conventions elsewhere in this file — here the route is
// PUT /classes/:id/subjects, so only the subject list is submitted).
// Subjects are constrained to the canonical MALAWI_SUBJECTS list — the same
// source of truth TimetableSlotForm.tsx/ExamForm.tsx already draw from —
// so a preset can never contain a subject the rest of the system doesn't
// recognise. Deduplicated server-side in classService.setClassSubjectPresets.
export const SetClassSubjectPresetsSchema = z.object({
  subjects: z
    .array(z.enum(MALAWI_SUBJECTS))
    .min(1, 'Select at least one subject')
    .max(MALAWI_SUBJECTS.length),
})

// ─── ASSIGNMENT ──────────────────────────────────────────
// [2026-10-28 Assignment workflow - merged & hardened]
// `description` is the task CONTENT and `requirements` what the student must hand
// in - rich-text HTML that the server re-sanitises on save AND on read. Marks are
// an optional per-assignment choice, are session marks only, and NEVER feed exams
// or continuous assessment.
//
// SIZE: the API parses JSON with express.json({ limit: '50kb' }) (lib/api-app.ts).
// The two rich-text fields are therefore capped in UTF-8 BYTES (not characters -
// Chichewa, accents and formulas are multi-byte) so that a form the schema accepts
// can never be rejected by the body parser with an unfriendly 413.
import {
  ASSIGNMENT_LIMITS, isValidYmd, richTextHasContent, utf8Length,
} from '@shared/utils/assignment'

const ID_PARAM = /^[A-Za-z0-9_-]{1,64}$/
/** Route params that carry record / file ids. Reject anything else before it reaches a query. */
export const IdParamSchema = z.string().regex(ID_PARAM, 'Invalid id')

// Plain text typed by a person (title, note, feedback): no control characters.
// (React escapes it on output; this is hygiene, not the XSS defence.)
const NO_CONTROL = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/
const plain = (max: number) => z.string().trim().max(max).regex(NO_CONTROL, 'Contains invalid characters')

const YmdSchema = z.string().refine(isValidYmd, 'Enter a valid date')

// A file the teacher attached. Only the storage id is accepted: name, type and
// size are read from the stored object by the server (never trusted from here).
export const AssignmentAttachmentInputSchema = z.object({
  fileKey: z.string().regex(ID_PARAM, 'Invalid attachment'),
})

const AssignmentBaseSchema = z.object({
  title: plain(200).min(3, 'Title is required'),
  subject: z.string().trim().min(1, 'Subject is required').max(100),
  dueDate: YmdSchema,
  description: z.string()
    .refine((v) => utf8Length(v) <= ASSIGNMENT_LIMITS.maxContentBytes, 'The content is too long - split it into two assignments')
    .refine(richTextHasContent, 'Write the assignment content'),
  requirements: z.string()
    .refine((v) => utf8Length(v) <= ASSIGNMENT_LIMITS.maxRequirementsBytes, 'The requirements are too long')
    .optional(),
  marksEnabled: z.boolean().default(false),
  maxMarks: z.number().int('Total marks must be a whole number').min(1, 'Total marks must be at least 1').max(1000).nullable().optional(),
  attachments: z.array(AssignmentAttachmentInputSchema)
    .max(ASSIGNMENT_LIMITS.maxAttachments, `At most ${ASSIGNMENT_LIMITS.maxAttachments} attachments`)
    .default([]),
})

const requireMaxMarks = (v: { marksEnabled?: boolean; maxMarks?: number | null }, ctx: z.RefinementCtx) => {
  if (v.marksEnabled && !v.maxMarks) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxMarks'], message: 'Enter the total marks' })
  }
}

export const CreateAssignmentSchema = AssignmentBaseSchema.superRefine(requireMaxMarks)

// PATCH: every field optional; `attachments`, when sent, is the FULL desired list.
// `expectedUpdatedAt` (the updatedAt the editor loaded) makes the edit fail with
// 409 instead of silently overwriting a newer change by another teacher.
export const UpdateAssignmentSchema = AssignmentBaseSchema
  .omit({ subject: true })
  .partial()
  .extend({ expectedUpdatedAt: z.string().datetime().optional() })
  .superRefine(requireMaxMarks)

// Student hand-in. The file (if any) was uploaded straight to storage first via
// .../submit/upload-ticket; this carries its id plus an optional note.
export const SubmitAssignmentSchema = z.object({
  fileId: z.string().regex(ID_PARAM, 'Invalid file').optional(),
  note: plain(2000).optional(),
}).refine((v) => !!v.fileId || !!v.note, { message: 'Attach a file or write a note to hand in', path: ['note'] })

// Teacher records one student. The teacher chooses Submitted / Late submission /
// Not submitted; the server checks the choice against the authoritative lateness
// rule (shared/utils/assignment.ts) so a record can never contradict its own date.
export const MarkSubmissionSchema = z.object({
  status: z.enum(['SUBMITTED', 'LATE', 'MISSING']),
  submittedOn: YmdSchema.optional(),
  marks: z.number().finite('Enter a valid mark').min(0, 'Marks cannot be negative').nullable().optional(),
  feedback: plain(2000).optional(),
  // The version the teacher's dialog loaded: an ISO timestamp, or null meaning
  // "there was no record yet". A mismatch is a 409, never a silent overwrite.
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
}).superRefine((v, ctx) => {
  if (v.status !== 'MISSING' && !v.submittedOn) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['submittedOn'], message: 'Enter the date the work was submitted' })
  }
  if (v.status === 'MISSING' && v.marks != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['marks'], message: 'Marks can only be given to submitted work' })
  }
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
export type CreateSubjectAssignmentInput = z.infer<typeof CreateSubjectAssignmentSchema>
export type SetClassSubjectPresetsInput = z.infer<typeof SetClassSubjectPresetsSchema>
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof UpdateAssignmentSchema>
export type AssignmentAttachmentInput = z.infer<typeof AssignmentAttachmentInputSchema>
export type SubmitAssignmentInput = z.infer<typeof SubmitAssignmentSchema>
export type MarkSubmissionInput = z.infer<typeof MarkSubmissionSchema>
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceSchema>
export type AttendanceEntryInput = z.infer<typeof AttendanceEntrySchema>