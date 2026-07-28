/*
 * packages/shared/schemas/announcement.ts
 *
 * [CHANGE TYPE]: NEW FILE (relocated from packages/shared/schemas/student.ts)
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]: AnnouncementSchema was misfiled inside schemas/student.ts with
 *   no relation to the Student domain — relocated here unchanged in shape
 *   for its two real call sites (AnnouncementForm.tsx client-side validation,
 *   announcementService.ts's CreateAnnouncementInput), with one rename:
 *   targetClass -> targetClassId, matching the field name
 *   announcementService.ts already uses (AnnouncementForm.tsx never
 *   submitted this field, so the rename is a no-op for its only real
 *   caller today). Added `scheduledFor` (announcement.schedule, high_rank
 *   only — the actual role check happens server-side in
 *   announcementService.createAnnouncement(), not in this schema).
 *   Also reconciles the three previously non-reconciled audience/
 *   targeting vocabularies this phase's roadmap entry calls out:
 *   announcementService.ts's targetAll/targetRoles/targetClassId, this
 *   schema's own targetAll/targetRoles/targetClass (now targetClassId),
 *   and server/templates/emails/announcement.ts's locally-defined
 *   AnnouncementAudience enum (ALL/STAFF/STUDENTS/ACADEMIC/FINANCE/
 *   LIBRARY/HR, duplicated there with no shared source). The enum and a
 *   pure deriveAudience() mapping function now live here as the single
 *   shared type/logic all three call sites import.
 * [DEPENDS ON]: none
 */
import { z } from 'zod'

// ─── AUDIENCE (reconciled — previously duplicated locally inside
//     server/templates/emails/announcement.ts with no shared source) ──
export const AnnouncementAudienceSchema = z.enum([
  'ALL',
  'STAFF',
  'STUDENTS',
  'ACADEMIC',
  'FINANCE',
  'LIBRARY',
  'HR',
])
export type AnnouncementAudience = z.infer<typeof AnnouncementAudienceSchema>

/**
 * Derives the single-value AnnouncementAudience label (used for email
 * rendering and the public landing-page feed's audience filter) from the
 * raw targetAll/targetRoles fields a submitter actually picks in
 * AnnouncementForm.tsx.
 *
 * - targetAll (or no roles picked at all) -> 'ALL'
 * - exactly one role picked, matching one of the named single-department
 *   buckets -> that bucket (e.g. ['finance'] -> 'FINANCE')
 * - every picked role is a staff role (no 'student') -> 'STAFF'
 * - anything else (a mixed staff+student selection with more than one
 *   role) -> 'ALL', the safest, most-inclusive label rather than
 *   silently picking one of several selected roles.
 */
export function deriveAudience(
  targetAll: boolean,
  targetRoles?: string[]
): AnnouncementAudience {
  if (targetAll || !targetRoles || targetRoles.length === 0) return 'ALL'

  if (targetRoles.length === 1) {
    const singleRoleAudience: Partial<Record<string, AnnouncementAudience>> = {
      academic: 'ACADEMIC',
      finance: 'FINANCE',
      library: 'LIBRARY',
      hr: 'HR',
      student: 'STUDENTS',
    }
    const mapped = singleRoleAudience[targetRoles[0] ?? '']
    if (mapped) return mapped
  }

  const allStaff = targetRoles.every((r) => r !== 'student')
  if (allStaff) return 'STAFF'

  return 'ALL'
}

// ─── ANNOUNCEMENT ─────────────────────────────────────────
// Relocated from schemas/student.ts (was misfiled there — Announcements
// have no relation to the Student domain).
export const AnnouncementSchema = z.object({
  title: z.string().min(3).max(200),
  body: z.string().min(10),
  targetAll: z.boolean().default(false),
  targetRoles: z.array(z.string()).optional(),
  targetClassId: z.string().optional(), // classId if targeting a specific class
  scheduledFor: z.string().datetime().optional(), // announcement.schedule (high_rank only) — role check enforced server-side
  eventDate: z.string().datetime().optional(), // if the announcement is about an upcoming event — the date calendar.ts's announcement source and the email template's AnnouncementEmailData.eventDate both read
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'PUBLISHED', 'SCHEDULED']).default('DRAFT'),
  // [PRODUCTION FIX 2026-07-28] See announcementService.ts's
  // CreateAnnouncementInput comment — independent of targetAll, an explicit
  // opt-in to public website visibility.
  publicWebsite: z.boolean().default(false),
  imageKey: z.string().optional(), // Appwrite file ID, FILE_PREFIX.ANNOUNCEMENT_IMAGE
})
export type CreateAnnouncementFormInput = z.infer<typeof AnnouncementSchema>