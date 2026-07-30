/*
 * apps/web/src/server/services/announcementService.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]: These three exports (createAnnouncement, publishAnnouncement,
 *   listAnnouncements) were correctly designed but dead — the live system
 *   bypassed them entirely via AnnouncementForm.tsx's/useAnnouncements.ts's
 *   direct client-side Firestore reads/writes. This phase's new
 *   announcements.ts routes (POST /, PATCH /:id/approve) become the real
 *   callers, which is required to enforce the five previously-
 *   unimplemented announcement.* permissions server-side — a client-side
 *   Firestore write has no way to enforce createWithApproval vs.
 *   publishDirect role distinctions without duplicating that logic into
 *   Firestore security rules, which this project does not otherwise rely
 *   on.
 *   - createAnnouncement(): the collection literal 'announcements' is
 *     replaced with the shared COLLECTIONS.ANNOUNCEMENTS constant (was
 *     already the correct value, but hardcoded rather than sourced —
 *     tightened while this file is already being rewritten for the same
 *     bug class elsewhere in this phase). Takes a `directPublish` flag
 *     decided by the caller (announcements.ts's POST / route, from the
 *     actor's real permissions) — never trusted from client input — and
 *     an optional scheduledFor (announcement.schedule). Status resolves
 *     to PUBLISHED (direct, no future scheduledFor), SCHEDULED (direct,
 *     future scheduledFor), or PENDING_APPROVAL. Landing at PUBLISHED
 *     fires the same notifyAudience() a later approval also uses.
 *   - publishAnnouncement(): unchanged DRAFT/PENDING_APPROVAL -> PUBLISHED
 *     transition, now also calls notifyAudience() — the sixth confirmed
 *     instance in this audit of a fully-built, fully-templated
 *     notification pipeline (notificationService.sendAnnouncementNotification)
 *     with zero business-logic caller.
 *   - listAnnouncements(): the hardcoded limit(50) is replaced with real
 *     cursor-based pagination (startAfterCreatedAt) now that this
 *     function has a live caller.
 *   - New: notifyAudience() (private) resolves the real recipient list
 *     for a published announcement's targetAll/targetRoles/targetClassId
 *     via Prisma (StaffProfile for staff roles, Student for a
 *     class-targeted or student-targeted send) and calls
 *     notificationService.sendAnnouncementNotification(); resolves the
 *     author's display name/title from StaffProfile so the email
 *     template's authorName/authorTitle are real rather than blank.
 *   - Added `import 'server-only'`.
 * [DEPENDS ON]: apps/web/src/lib/prisma.ts, apps/web/src/server/services/
 *   notificationService.ts (sendAnnouncementNotification),
 *   @shared/schemas/announcement (deriveAudience — the reconciled
 *   audience vocabulary, same phase), @shared/constants/malawi
 *   (COLLECTIONS.ANNOUNCEMENTS), @shared/types/roles (STAFF_ROLES)
 */
import 'server-only'

import { getFirestore, Timestamp, type Query } from 'firebase-admin/firestore'
import type { DocumentData } from 'firebase-admin/firestore'
import type { StaffRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import * as notificationService from '@/server/services/notificationService'
import { deriveAudience } from '@shared/schemas/announcement'
import { COLLECTIONS } from '@shared/constants/storage'
import { STAFF_ROLES } from '@shared/types/roles'

import { getAdminApp } from '@/lib/verifyAuth'

export type AnnouncementStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'PUBLISHED' | 'SCHEDULED'

export interface CreateAnnouncementInput {
  title: string
  body: string
  targetAll?: boolean
  targetRoles?: string[]
  targetClassId?: string
  scheduledFor?: string
  eventDate?: string
  createdByUid: string
  createdByRole: string
  // [PRODUCTION FIX 2026-07-28] publicWebsite is deliberately independent
  // from targetAll. targetAll/targetRoles govern INTERNAL audience — who
  // sees the announcement inside the app. Before this field existed, the
  // public landing page's /public/announcements filtered on targetAll,
  // which meant "addressed to everyone in the school" silently doubled as
  // "safe to publish on the public marketing site" — two different
  // decisions that were never actually the same one. A staff-only internal
  // notice marked targetAll (e.g. "all staff meeting") could leak publicly
  // with no way to opt out. Submitter now explicitly opts an announcement
  // into public visibility.
  publicWebsite?: boolean
  // Appwrite file ID (FILE_PREFIX.ANNOUNCEMENT_IMAGE) — optional cover
  // image, primarily for the public News section.
  imageKey?: string
}

// ─── AUDIENCE RESOLUTION ──────────────────────────────────

interface Recipients {
  emails: string[]
  uids: string[]
}

async function resolveRecipients(
  targetAll: boolean,
  targetRoles: string[],
  targetClassId?: string | null
): Promise<Recipients> {
  if (targetClassId) {
    const students = await prisma.student.findMany({
      where: { classId: targetClassId, status: 'ACTIVE' },
      select: { email: true, firebaseUid: true },
    })
    return {
      emails: students.map((s) => s.email).filter((e): e is string => !!e),
      uids: students.map((s) => s.firebaseUid).filter((u): u is string => !!u),
    }
  }

  const wantsStudents = targetAll || targetRoles.includes('student')
  const staffRoles = (targetAll ? STAFF_ROLES : targetRoles.filter((r) => r !== 'student')) as StaffRole[]

  const [staff, students] = await Promise.all([
    staffRoles.length > 0
      ? prisma.staffProfile.findMany({
          where: { role: { in: staffRoles }, status: 'ACTIVE' },
          select: { email: true, uid: true },
        })
      : Promise.resolve([]),
    wantsStudents
      ? prisma.student.findMany({
          where: { status: 'ACTIVE' },
          select: { email: true, firebaseUid: true },
        })
      : Promise.resolve([]),
  ])

  return {
    emails: [
      ...staff.map((s) => s.email),
      ...students.map((s) => s.email).filter((e): e is string => !!e),
    ],
    uids: [
      ...staff.map((s) => s.uid),
      ...students.map((s) => s.firebaseUid).filter((u): u is string => !!u),
    ],
  }
}

interface NotifyPayload {
  title: string
  body: string
  targetAll: boolean
  targetRoles: string[]
  targetClassId?: string | null
  eventDate?: string | null
  createdByUid: string
}

/** Resolves recipients + author identity and fires the real, previously
 *  zero-caller notification pipeline. Failures here are logged, not
 *  thrown — a notification-delivery problem must never roll back or mask
 *  a successful publish. */
async function notifyAudience(announcementId: string, payload: NotifyPayload): Promise<void> {
  try {
    const [recipients, author] = await Promise.all([
      resolveRecipients(payload.targetAll, payload.targetRoles, payload.targetClassId),
      prisma.staffProfile.findUnique({
        where: { uid: payload.createdByUid },
        select: { firstName: true, lastName: true, jobTitle: true },
      }),
    ])

    if (recipients.emails.length === 0 && recipients.uids.length === 0) return

    await notificationService.sendAnnouncementNotification({
      emails: recipients.emails,
      uids: recipients.uids,
      data: {
        title: payload.title,
        body: payload.body,
        authorName: author ? `${author.firstName} ${author.lastName}` : 'School Administration',
        authorTitle: author?.jobTitle ?? undefined,
        audience: deriveAudience(payload.targetAll, payload.targetRoles),
        publishedAt: new Date(),
        announcementId,
        eventDate: payload.eventDate ? new Date(payload.eventDate) : undefined,
      },
    })
  } catch (err) {
    logger.error({ err, announcementId }, 'Failed to send announcement notification')
  }
}

// ─── CRUD ──────────────────────────────────────────────────

/**
 * Create an announcement. `directPublish` must be decided by the caller
 * (announcements.ts's POST / route, from the actor's real
 * announcement.publishDirect/createWithApproval permission) — never
 * trusted from client input.
 */
export async function createAnnouncement(data: CreateAnnouncementInput, directPublish: boolean) {
  const scheduledForDate = data.scheduledFor ? new Date(data.scheduledFor) : null
  const isFutureScheduled = !!scheduledForDate && scheduledForDate.getTime() > Date.now()

  const status: AnnouncementStatus = !directPublish
    ? 'PENDING_APPROVAL'
    : isFutureScheduled
      ? 'SCHEDULED'
      : 'PUBLISHED'

  const ref = getFirestore(getAdminApp()).collection(COLLECTIONS.ANNOUNCEMENTS).doc()
  await ref.set({
    title: data.title,
    body: data.body,
    targetAll: data.targetAll ?? false,
    targetRoles: data.targetRoles ?? [],
    targetClassId: data.targetClassId ?? null,
    scheduledFor: data.scheduledFor ?? null,
    eventDate: data.eventDate ?? null,
    publicWebsite: data.publicWebsite ?? false,
    imageKey: data.imageKey ?? null,
    createdByUid: data.createdByUid,
    createdByRole: data.createdByRole,
    status,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })

  if (status === 'PUBLISHED') {
    // [BE-005] Not awaited — see this function's own note above. The
    // Firestore write above is what the client is actually waiting to
    // confirm; notification fan-out is best-effort background work that
    // must not hold the HTTP response open, especially for a large
    // targetAll audience (notifyAudience() never rejects — it has its own
    // internal try/catch).
    void notifyAudience(ref.id, {
      title: data.title,
      body: data.body,
      targetAll: data.targetAll ?? false,
      targetRoles: data.targetRoles ?? [],
      targetClassId: data.targetClassId,
      eventDate: data.eventDate,
      createdByUid: data.createdByUid,
    })
  }

  return { id: ref.id, title: data.title, body: data.body, status }
}

/** Approve a PENDING_APPROVAL announcement and publish it. */
export async function publishAnnouncement(id: string, approvedByUid: string) {
  const db = getFirestore(getAdminApp())
  const snap = await db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(id).get()
  if (!snap.exists) {
    throw Object.assign(new Error('Announcement not found.'), { status: 404 })
  }
  const existing = snap.data() as DocumentData

  await db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(id).update({
    status: 'PUBLISHED',
    approvedByUid,
    publishedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })

  // [BE-005] Not awaited — same reasoning as createAnnouncement() above.
  void notifyAudience(id, {
    title: existing.title as string,
    body: existing.body as string,
    targetAll: (existing.targetAll as boolean | undefined) ?? false,
    targetRoles: (existing.targetRoles as string[] | undefined) ?? [],
    targetClassId: existing.targetClassId as string | null | undefined,
    eventDate: existing.eventDate as string | null | undefined,
    createdByUid: existing.createdByUid as string,
  })

  return { id, status: 'PUBLISHED' }
}

/**
 * List announcements, newest first, with real cursor-based pagination —
 * previously a hardcoded limit(50) with no way to reach anything older.
 */
export async function listAnnouncements(options?: {
  status?: string
  pageSize?: number
  startAfterCreatedAt?: string
}) {
  const pageSize = Math.min(options?.pageSize ?? 25, 100)

  let query: Query<DocumentData> = getFirestore(getAdminApp())
    .collection(COLLECTIONS.ANNOUNCEMENTS)
    .orderBy('createdAt', 'desc')

  if (options?.status) query = query.where('status', '==', options.status)
  if (options?.startAfterCreatedAt) {
    query = query.startAfter(Timestamp.fromDate(new Date(options.startAfterCreatedAt)))
  }

  const snap = await query.limit(pageSize + 1).get()
  const docs = snap.docs.slice(0, pageSize)
  const hasMore = snap.docs.length > pageSize

  return {
    announcements: docs.map((d) => ({ id: d.id, ...d.data() })),
    hasMore,
  }
}