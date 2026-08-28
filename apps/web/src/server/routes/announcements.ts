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
import multer from 'multer'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { verifyAuth, getAdminApp } from '@/lib/verifyAuth'
import { requirePermission, requireAnyPermission } from '@/server/middleware/verifyPermission'
import { hasPermission } from '@shared/types/permissions'
import { COLLECTIONS } from '@shared/constants/storage'
import { AnnouncementSchema } from '@shared/schemas/announcement'
import * as announcementService from '@/server/services/announcementService'
import { uploadFile, FILE_PREFIX } from '@/lib/storage'
import { sendError } from '@/server/lib/sendError'

export const announcementsRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }) // 8MB

// GET /announcements — PUBLISHED announcements visible to the caller's role.
// [N2] Replaces useAnnouncements.ts's direct client Firestore read. Gated by
// announcement.view (every role holds it); per-item visibility (targetAll /
// targetRoles / own-authored) is resolved server-side in the service.
announcementsRouter.get(
  '/',
  verifyAuth,
  requirePermission('announcement.view'),
  async (req, res) => {
    const { user } = req
    if (!user) return res.status(401).json({ error: 'Not authenticated.' })
    try {
      const announcements = await announcementService.listForViewer({ uid: user.uid, role: user.role })
      return res.json({ announcements })
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'announcements' } })
    }
  }
)

// GET /announcements/pending — PENDING_APPROVAL queue for approvers.
// [N2] Replaces usePendingAnnouncements.ts's direct client Firestore read.
// Gated by announcement.approvePublish, so only approvers
// (admin/high_rank/lower_rank/academic) can reach it — this also fixes the
// firestore.rules gap where academic/lower_rank approvers could not read
// pending items they didn't author.
announcementsRouter.get(
  '/pending',
  verifyAuth,
  requirePermission('announcement.approvePublish'),
  async (_req, res) => {
    try {
      const announcements = await announcementService.listPending()
      return res.json({ announcements })
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'announcements' } })
    }
  }
)

// POST /announcements/image — uploads a cover image ahead of the Firestore
// write. AnnouncementForm.tsx writes the announcement document directly to
// Firestore from the client (see its own header comment) rather than
// through POST /, so this is a small standalone endpoint the form calls
// first to get back a fileId to include in that write. Gated on the same
// permission as creating an announcement at all — no separate elevated
// permission needed to attach an image to your own announcement.
announcementsRouter.post(
  '/image',
  verifyAuth,
  requireAnyPermission(['announcement.create', 'announcement.createWithApproval']),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are allowed.' })
    }
    const uploaded = await uploadFile(
      FILE_PREFIX.ANNOUNCEMENT_IMAGE,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    )
    res.status(201).json({ imageKey: uploaded.fileId })
  },
)

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
          publicWebsite: parsed.data.publicWebsite,
          imageKey: parsed.data.imageKey,
          postType: parsed.data.postType,
          createdByUid: user.uid,
          createdByRole: user.role,
        },
        directPublish
      )
      return res.status(201).json(created)
    } catch (err: unknown) {
      return sendError(res, err, { defaultStatus: 400, tags: { module: 'announcements' } })
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

    const ref = getFirestore(getAdminApp()).collection(COLLECTIONS.ANNOUNCEMENTS).doc(id)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Announcement not found.' })
    if (snap.data()?.createdByUid !== user.uid) {
      return res.status(403).json({ error: 'You can only edit your own announcements.' })
    }

    const parsed = AnnouncementSchema.partial().safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })

    await ref.update({
      ...parsed.data,
      updatedAt: FieldValue.serverTimestamp(),
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
      return sendError(res, err, { defaultStatus: 400, tags: { module: 'announcements' } })
    }
  }
)

// PATCH /announcements/:id/reject — deny a pending announcement. [N3]
announcementsRouter.patch(
  '/:id/reject',
  verifyAuth,
  requirePermission('announcement.reject'),
  async (req, res) => {
    const { id } = req.params as { id: string }
    const { user } = req
    if (!user) return res.status(401).json({ error: 'Not authenticated.' })
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : undefined
    try {
      const result = await announcementService.rejectAnnouncement(id, user.uid, reason)
      return res.json(result)
    } catch (err: unknown) {
      return sendError(res, err, { defaultStatus: 400, tags: { module: 'announcements' } })
    }
  }
)

// DELETE /announcements/:id — deleteAny (any announcement) OR deleteOwn
// (author's own). [N3] Previously required deleteAny only, so an author
// could never withdraw their own announcement.
announcementsRouter.delete(
  '/:id',
  verifyAuth,
  requireAnyPermission(['announcement.deleteAny', 'announcement.deleteOwn']),
  async (req, res) => {
    const { id } = req.params as { id: string }
    const { user } = req
    if (!user) return res.status(401).json({ error: 'Not authenticated.' })

    const ref = getFirestore(getAdminApp()).collection(COLLECTIONS.ANNOUNCEMENTS).doc(id)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: 'Announcement not found.' })

    // deleteAny may delete anything; otherwise the caller must be the author.
    const canDeleteAny = hasPermission(user.role, 'announcement.deleteAny')
    if (!canDeleteAny && snap.data()?.createdByUid !== user.uid) {
      return res.status(403).json({ error: 'You can only delete your own announcements.' })
    }

    await ref.delete()
    return res.json({ success: true })
  }
)