/**
 * [FILE]: packages/shared/schemas/guardianPortal.ts
 * [PURPOSE]: Request validation for the staff guardian-portal API. Strict objects: an
 *   unexpected field is an error, not silently ignored. The services re-validate every
 *   value that matters (capabilities, evidence, channel), so these schemas are the first
 *   line, never the only one.
 */
import { z } from 'zod'
import {
  GUARDIAN_CAPABILITIES, GUARDIAN_EVIDENCE_LEVELS, GUARDIAN_INVITATION_CHANNELS, GUARDIAN_LINK_STATUSES,
} from '../constants/guardianPortal'

const id = z.string().trim().min(1).max(64)

export const SetEvidenceSchema = z.object({ evidence: z.enum(GUARDIAN_EVIDENCE_LEVELS) }).strict()

export const ApproveLinkSchema = z.object({
  capabilities: z.array(z.enum(GUARDIAN_CAPABILITIES)).max(GUARDIAN_CAPABILITIES.length).optional(),
  acknowledgeSuggestion: z.boolean().optional(),
}).strict()

export const RequiredReasonSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason (at least 3 characters).').max(300),
}).strict()

export const OptionalReasonSchema = z.object({ reason: z.string().trim().max(300).optional() }).strict()

export const SetCapabilitiesSchema = z.object({
  capabilities: z.array(z.enum(GUARDIAN_CAPABILITIES)).min(1, 'Choose at least one.').max(GUARDIAN_CAPABILITIES.length),
}).strict()

export const RepointLinkSchema = z.object({ profileId: id }).strict()

export const IssueInvitationSchema = z.object({
  channel: z.enum(GUARDIAN_INVITATION_CHANNELS),
  contactId: id.optional(),
}).strict()

export const QueueQuerySchema = z.object({
  status: z.enum(GUARDIAN_LINK_STATUSES).optional(),
  reverify: z.enum(['true', 'false']).optional(),
  studentId: id.optional(),
  /** Guardian name, phone, e-mail or national ID, or the student's name or registration number. */
  search: z.string().trim().min(1).max(80).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).max(100_000).optional(),
}).strict()

/** The Student tab's browse list: current students by default, everyone when searching. */
export const StudentListQuerySchema = z.object({
  search: z.string().trim().min(1).max(80).optional(),
  sort: z.enum(['recent', 'name']).optional(),
  take: z.coerce.number().int().min(1).max(50).optional(),
  skip: z.coerce.number().int().min(0).max(100_000).optional(),
}).strict()

/** The Access log's default view: the students whose information was most recently opened. */
export const RecentAccessQuerySchema = z.object({
  take: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

/** apply=false (default) is a preview that writes nothing. */
export const NationalIdBackfillSchema = z.object({ apply: z.boolean().optional() }).strict()

export const AccessLogQuerySchema = z.object({
  studentId: id.optional(),
  profileId: id.optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
}).strict().refine((q) => q.studentId || q.profileId, { message: 'Provide a studentId or profileId.' })

export const OnboardingDryRunSchema = z.object({
  classId: id.optional(),
  studentIds: z.array(id).min(1).max(5000).optional(),
  includeNotEnrolled: z.boolean().optional(),
}).strict()

export const OnboardingApplySchema = z.object({ maxItems: z.number().int().min(1).max(500).optional() }).strict()

export const OnboardingReportQuerySchema = z.object({
  action: z.enum(['CREATE_NEW', 'SUGGEST_MATCH', 'SKIP_EXISTING', 'SKIP_INVALID']).optional(),
  take: z.coerce.number().int().min(1).max(500).optional(),
  skip: z.coerce.number().int().min(0).max(1_000_000).optional(),
}).strict()

/**
 * The public claim form. Strict, and deliberately terse: the HTTP layer answers ANY validation
 * failure with the same generic response as a wrong code, so the schema cannot be used to probe.
 */
export const ClaimInvitationSchema = z.object({
  code: z.string().trim().min(1).max(64),
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
  childDateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict()
