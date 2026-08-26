import 'server-only'

import { Router }         from 'express'
import { z }              from 'zod'
import { verifyAuth }     from '@/lib/verifyAuth'
import {
  registerToken,
  unregisterToken,
  getTokensForUser,
  subscribeUserToDefaultTopics,
} from '@/lib/push'
import * as notificationFeedService from '@/server/services/notificationFeedService'
import { logger }         from '@/lib/logger'
import { sendError } from '@/server/lib/sendError'

export const notificationsRouter = Router()

// ─── GET /notifications/feed ─────────────────────────────
// [N4] The real per-user in-app notification feed. Reads the
// notifications/{uid}/items collection server-side (Admin SDK) and returns
// items + unreadCount. Replaces useNotificationFeed.ts's re-read of
// announcements. Any authenticated role; a user only ever sees their own feed.
notificationsRouter.get(
  '/feed',
  verifyAuth,
  async (req, res) => {
    const uid = req.user!.uid
    try {
      const result = await notificationFeedService.listFeed(uid)
      res.status(200).json(result)
    } catch (err) {
      logger.error({ err, uid }, '[notifications] Failed to list feed')
      sendError(res, err, { publicMessage: 'Failed to load notifications.', tags: { module: 'notifications' } })
    }
  }
)

// ─── PATCH /notifications/feed/read-all ──────────────────
// Marks every unread item read. Declared before /feed/:id/read so 'read-all'
// isn't captured as an :id.
notificationsRouter.patch(
  '/feed/read-all',
  verifyAuth,
  async (req, res) => {
    const uid = req.user!.uid
    try {
      const count = await notificationFeedService.markAllRead(uid)
      res.status(200).json({ ok: true, marked: count })
    } catch (err) {
      logger.error({ err, uid }, '[notifications] Failed to mark all read')
      sendError(res, err, { publicMessage: 'Failed to update notifications.', tags: { module: 'notifications' } })
    }
  }
)

// ─── PATCH /notifications/feed/:id/read ──────────────────
notificationsRouter.patch(
  '/feed/:id/read',
  verifyAuth,
  async (req, res) => {
    const uid = req.user!.uid
    const { id } = req.params as { id: string }
    try {
      await notificationFeedService.markRead(uid, id)
      res.status(200).json({ ok: true })
    } catch (err) {
      logger.error({ err, uid, id }, '[notifications] Failed to mark read')
      sendError(res, err, { publicMessage: 'Failed to update notification.', tags: { module: 'notifications' } })
    }
  }
)

// ─── REQUEST SCHEMAS ─────────────────────────────────────

const RegisterTokenSchema = z.object({
  token:      z.string().min(100, 'FCM token appears too short').max(4096, 'FCM token too long'),
  deviceInfo: z.string().max(200).optional().default('Unknown browser'),
})

const UnregisterTokenSchema = z.object({
  token: z.string().min(1, 'token is required').max(4096),
})

// ─── POST /notifications/register-token ──────────────────
// Registers a device's FCM token for the authenticated user.
// Called by AuthProvider.tsx after a successful login when push
// notifications are supported and the user has granted permission.
//
// Body:  { token: string, deviceInfo?: string }
// Auth:  Any authenticated role.
// Idempotent: calling with the same token updates its lastSeenAt timestamp.

notificationsRouter.post(
  '/register-token',
  verifyAuth,
  async (req, res) => {
    const parse = RegisterTokenSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request body.' })
      return
    }

    const { token, deviceInfo } = parse.data
    const uid = req.user!.uid
    const role = req.user!.role

    try {
      await registerToken(uid, token, deviceInfo)

      // Subscribe the user to default FCM topics for their role.
      // This is done server-side so the topic list stays consistent with
      // the server's role definitions — not dependent on client-side logic.
      //
      // Topics subscribed:
      //   • 'announcements_all'           — every user
      //   • 'announcements_staff'         — all non-student roles
      //   • 'announcements_students'      — student role
      //   • 'announcements_academic'      — academic + exam_officer roles
      //
      // Class-specific topics (announcements_class_{classId}) are NOT subscribed
      // here because classId is not in the JWT claims. The student/teacher's
      // classId must be fetched from the database to subscribe correctly.
      // That is handled in a later phase when the class assignment is confirmed.
      void subscribeUserToDefaultTopics(uid, role)

      logger.info({ uid, role }, '[notifications] FCM token registered')
      res.status(200).json({ ok: true })
    } catch (err) {
      logger.error({ err, uid }, '[notifications] Failed to register FCM token')
      sendError(res, err, { publicMessage: 'Failed to register notification token.', tags: { module: 'notifications' } })
    }
  }
)

// ─── DELETE /notifications/unregister-token ──────────────
// Removes a specific FCM token from the authenticated user's token list.
// Called by AuthProvider.tsx on logout (best-effort — the client also calls
// Firebase SDK's deleteToken() directly for immediate deregistration).
//
// Body:  { token: string }
// Auth:  Any authenticated role.
// Idempotent: removing a non-existent token is a no-op.

notificationsRouter.delete(
  '/unregister-token',
  verifyAuth,
  async (req, res) => {
    const parse = UnregisterTokenSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request body.' })
      return
    }

    const { token } = parse.data
    const uid = req.user!.uid

    try {
      await unregisterToken(uid, token)

      logger.info({ uid }, '[notifications] FCM token unregistered')
      res.status(200).json({ ok: true })
    } catch (err) {
      logger.error({ err, uid }, '[notifications] Failed to unregister FCM token')
      sendError(res, err, { publicMessage: 'Failed to unregister notification token.', tags: { module: 'notifications' } })
    }
  }
)

// ─── GET /notifications/token-status ─────────────────────
// Returns whether the authenticated user has any registered FCM tokens.
// Used by the Settings / Notification Preferences page to display the
// current push notification status without triggering permission prompts.
//
// Response: { hasTokens: boolean, tokenCount: number }
// Auth:     Any authenticated role.

notificationsRouter.get(
  '/token-status',
  verifyAuth,
  async (req, res) => {
    const uid = req.user!.uid

    try {
      const tokens = await getTokensForUser(uid)
      res.status(200).json({ hasTokens: tokens.length > 0, tokenCount: tokens.length })
    } catch (err) {
      logger.error({ err, uid }, '[notifications] Failed to get token status')
      sendError(res, err, { publicMessage: 'Failed to retrieve token status.', tags: { module: 'notifications' } })
    }
  }
)