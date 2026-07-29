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
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import * as auditService from '@/server/services/auditService'

export const authRouter = Router()

// POST /auth/log-login-success — called once a Firebase sign-in has
// actually succeeded, so a valid ID token exists and verifyAuth can
// resolve the real uid/role.
authRouter.post('/log-login-success', verifyAuth, async (req, res) => {
  await auditService.log({
    action:     'LOGIN_SUCCESS',
    entityType: 'Auth',
    entityId:   req.user!.uid,
    actorUid:   req.user!.uid,
    actorRole:  req.user!.role,
  })
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