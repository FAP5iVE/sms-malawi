import { z } from 'zod'

export const CreateUserSchema = z.object({
  email:       z.string().email(),
  displayName: z.string().min(2).max(100),
  role:        z.enum(['admin','high_rank','finance','library','lower_rank','academic','hr','exam_officer','student']),
  phone:       z.string().optional(),
  studentId:   z.string().optional(),  // link to Student record if role === 'student'
  staffId:     z.string().optional(),  // link to StaffProfile if staff role
})

export const UpdateUserRoleSchema = z.object({
  uid:  z.string().min(1),
  role: z.enum(['admin','high_rank','finance','library','lower_rank','academic','hr','exam_officer','student']),
})

export const NotificationPrefSchema = z.object({
  emailFeeReminder:  z.boolean().optional(),
  emailLeaveUpdate:  z.boolean().optional(),
  emailResultRelease:z.boolean().optional(),
  emailContractAlert:z.boolean().optional(),
  emailAnnouncement: z.boolean().optional(),
  smsFeeReminder:    z.boolean().optional(),
  smsResultRelease:  z.boolean().optional(),
  pushAnnouncement:  z.boolean().optional(),
  pushResultRelease: z.boolean().optional(),
})

export const AuditLogFilterSchema = z.object({
  entityType: z.string().optional(),
  actorUid:   z.string().optional(),
  action:     z.string().optional(),
  from:       z.string().optional(),  // ISO date
  to:         z.string().optional(),
  page:       z.number().int().min(1).default(1),
  limit:      z.number().int().min(1).max(100).default(50),
})

export type CreateUserInput        = z.infer<typeof CreateUserSchema>
export type NotificationPrefInput  = z.infer<typeof NotificationPrefSchema>
export type AuditLogFilterInput    = z.infer<typeof AuditLogFilterSchema>
