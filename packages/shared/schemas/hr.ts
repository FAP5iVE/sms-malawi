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

export const CreateStaffSchema = z.object({
  // NOTE: no `uid` field. A staff member's Firebase Auth UID is minted
  // server-side by hrService.createStaff() when it provisions their login,
  // then written onto StaffProfile.uid. It is never supplied by the client —
  // a client-provided uid was the original cause of the profile↔login
  // mismatch that broke loan/leave self-service.
  employeeNo:     z.string().min(1),
  firstName:      z.string().min(1),
  lastName:       z.string().min(1),
  email:          z.string().email(),
  phone:          z.string().optional(),
  role:           z.enum(USER_ROLES),
  department:     z.string().min(1),
  jobTitle:       z.string().min(1),
  employmentType: z.enum(['FULL_TIME','PART_TIME','CONTRACT','TEMPORARY']).default('FULL_TIME'),
  dateJoined:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contractExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  salaryStructureId: z.string().optional(),
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
  email:          z.string().email().optional(),
  phone:          z.string().optional(),
  department:     z.string().min(1).optional(),
  jobTitle:       z.string().min(1).optional(),
  employmentType: z.enum(['FULL_TIME','PART_TIME','CONTRACT','TEMPORARY']).optional(),
  contractExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

// [PRODUCTION FIX] Real salary management — StaffProfile.salaryStructureId
// (removed from UpdateStaffSchema above) was a dead plain string with no
// relation to the actual SalaryStructure table and nothing ever wrote to
// it. Salary is genuinely tracked in SalaryStructure, keyed by staffUid
// (Firebase UID), which payrollService.ts already reads from — this
// schema is for the create/update endpoint that was missing entirely.
export const UpdateSalarySchema = z.object({
  baseSalary: z.number().min(0),
  allowances: z.number().min(0).default(0),
})

export const LeaveRequestSchema = z.object({
  leaveType:  z.enum(['ANNUAL','SICK','MATERNITY','PATERNITY','STUDY','UNPAID','EMERGENCY']),
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

export type CreateStaffInput    = z.infer<typeof CreateStaffSchema>
export type UpdateStaffInput    = z.infer<typeof UpdateStaffSchema>
export type LeaveRequestInput   = z.infer<typeof LeaveRequestSchema>
export type ReviewLeaveInput    = z.infer<typeof ReviewLeaveSchema>
export type LoanRequestInput    = z.infer<typeof LoanRequestSchema>
export type PerformanceNoteInput = z.infer<typeof PerformanceNoteSchema>
export type UpdateSalaryInput   = z.infer<typeof UpdateSalarySchema>