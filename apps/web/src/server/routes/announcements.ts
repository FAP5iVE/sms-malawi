/*
 * apps/web/src/server/routes/announcements.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]: Implements the previously entirely-unimplemented
 *   announcement.{create,createWithApproval,editOwn,publishDirect,
 *   schedule} permission cluster — only announcement.approvePublish (via
 *   PATCH /:id/approve) and an admin/high_rank-only delete-any existed
 *   before this phase.
 *   - Added POST / (create): high_rank (holding both announcement.create
 *     and announcement.publishDirect) publishes directly; the other seven
 *     roles holding announcement.createWithApproval create a
 *     PENDING_APPROVAL announcement instead. Gated by
 *     requireAnyPermission(['announcement.create','announcement.createWithApproval']) —
 *     admin holds neither and is correctly rejected with 403. Which
 *     branch a request takes is decided server-side via hasPermission(),
 *     never trusted from a client-supplied flag.
 *   - Added PATCH /:id (editOwn), ownership-scoped to the announcement's
 *     own author (announcement.editOwn does not grant editing another
 *     author's announcement).
 *   - PATCH /:id/approve: was requireRole(['admin','high_rank']),
 *     excluding academic despite academic formally holding
 *     announcement.approvePublish per the permission matrix — the third
 *     confirmed instance in this audit of a role excluded from a route
 *     despite holding the permission. Converged onto
 *     requirePermission('announcement.approvePublish') (matches this
 *     project's standing R4 convention: domain phases replace
 *     hand-maintained requireRole arrays with requirePermission as that
 *     domain is touched), which naturally includes admin/high_rank/
 *     academic with no hardcoded list to drift out of sync. The inline
 *     Firestore update is replaced with a call to
 *     announcementService.publishAnnouncement() — the service function
 *     existed but had zero real callers before this phase.
 *   - DELETE /:id (deleteAny): converged from requireRole(['admin',
 *     'high_rank']) onto requirePermission('announcement.deleteAny') for
 *     the same reason — admin and high_rank are exactly and only the two
 *     roles holding it, so this is a zero-behavior-change correctness
 *     improvement, not a new restriction.
 *   - Added `import 'server-only'`.
 * [DEPENDS ON]: apps/web/src/server/services/announcementService.ts (this
 *   phase's rewrite), @shared/types/permissions (hasPermission — decides
 *   the create/publish-vs-pending branch), @shared/schemas/announcement
 *   (AnnouncementSchema — request body validation, previously absent on
 *   this router entirely)
 */
import 'server-only'

import { Router } from 'express'
import * as admin from 'firebase-admin'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission, requireAnyPermission } from '@/server/middleware/verifyPermission'
import { hasPermission } from '@shared/types/permissions'
import { COLLECTIONS } from '@shared/constants/storage'
import { AnnouncementSchema } from '@shared/schemas/announcement'
import * as announcementService from '@/server/services/announcementService'

export const announcementsRouter = Router()

// POST /announcements — create. high_rank publishes directly;
// finance/library/lower_rank/academic/hr/exam_officer/student create a
// PENDING_APPROVAL announcement instead. admin holds neither permission
// and is rejected below by the route gate itself.
announcementsRouter.post(
  '/',
  verifyAuth,
  requireAnyPermission(['announcement.create', 'announcement.createWithApproval']),
  async (req, res) => {
    const parsed = AnnouncementSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const { user } = req
    if (!user) return res.status(401).json({ error: 'Not authenticated.' })

    const directPublish = hasPermission(user.role, 'announcement.publishDirect')

    // announcement.schedule is high_rank-only — silently drop scheduledFor
    // for any other role rather than erroring, since the schema itself
    // doesn't know the actor's role.
    const scheduledFor = hasPermission(user.role, 'announcement.schedule')
      ? parsed.data.scheduledFor
      : undefined

    try {
      const created = await announcementService.createAnnouncement(
        {
          title: parsed.data.title,
          body: parsed.data.body,
          targetAll: parsed.data.targetAll,
          targetRoles: parsed.data.targetRoles,
          targetClassId: parsed.data.targetClassId,
          scheduledFor,
          eventDate: parsed.data.eventDate,
          createdByUid: user.uid,
          createdByRole: user.role,
        },
        directPublish
      )
      return res.status(201).json(created)
    } catch (err: unknown) {
      const e = err as Error
      return res.status(400).json({ error: e.message })
    }
  }
)

// PATCH /announcements/:id — editOwn, ownership-scoped to the author.
announcementsRouter.patch(
  '/:id',
  verifyAuth,
  requirePermission('announcement.editOwn'),
  async (req, res) => {
    const { id } = req.params as { id: string }
    const { user } = req
    if (!user) return res.status(401).json({ error: 'Not authenticated.' })

    const ref = admin.firestore().collection(COLLECTIONS.ANNOUNCEMENTS).doc(id)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Announcement not found.' })
    if (snap.data()?.createdByUid !== user.uid) {
      return res.status(403).json({ error: 'You can only edit your own announcements.' })
    }

    const parsed = AnnouncementSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })

    await ref.update({
      ...parsed.data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    return res.json({ success: true })
  }
)

// PATCH /announcements/:id/approve
announcementsRouter.patch(
  '/:id/approve',
  verifyAuth,
  requirePermission('announcement.approvePublish'),
  async (req, res) => {
    const { id } = req.params as { id: string }
    const { user } = req
    if (!user) return res.status(401).json({ error: 'Not authenticated.' })

    try {
      const result = await announcementService.publishAnnouncement(id, user.uid)
      return res.json(result)
    } catch (err: unknown) {
      const e = err as Error & { status?: number }
      return res.status(e.status ?? 400).json({ error: e.message })
    }
  }
)

// DELETE /announcements/:id
announcementsRouter.delete(
  '/:id',
  verifyAuth,
  requirePermission('announcement.deleteAny'),
  async (req, res) => {
    const { id } = req.params as { id: string }
    await admin.firestore().collection(COLLECTIONS.ANNOUNCEMENTS).doc(id).delete()
    return res.json({ success: true })
  }
)
