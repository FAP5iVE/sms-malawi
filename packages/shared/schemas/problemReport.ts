/*
 * packages/shared/schemas/problemReport.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: One validation schema for the in-app "Report a problem" form,
 *   shared by the client modal (ReportProblemModal) and the server route
 *   (POST /monitoring/feedback) so both enforce the same rules. The form is
 *   open to EVERY role (including users with no access to /monitoring), and
 *   every submission must say who it is from: a name / username plus the
 *   reporter's employee number (staff) or student number (students).
 * [DEPENDS ON]: zod
 */
import { z } from 'zod'

export const PROBLEM_REPORT_LIMITS = {
  messageMin: 10,
  messageMax: 2000,
  nameMin: 2,
  nameMax: 120,
  idMin: 2,
  idMax: 40,
} as const

export const ProblemReportSchema = z.object({
  /** Full name or username of the person reporting. */
  name: z
    .string()
    .trim()
    .min(PROBLEM_REPORT_LIMITS.nameMin, 'Enter your name or username.')
    .max(PROBLEM_REPORT_LIMITS.nameMax, 'Name is too long.'),
  /** Employee number for staff, student number (registration no.) for students. */
  idNumber: z
    .string()
    .trim()
    .min(PROBLEM_REPORT_LIMITS.idMin, 'Enter your employee or student number.')
    .max(PROBLEM_REPORT_LIMITS.idMax, 'Number is too long.'),
  message: z
    .string()
    .trim()
    .min(PROBLEM_REPORT_LIMITS.messageMin, `Describe the problem in at least ${PROBLEM_REPORT_LIMITS.messageMin} characters.`)
    .max(PROBLEM_REPORT_LIMITS.messageMax, 'Message is too long.'),
  /** Page the reporter was on — captured automatically, never typed. */
  pageUrl: z.string().trim().max(500).optional(),
  associatedIssueId: z.string().trim().max(100).optional(),
})

export type ProblemReportInput = z.infer<typeof ProblemReportSchema>

/** Which kind of number a role is asked for. */
export function idLabelForRole(role: string | null | undefined): 'Student number' | 'Employee number' {
  return role === 'student' ? 'Student number' : 'Employee number'
}
