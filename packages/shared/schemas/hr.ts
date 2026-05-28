import { z } from 'zod'

export const CreateStaffSchema = z.object({
  uid:            z.string().min(1),
  employeeNo:     z.string().min(1),
  firstName:      z.string().min(1),
  lastName:       z.string().min(1),
  email:          z.string().email(),
  phone:          z.string().optional(),
  role:           z.string().min(1),
  department:     z.string().min(1),
  jobTitle:       z.string().min(1),
  employmentType: z.enum(['FULL_TIME','PART_TIME','CONTRACT','TEMPORARY']).default('FULL_TIME'),
  dateJoined:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contractExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  salaryStructureId: z.string().optional(),
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
export type LeaveRequestInput   = z.infer<typeof LeaveRequestSchema>
export type ReviewLeaveInput    = z.infer<typeof ReviewLeaveSchema>
export type LoanRequestInput    = z.infer<typeof LoanRequestSchema>
export type PerformanceNoteInput = z.infer<typeof PerformanceNoteSchema>
