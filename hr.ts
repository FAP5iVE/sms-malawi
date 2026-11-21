/*
 * packages/shared/schemas/hr.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R11 — HR Domain: Loans UI, Leave-Conflict Wiring & Directory
 *   Access Correction
 * [PURPOSE]: CreateStaffSchema.role replaced the unconstrained
 *   `z.string().min(1)` with `z.enum(USER_ROLES)` — the real 9-role
 *   union already used everywhere else in the codebase
 *   (S/types/roles.ts) — so an invalid role string is rejected at the
 *   API boundary rather than silently persisting. Matches this same
 *   phase's schema.prisma fix converting StaffProfile.role from an
 *   unenforced String to a real Prisma enum.
 * [MOBILE UI AUDIT FIX]: Added UpdateStaffSchema — hr.editStaff and
 *   hr.viewAnyProfile already existed in the permission matrix but had no
 *   backing route, hook, or UI (only GET /:id and POST / existed). This
 *   backs the new PATCH /hr/:id, mirroring students.ts's UpdateStudentSchema
 *   pattern: all fields optional, and deliberately narrower than
 *   CreateStaffSchema (no employeeNo/role/status — see the schema's own
 *   comment for why).
 * [DEPENDS ON]: S/types/roles.ts (USER_ROLES)
 */
import { z } from 'zod'
import { USER_ROLES } from '../types/roles'
import { LEAVE_TYPES } from '../types/settings'
import {
  NRB_NUMBER_MIN,
  NRB_NUMBER_MAX,
  EMPLOYMENT_CATEGORIES,
  QUALIFICATION_LEVELS,
  TRAINING_ROUTES,
  HOUSING_STATUSES,
  STAFF_EXIT_REASONS,
} from '../constants/malawi/demographics'
import { MALAWI_SUBJECTS } from '../constants/malawi/subjects'

// Same two values as the Sex enum in schema.prisma (used by Student too).
export const STAFF_SEX = ['MALE', 'FEMALE'] as const

// ── Staff identity (date of birth, NRB, TPIN, next of kin) ────────────────────
// HR-only data (see hr.viewStaffSensitive). All optional; '' means "clear it".
// Date of birth drives the computed retirement date, so it must be a real,
// plausible date: not in the future, and not before 1930.
const dateOfBirthField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.getTime() <= Date.now() && d.getUTCFullYear() >= 1930
  }, 'Enter a valid date of birth')
  .optional()
  .or(z.literal(''))

// ── Teaching, licensing, qualifications, housing ─────────────────────────────
// TCM = Teaching Council of Malawi. isTeaching is explicit (StaffRole does not
// say who must hold a licence), and only teaching staff carry TCM details.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')

export const StaffComplianceShape = {
  isTeaching:           z.boolean().optional(),
  tcmRegistrationNo:    z.string().trim().max(40).optional(),
  tcmLicenceNo:         z.string().trim().max(40).optional(),
  tcmLicenceExpiry:     isoDate.optional().or(z.literal('')),
  employmentCategory:   z.enum(EMPLOYMENT_CATEGORIES).optional().or(z.literal('')),
  payrollNo:            z.string().trim().max(40).optional(),
  highestQualification: z.enum(QUALIFICATION_LEVELS).optional().or(z.literal('')),
  qualifiedInEducation: z.boolean().nullable().optional(),
  trainingRoute:        z.enum(TRAINING_ROUTES).optional().or(z.literal('')),
  housingStatus:        z.enum(HOUSING_STATUSES).optional().or(z.literal('')),
  qualifiedSubjects:    z.array(z.enum(MALAWI_SUBJECTS)).max(20).optional(),
} as const

export const StaffIdentityShape = {
  dateOfBirth:       dateOfBirthField,
  nationality:       z.string().trim().max(60).optional(),
  homeDistrict:      z.string().trim().max(60).optional(),
  nrbNumber:         z.string().trim().min(NRB_NUMBER_MIN, `NRB number must be at least ${NRB_NUMBER_MIN} characters`)
                       .max(NRB_NUMBER_MAX, `NRB number must be at most ${NRB_NUMBER_MAX} characters`).optional().or(z.literal('')),
  tpin:              z.string().trim().max(20).optional(),
  nextOfKinName:     z.string().trim().max(120).optional(),
  nextOfKinPhone:    z.string().trim().max(30).optional(),
  nextOfKinRelation: z.string().trim().max(60).optional(),
} as const

export const CreateStaffSchema = z.object({
  // NOTE: no `uid` field. A staff member's Firebase Auth UID is minted
  // server-side by hrService.createStaff() when it provisions their login,
  // then written onto StaffProfile.uid. It is never supplied by the client —
  // a client-provided uid was the original cause of the profile↔login
  // mismatch that broke loan/leave self-service.
  employeeNo:     z.string().min(1),
  firstName:      z.string().min(1),
  lastName:       z.string().min(1),
  sex:            z.enum(STAFF_SEX).optional(),
  email:          z.string().email(),
  phone:          z.string().optional(),
  // 'parent' is a guardian-portal role created only by the invitation-claim flow; it is not a
  // StaffRole (Prisma), so staff creation must reject it at validation, before any login is provisioned.
  role:           z.enum(USER_ROLES).exclude(['parent']),
  department:     z.string().min(1),
  jobTitle:       z.string().min(1),
  employmentType: z.enum(['FULL_TIME','PART_TIME','CONTRACT','TEMPORARY']).default('FULL_TIME'),
  dateJoined:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contractExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  salaryStructureId: z.string().optional(),
  ...StaffIdentityShape,
  ...StaffComplianceShape,
}).superRefine((v, ctx) => {
  // A teacher must be licensed. Required on CREATE only: existing teachers who
  // pre-date this field are flagged by the HR licence list instead of being
  // blocked from every unrelated edit.
  if (v.isTeaching) {
    if (!v.tcmLicenceNo?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tcmLicenceNo'], message: 'TCM licence number is required for teaching staff' })
    }
    if (!v.tcmLicenceExpiry) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tcmLicenceExpiry'], message: 'TCM licence expiry date is required for teaching staff' })
    }
  }
})

// Deliberately narrower than CreateStaffSchema: no employeeNo (immutable
// identifier), no role (role changes are gated by the separate
// hr.assignRole permission, not hr.editStaff — a role-change flow, if
// built, should be its own endpoint), no status (gated by
// hr.terminateStaff for the same reason). This schema backs the general
// "edit staff details" PATCH, matching hr.editStaff's actual scope.
export const UpdateStaffSchema = z.object({
  firstName:      z.string().min(1).optional(),
  lastName:       z.string().min(1).optional(),
  sex:            z.enum(STAFF_SEX).optional(),
  email:          z.string().email().optional(),
  phone:          z.string().optional(),
  department:     z.string().min(1).optional(),
  jobTitle:       z.string().min(1).optional(),
  employmentType: z.enum(['FULL_TIME','PART_TIME','CONTRACT','TEMPORARY']).optional(),
  contractExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ...StaffIdentityShape,
  ...StaffComplianceShape,
})

/**
 * What a staff member may change about THEIR OWN record (hr.editOwnLimitedFields):
 * contact phone and next of kin. Everything else (date of birth, NRB, TPIN,
 * licence, payroll) stays under hr.editStaff. '' clears a field.
 */
export const UpdateOwnDetailsSchema = z.object({
  phone:             z.string().trim().max(30).optional(),
  nextOfKinName:     z.string().trim().max(120).optional(),
  nextOfKinPhone:    z.string().trim().max(30).optional(),
  nextOfKinRelation: z.string().trim().max(60).optional(),
})

/** HR terminates a staff member: reason and date are required (and audited). */
export const TerminateStaffSchema = z.object({
  exitReason: z.enum(STAFF_EXIT_REASONS),
  exitDate:   isoDate.refine((v) => new Date(`${v}T00:00:00Z`).getTime() <= Date.now() + 24 * 60 * 60 * 1000, 'Exit date cannot be in the future'),
})

export const StaffResponsibilitySchema = z.object({
  title:     z.string().trim().min(2, 'Title required').max(100),
  startDate: isoDate,
  endDate:   isoDate.optional().or(z.literal('')),
}).refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: 'End date cannot be before the start date' })

// [PRODUCTION FIX] Real salary management — StaffProfile.salaryStructureId
// (removed from UpdateStaffSchema above) was a dead plain string with no
// relation to the actual SalaryStructure table and nothing ever wrote to
// it. Salary is genuinely tracked in SalaryStructure, keyed by staffUid
// (Firebase UID), which payrollService.ts already reads from — this
// schema is for the create/update endpoint that was missing entirely.
export const UpdateSalarySchema = z.object({
  baseSalary: z.number().min(0),
})

export const LeaveRequestSchema = z.object({
  leaveType:  z.enum(LEAVE_TYPES),
  startDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason:     z.string().min(10).max(500),
})

export const ReviewLeaveSchema = z.object({
  status:      z.enum(['APPROVED','REJECTED']),
  reviewNotes: z.string().max(300).optional(),
})

export const LoanRequestSchema = z.object({
  amount:           z.number().positive(),
  monthlyDeduction: z.number().positive(),
  reason:           z.string().min(10).max(300),
})

export const PerformanceNoteSchema = z.object({
  staffId:      z.string().min(1),
  academicYear: z.string().min(1),
  term:         z.number().int().min(1).max(3),
  rating:       z.number().int().min(1).max(5),
  notes:        z.string().min(10).max(1000),
})

// [PRODUCTION FIX] Allowances are itemized now (see StaffAllowance in
// schema.prisma) — each has its own type and amount, and can be a
// one-time payment tied to a specific month rather than folded into every
// month's base salary.
export const CreateAllowanceSchema = z.object({
  type:      z.string().min(1).max(60),
  amount:    z.number().min(0),
  recurring: z.boolean().default(true),
  paidMonth: z.number().int().min(1).max(12).optional(),
  paidYear:  z.number().int().min(2000).optional(),
  notes:     z.string().max(500).optional(),
}).refine(
  (data) => data.recurring || (data.paidMonth !== undefined && data.paidYear !== undefined),
  { message: 'One-time allowances need paidMonth and paidYear.', path: ['paidMonth'] },
)
export type CreateStaffInput    = z.infer<typeof CreateStaffSchema>
export type TerminateStaffInput = z.infer<typeof TerminateStaffSchema>
export type UpdateOwnDetailsInput = z.infer<typeof UpdateOwnDetailsSchema>
export type StaffResponsibilityInput = z.infer<typeof StaffResponsibilitySchema>
export type UpdateStaffInput    = z.infer<typeof UpdateStaffSchema>
export type LeaveRequestInput   = z.infer<typeof LeaveRequestSchema>
export type ReviewLeaveInput    = z.infer<typeof ReviewLeaveSchema>
export type LoanRequestInput    = z.infer<typeof LoanRequestSchema>
export type PerformanceNoteInput = z.infer<typeof PerformanceNoteSchema>
export type UpdateSalaryInput   = z.infer<typeof UpdateSalarySchema>
export type CreateAllowanceInput = z.infer<typeof CreateAllowanceSchema>