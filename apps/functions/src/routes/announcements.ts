import { Router } from 'express'
import { verifyAuth, requireRole } from '../middleware/auth'
import * as admin from 'firebase-admin'

export const announcementsRouter = Router()

// PATCH /announcements/:id/approve — admin/high_rank approves a pending announcement
announcementsRouter.patch(
  '/:id/approve',
  verifyAuth,
  requireRole(['admin', 'high_rank']),
  async (req, res) => {
    const { id } = req.params as { id: string }
    await admin.firestore().collection('announcements').doc(id).update({
      status: 'PUBLISHED',
      approvedByUid: req.user!.uid,
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    return res.json({ success: true })
  }
)

// DELETE /announcements/:id — admin/high_rank can remove an announcement
announcementsRouter.delete(
  '/:id',
  verifyAuth,
  requireRole(['admin', 'high_rank']),
  async (req, res) => {
    const { id } = req.params as { id: string }
    await admin.firestore().collection('announcements').doc(id).delete()
    return res.json({ success: true })
  }
)
