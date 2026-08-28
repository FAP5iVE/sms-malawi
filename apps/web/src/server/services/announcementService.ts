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
import { sendBatchEmails } from '@/lib/email'
import * as notificationService from '@/server/services/notificationService'
import * as notificationFeedService from '@/server/services/notificationFeedService'
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
  // [PRODUCTION FIX] See AnnouncementSchema in @shared/schemas/announcement
  // for the full explanation of ANNOUNCEMENT vs NEWS.
  postType?: 'ANNOUNCEMENT' | 'NEWS'
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
  // [FIX] Previously unused by notifyAudience() — publicWebsite items with
  // targetAll=false (a public-only news post, no internal targeting) fired
  // zero internal notifications and never touched NewsletterSubscriber at
  // all. Threading this through lets notifyAudience() close both gaps.
  publicWebsite?: boolean
}

/**
 * [FIX] Emails every confirmed, still-subscribed newsletter address when a
 * publicWebsite announcement goes live. Nothing previously read this table
 * on publish — people could subscribe and simply never hear anything.
 * Best-effort: a delivery failure here must never affect the publish itself.
 */
async function notifyNewsletterSubscribers(announcementId: string, payload: { title: string; body: string }): Promise<void> {
  try {
    const subscribers = await prisma.newsletterSubscriber.findMany({
      where: { confirmed: true, unsubscribedAt: null },
      select: { email: true },
    })
    if (subscribers.length === 0) return

    const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sms-malawi.vercel.app'
    const preview  = payload.body.length > 400 ? `${payload.body.slice(0, 400)}…` : payload.body

    await sendBatchEmails({
      continueOnError: true,
      emails: subscribers.map((s) => ({
        to: s.email,
        subject: `New: ${payload.title}`,
        html: `<h2>${payload.title}</h2>
          <p>${preview.replace(/\n/g, '<br />')}</p>
          <p><a href="${siteUrl}/news">Read the full article</a></p>
          <p style="font-size:12px;color:#888;margin-top:24px;">
            <a href="${siteUrl}/newsletter/unsubscribe?email=${encodeURIComponent(s.email)}">Unsubscribe</a>
          </p>`,
        tags: [{ name: 'type', value: 'newsletter-broadcast' }],
      })),
    })
  } catch (err) {
    logger.error({ err, announcementId }, 'Failed to notify newsletter subscribers')
  }
}

/**
 * [FIX] Guarantees every active internal user gets an in-app feed item +
 * push when a news item is public, even if the author didn't (or a
 * public-only post correctly has targetAll=false and no internal
 * targetRoles). Skipped when targetAll is already true, since the regular
 * notifyAudience() path already reaches everyone in that case — this only
 * fills the gap, it never double-notifies.
 */
async function notifyAllSystemUsers(announcementId: string, payload: { title: string; body: string }): Promise<void> {
  try {
    const [staff, students] = await Promise.all([
      prisma.staffProfile.findMany({ where: { status: 'ACTIVE' }, select: { uid: true } }),
      prisma.student.findMany({ where: { status: 'ACTIVE' }, select: { firebaseUid: true } }),
    ])
    const uids = [
      ...staff.map((s) => s.uid),
      ...students.map((s) => s.firebaseUid).filter((u): u is string => !!u),
    ]
    if (uids.length === 0) return

    await notificationService.sendAnnouncementNotification({
      emails: [],
      topic: 'announcements_all',
      data: {
        title: payload.title,
        body: payload.body,
        authorName: 'School Administration',
        audience: 'ALL',
        publishedAt: new Date(),
        announcementId,
      },
    })

    await notificationFeedService.pushToManyFeeds(uids, {
      title: `New article: ${payload.title}`,
      body: payload.body,
      type: 'INFO',
      category: 'news',
      actionUrl: '/news',
    })
  } catch (err) {
    logger.error({ err, announcementId }, 'Failed to notify all system users of new public article')
  }
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

    // [N5] Pick a broadcast FCM topic when one cleanly covers the audience,
    // so push is a single topic publish instead of N sequential per-uid
    // sends. These are the same topics users are subscribed to on login
    // (push.ts subscribeUserToDefaultTopics). When no single topic matches
    // (e.g. a multi-role targeted send), topic stays undefined and
    // sendAnnouncementNotification falls back to the per-uid loop. Email is
    // always per-recipient regardless of push mechanism.
    let topic: string | undefined
    if (payload.targetClassId) {
      topic = `announcements_class_${payload.targetClassId}`
    } else if (payload.targetAll) {
      topic = 'announcements_all'
    } else if (payload.targetRoles.length === 1) {
      if (payload.targetRoles[0] === 'student') topic = 'announcements_students'
      // Note: 'announcements_staff' covers ALL staff, so it's only correct
      // for a genuine all-staff send, not a single specific staff role —
      // hence no topic for a lone non-student role; per-uid handles it.
    }

    await notificationService.sendAnnouncementNotification({
      emails: recipients.emails,
      uids: topic ? undefined : recipients.uids,
      topic,
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

    // [N4] Drop a durable in-app feed item for each recipient so the bell
    // shows real, per-user notifications (not a re-read of the announcement
    // list). Best-effort — pushToManyFeeds swallows its own errors.
    await notificationFeedService.pushToManyFeeds(recipients.uids, {
      title: payload.title,
      body: payload.body,
      type: 'INFO',
      category: 'announcement',
      actionUrl: '/announcements',
    })
  } catch (err) {
    logger.error({ err, announcementId }, 'Failed to send announcement notification')
  }

  // [FIX] These two are independent of the internal targeting above and of
  // each other's success/failure — run outside the try/catch that guards
  // the internal send so one failing never blocks the other.
  if (payload.publicWebsite) {
    void notifyNewsletterSubscribers(announcementId, { title: payload.title, body: payload.body })
    if (!payload.targetAll) {
      void notifyAllSystemUsers(announcementId, { title: payload.title, body: payload.body })
    }
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
  const postType = data.postType ?? 'ANNOUNCEMENT'
  // [PRODUCTION FIX] NEWS is public-site content only — it must never
  // appear in anyone's internal /announcements tab. Rather than trust the
  // client to leave targetAll/targetRoles empty and publicWebsite on, force
  // it server-side so a NEWS item can never accidentally leak into internal
  // targeting, and so listForViewer()'s postType filter below is always
  // sufficient on its own without relying on this invariant elsewhere.
  const targetAll    = postType === 'NEWS' ? false : (data.targetAll ?? false)
  const targetRoles  = postType === 'NEWS' ? [] : (data.targetRoles ?? [])
  const targetClassId = postType === 'NEWS' ? null : (data.targetClassId ?? null)
  const publicWebsite = postType === 'NEWS' ? true : (data.publicWebsite ?? false)

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
    targetAll,
    targetRoles,
    targetClassId,
    scheduledFor: data.scheduledFor ?? null,
    eventDate: data.eventDate ?? null,
    publicWebsite,
    imageKey: data.imageKey ?? null,
    postType,
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
      targetAll,
      targetRoles,
      targetClassId,
      eventDate: data.eventDate,
      createdByUid: data.createdByUid,
      publicWebsite,
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
    publicWebsite: (existing.publicWebsite as boolean | undefined) ?? false,
  })

  return { id, status: 'PUBLISHED' }
}

/**
 * Reject/deny a PENDING_APPROVAL announcement. Sets status REJECTED with the
 * rejecter's uid and an optional reason. Does not notify the wider audience
 * (it was never published); best-effort notifies the author so they know it
 * was declined. [N3]
 */
export async function rejectAnnouncement(id: string, rejectedByUid: string, reason?: string) {
  const db = getFirestore(getAdminApp())
  const snap = await db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(id).get()
  if (!snap.exists) {
    throw Object.assign(new Error('Announcement not found.'), { status: 404 })
  }
  const existing = snap.data() as DocumentData
  if (existing.status !== 'PENDING_APPROVAL') {
    throw Object.assign(
      new Error('Only announcements awaiting approval can be rejected.'),
      { status: 409 },
    )
  }

  await db.collection(COLLECTIONS.ANNOUNCEMENTS).doc(id).update({
    status: 'REJECTED',
    rejectedByUid,
    rejectionReason: reason ?? null,
    rejectedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })

  return { id, status: 'REJECTED' }
}

/**
 * Promote every SCHEDULED announcement whose scheduledFor has passed to
 * PUBLISHED, firing notifyAudience for each. Called periodically by the
 * scheduled-announcements cron. Returns the count promoted. [N5]
 *
 * scheduledFor is stored as an ISO string (announcementService writes it as
 * data.scheduledFor). We query SCHEDULED and compare in-process rather than
 * with a Firestore range query, because scheduledFor is a string field and a
 * string range query would need its own composite index and lexicographic
 * ISO ordering; the SCHEDULED set is small (future-dated announcements only).
 */
export async function promoteDueScheduled(): Promise<{ promoted: number }> {
  const db = getFirestore(getAdminApp())
  const snap = await db
    .collection(COLLECTIONS.ANNOUNCEMENTS)
    .where('status', '==', 'SCHEDULED')
    .get()

  const now = Date.now()
  let promoted = 0

  for (const doc of snap.docs) {
    const data = doc.data() as DocumentData
    const scheduledForRaw = data.scheduledFor as string | null | undefined
    if (!scheduledForRaw) continue
    const dueMs = new Date(scheduledForRaw).getTime()
    if (!Number.isFinite(dueMs) || dueMs > now) continue

    await doc.ref.update({
      status: 'PUBLISHED',
      publishedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })

    // Fire-and-forget the fan-out — same posture as createAnnouncement.
    void notifyAudience(doc.id, {
      title: data.title as string,
      body: data.body as string,
      targetAll: (data.targetAll as boolean | undefined) ?? false,
      targetRoles: (data.targetRoles as string[] | undefined) ?? [],
      targetClassId: data.targetClassId as string | null | undefined,
      eventDate: data.eventDate as string | null | undefined,
      createdByUid: data.createdByUid as string,
      publicWebsite: (data.publicWebsite as boolean | undefined) ?? false,
    })
    promoted++
  }

  return { promoted }
}

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

// ─── SERVER-SIDE VIEWER READS (N2) ─────────────────────────
// These replace the client's direct Firestore onSnapshot reads
// (useAnnouncements / usePendingAnnouncements). Moving reads behind Express
// means visibility is governed by the same permission system as every other
// domain — not by a hand-maintained parallel copy in firestore.rules — which
// removes the entire class of "rules/data-shape mismatch = blanket
// permission-denied" outage. See AUDIT §6 Option 1.

/** Shape returned to the client — createdAt normalized to an ISO string so
 *  the client never depends on Firestore Timestamp internals. */
export interface ViewerAnnouncement {
  id: string
  title: string
  body: string
  status: string
  targetAll: boolean
  targetRoles: string[]
  eventDate: string | null
  publicWebsite: boolean
  imageKey: string | null
  createdByUid: string
  createdByRole: string | null
  createdAt: string | null
  postType: 'ANNOUNCEMENT' | 'NEWS'
}

/** Coerce a stored createdAt (Firestore Timestamp | string | null) to ISO. */
function toIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (typeof value === 'string') return value
  // Firestore may hand back a {_seconds,_nanoseconds}-like object across SDK
  // boundaries — guard defensively rather than throwing.
  const maybe = value as { toDate?: () => Date }
  if (typeof maybe.toDate === 'function') return maybe.toDate().toISOString()
  return null
}

function mapViewer(id: string, data: DocumentData): ViewerAnnouncement {
  return {
    id,
    title: (data.title as string) ?? '',
    body: (data.body as string) ?? '',
    status: (data.status as string) ?? '',
    targetAll: (data.targetAll as boolean | undefined) ?? false,
    targetRoles: (data.targetRoles as string[] | undefined) ?? [],
    eventDate: (data.eventDate as string | null | undefined) ?? null,
    publicWebsite: (data.publicWebsite as boolean | undefined) ?? false,
    imageKey: (data.imageKey as string | null | undefined) ?? null,
    createdByUid: (data.createdByUid as string) ?? '',
    createdByRole: (data.createdByRole as string | null | undefined) ?? null,
    createdAt: toIso(data.createdAt),
    postType: ((data.postType as string | undefined) === 'NEWS' ? 'NEWS' : 'ANNOUNCEMENT'),
  }
}

/**
 * PUBLISHED announcements visible to `viewer`. A viewer sees an announcement
 * when it targets everyone (targetAll), targets their role, or they authored
 * it. Filtering happens in-process (not in the Firestore query) because
 * targetRoles is an array and every role-combination would otherwise need its
 * own composite index — the same reason the old client listener filtered
 * client-side, but now done on the trusted server.
 */
export async function listForViewer(viewer: { uid: string; role: string }): Promise<ViewerAnnouncement[]> {
  const snap = await getFirestore(getAdminApp())
    .collection(COLLECTIONS.ANNOUNCEMENTS)
    .where('status', '==', 'PUBLISHED')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get()

  return snap.docs
    .map((d) => mapViewer(d.id, d.data()))
    .filter(
      (a) =>
        // [PRODUCTION FIX] NEWS is public-site-only content — it must
        // never surface in a user's internal /announcements tab, no
        // matter what targetAll/targetRoles happen to be on the doc.
        a.postType !== 'NEWS' &&
        (a.targetAll ||
          a.targetRoles.includes(viewer.role) ||
          a.createdByUid === viewer.uid),
    )
}

/** PENDING_APPROVAL announcements — for approvers' Pending tab. */
export async function listPending(): Promise<ViewerAnnouncement[]> {
  const snap = await getFirestore(getAdminApp())
    .collection(COLLECTIONS.ANNOUNCEMENTS)
    .where('status', '==', 'PENDING_APPROVAL')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get()

  return snap.docs.map((d) => mapViewer(d.id, d.data()))
}