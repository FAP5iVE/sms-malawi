import 'server-only'

/**
 * apps/web/src/server/routes/sessions.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Reports > Admin > Sessions tab — list who's logged in / been
 *   active recently, force-logout, and the per-session activity drill-down.
 *   Gated on the two permissions permissions.ts already declared for this
 *   (userMgmt.viewActiveSessions / userMgmt.terminateSession, admin only)
 *   with zero callers until now.
 * [DEPENDS ON]: W/server/services/sessionService.ts
 */

import { Router, type Request, type Response } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as sessionService from '@/server/services/sessionService'
import type { SessionWindow } from '@/server/services/sessionService'

export const sessionsRouter = Router()

const VALID_WINDOWS = new Set<SessionWindow>(['10m', '30m', '1h', 'all'])

// ─────────────────────────────────────────────────────────
//  GET /sessions?window=10m|30m|1h|all
//  Session list, most recently active first. Default 'all'.
// ─────────────────────────────────────────────────────────

sessionsRouter.get(
  '/',
  verifyAuth,
  requirePermission('userMgmt.viewActiveSessions'),
  async (req: Request, res: Response) => {
    const raw = req.query.window ? String(req.query.window) : 'all'
    const window = (VALID_WINDOWS.has(raw as SessionWindow) ? raw : 'all') as SessionWindow

    const sessions = await sessionService.listSessions(window)
    res.json({ sessions, window })
  }
)

// ─────────────────────────────────────────────────────────
//  GET /sessions/summary
//  KPI-strip counts for the tab header.
// ─────────────────────────────────────────────────────────

sessionsRouter.get(
  '/summary',
  verifyAuth,
  requirePermission('userMgmt.viewActiveSessions'),
  async (_req: Request, res: Response) => {
    res.json(await sessionService.getSessionSummary())
  }
)

// ─────────────────────────────────────────────────────────
//  GET /sessions/:id/activity
//  Everything the session's owner did, scoped to that session's own
//  loginAt → loggedOutAt (or now) window.
// ─────────────────────────────────────────────────────────

sessionsRouter.get(
  '/:id/activity',
  verifyAuth,
  requirePermission('userMgmt.viewActiveSessions'),
  async (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '')
    const result = await sessionService.getSessionActivity(id)
    if (!result) {
      res.status(404).json({ error: 'Session not found.' })
      return
    }
    res.json(result)
  }
)

// ─────────────────────────────────────────────────────────
//  POST /sessions/:uid/force-logout
//  Revokes every refresh token the uid holds (Firebase has no per-device
//  revocation) and closes their open session row.
// ─────────────────────────────────────────────────────────

sessionsRouter.post(
  '/:uid/force-logout',
  verifyAuth,
  requirePermission('userMgmt.terminateSession'),
  async (req: Request, res: Response) => {
    const uid = String(req.params['uid'] ?? '')
    if (!uid) {
      res.status(400).json({ error: 'uid is required.' })
      return
    }
    // Self-protection: force-logout is a one-click, no-confirmation-of-
    // identity action from this table. Doing it to yourself while
    // reviewing the list would just sign you straight out mid-review —
    // use the normal sign-out flow for that instead.
    if (uid === req.user!.uid) {
      res.status(400).json({ error: "You can't force-logout your own session from here — sign out normally instead." })
      return
    }
    await sessionService.forceLogout(uid, req.user!.uid, req.user!.role)
    res.json({ success: true })
  }
)
