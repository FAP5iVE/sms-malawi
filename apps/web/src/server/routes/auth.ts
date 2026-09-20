/**
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-28)
 * [FILE]: apps/web/src/server/routes/auth.ts
 * [PURPOSE]: Closes a real gap found while investigating the admin
 *   dashboard's "User Activity" login-trend graph showing no data despite
 *   real logins happening: analyticsService.getAdminLoginTrend() queries
 *   AuditLog for action IN ('LOGIN_SUCCESS', 'LOGIN_FAILED') — but nothing
 *   anywhere in the codebase ever wrote a row with either action. The
 *   query was always correct; the write path never existed. Login itself
 *   happens client-side via the Firebase Auth SDK directly (not through
 *   this Express API), so these two endpoints are what login/page.tsx
 *   calls right after a sign-in attempt succeeds or fails, to actually
 *   produce the data the graph has been querying for all along.
 * [DEPENDS ON]: W/server/services/auditService.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT (Sessions tab, Reports > Admin). Adds three
 *   endpoints powering sessionService's UserSession rows — the write side
 *   of "who's logged in now" / force logout / duration tracking:
 *     - log-login-success now also opens a UserSession row (unchanged
 *       AuditLog write kept exactly as-is, same reasoning as above).
 *     - POST /auth/heartbeat — pinged every ~60s by useSessionHeartbeat.ts
 *       while a tab is open, bumping the session's lastSeenAt so "active
 *       now" reflects real recent activity, not just "never logged out".
 *     - POST /auth/log-logout — called by AuthProvider's logout() BEFORE
 *       signOut(auth), same sequencing as its FCM-unregister-before-
 *       signout fix and for the same reason: this needs a still-valid
 *       token to authenticate.
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import * as auditService from '@/server/services/auditService'
import * as sessionService from '@/server/services/sessionService'

export const authRouter = Router()

// POST /auth/log-login-success — called once a Firebase sign-in has
// actually succeeded, so a valid ID token exists and verifyAuth can
// resolve the real uid/role.
authRouter.post('/log-login-success', verifyAuth, async (req, res) => {
  // [PRODUCTION FIX — Sessions tab] recordLogin() runs BEFORE the audit
  // write, not after. Both use their table's own @default(now()), and
  // this handler awaits each in turn rather than firing them together —
  // so whichever call is made second is guaranteed a strictly later
  // timestamp. With the audit write second, this LOGIN_SUCCESS entry's
  // createdAt is always >= the session's own loginAt, so
  // sessionService.getSessionActivity()'s dateFrom: loginAt bound
  // (queryByActor's `gte`) is guaranteed to include it. The previous
  // order did this backwards — the audit entry (written first) landed a
  // few milliseconds BEFORE loginAt (written second), so every session's
  // own opening LOGIN_SUCCESS event fell just outside its own activity
  // window and silently never appeared there.
  await sessionService.recordLogin({
    uid: req.user!.uid,
    role: req.user!.role,
    userAgent: req.headers['user-agent'],
    // req.ip reads Vercel's edge hop unless 'trust proxy' is set — it is,
    // in api-app.ts's createApiApp() (R4 fix, same reasoning applies here).
    ipAddress: req.ip,
  })
  await auditService.log({
    action:     'LOGIN_SUCCESS',
    entityType: 'Auth',
    entityId:   req.user!.uid,
    actorUid:   req.user!.uid,
    actorRole:  req.user!.role,
  })
  res.status(204).end()
})

// POST /auth/heartbeat — bumps the caller's open session's lastSeenAt.
// Fire-and-forget from the client's perspective; failures here must never
// surface as a user-facing error, so the client hook (useSessionHeartbeat)
// swallows rejections same as the FCM registration path does.
authRouter.post('/heartbeat', verifyAuth, async (req, res) => {
  await sessionService.heartbeat(req.user!.uid)
  res.status(204).end()
})

// POST /auth/log-logout — closes the caller's open session cleanly
// (endReason: 'logout', as opposed to an admin's forced 'forced' or a
// fresh login's 'new_login'). Called from AuthProvider.logout() before
// signOut(auth) actually clears the Firebase session.
authRouter.post('/log-logout', verifyAuth, async (req, res) => {
  await sessionService.recordLogout(req.user!.uid)
  res.status(204).end()
})

// POST /auth/log-login-failed — deliberately unauthenticated (a failed
// sign-in has no valid token to verify). Payload is minimal by design —
// this only ever records that an attempt failed, for the security
// dashboard's trend graph, not who specifically attempted it beyond the
// email they typed.
authRouter.post('/log-login-failed', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.slice(0, 200) : 'unknown'
  await auditService.log({
    action:     'LOGIN_FAILED',
    entityType: 'Auth',
    entityId:   email,
    actorUid:   email,
    actorRole:  'unknown',
  })
  res.status(204).end()
})