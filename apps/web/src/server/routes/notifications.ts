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
import { logger }         from '@/lib/logger'

export const notificationsRouter = Router()

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
      res.status(500).json({ error: 'Failed to register notification token.' })
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
      res.status(500).json({ error: 'Failed to unregister notification token.' })
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
      res.status(500).json({ error: 'Failed to retrieve token status.' })
    }
  }
)
