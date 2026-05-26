import { Router } from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import * as admin from 'firebase-admin'

export const announcementsRouter = Router()

// PATCH /announcements/:id/approve
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

// DELETE /announcements/:id
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