import 'server-only'

/**
 * apps/web/src/server/services/sessionService.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Backs the Reports > Admin > Sessions tab — "who is logged in
 *   right now", force-logout, and per-session activity drill-down.
 *   permissions.ts already declared userMgmt.viewActiveSessions /
 *   userMgmt.terminateSession (granted to admin) with zero callers
 *   anywhere in the codebase; this is that implementation.
 *
 *   One OPEN (loggedOutAt IS NULL) UserSession row per uid at a time —
 *   see schema.prisma's UserSession header comment for why: Firebase
 *   Admin's revokeRefreshTokens(uid) has no per-device granularity, so
 *   "force logout" is always a per-person action, never per-device.
 *   recordLogin() closes any still-open row for the same uid
 *   (endReason: 'new_login') before opening a fresh one.
 *
 *   "Currently active" is NOT merely "never logged out" — a browser
 *   closed without a clean sign-out would otherwise look active forever.
 *   It's computed from lastSeenAt (bumped by a ~60s client heartbeat,
 *   POST /auth/heartbeat) falling inside ACTIVE_GRACE_MS of now.
 * [DEPENDS ON]: W/lib/prisma.ts, W/server/services/auditService.ts
 *   (queryByActor — reused as-is for the per-session activity drill-down,
 *   and 'auth.session_revoked' — already CRITICAL in ACTION_SEVERITY with
 *   zero callers until now).
 */

import * as admin from 'firebase-admin'
import type { UserRecord } from 'firebase-admin/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import * as auditService from '@/server/services/auditService'
import { getAdminApp } from '@/lib/verifyAuth'
import type { AuditLogRow } from '@/server/services/auditService'

function getAuth() { return admin.auth(getAdminApp()) }

// A session counts as "active now" if we've heard from it (heartbeat or
// any authenticated request that bumps lastSeenAt) within this long.
// Comfortably wider than the ~60s heartbeat interval so one missed beat
// (a backgrounded tab, a flaky connection) doesn't flip someone to
// "offline" and back every other poll.
const ACTIVE_GRACE_MS = 3 * 60 * 1000 // 3 minutes

export type SessionWindow = '10m' | '30m' | '1h' | 'all'

function windowToMs(window: SessionWindow): number | null {
  switch (window) {
    case '10m': return 10 * 60 * 1000
    case '30m': return 30 * 60 * 1000
    case '1h':  return 60 * 60 * 1000
    case 'all': return null
  }
}

export interface SessionRow {
  id: string
  uid: string
  role: string
  displayName: string | null
  email: string | null
  employeeNo: string | null
  registrationNo: string | null
  loginAt: Date
  lastSeenAt: Date
  loggedOutAt: Date | null
  endReason: string | null
  isActiveNow: boolean
  durationMs: number
}

// ─────────────────────────────────────────────────────────
//  WRITE PATH — called from server/routes/auth.ts
// ─────────────────────────────────────────────────────────

/**
 * Open a new session for uid, closing any still-open one first. Called
 * right after a Firebase sign-in has succeeded (POST /auth/log-login-success).
 */
export async function recordLogin(params: {
  uid: string
  role: string
  userAgent?: string | string[] | null
  ipAddress?: string | null
}): Promise<{ id: string }> {
  const { uid, role, userAgent, ipAddress } = params
  // Express's req.headers['user-agent'] types as string | string[] |
  // undefined (a header can legally repeat) — collapse to one string.
  const userAgentStr = Array.isArray(userAgent) ? userAgent[0] : userAgent

  await prisma.userSession.updateMany({
    where: { uid, loggedOutAt: null },
    data: { loggedOutAt: new Date(), endReason: 'new_login' },
  })

  const session = await prisma.userSession.create({
    data: {
      uid,
      role,
      userAgent: userAgentStr?.slice(0, 300) ?? null,
      ipAddress: ipAddress?.slice(0, 100) ?? null,
    },
    select: { id: true },
  })

  return session
}

/**
 * Close uid's open session cleanly. Called by AuthProvider's logout()
 * BEFORE signOut(auth) — same sequencing as the FCM-unregister-before-
 * signout fix, and for the same reason: verifyAuth needs a still-valid
 * token to authenticate this call.
 */
export async function recordLogout(uid: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { uid, loggedOutAt: null },
    data: { loggedOutAt: new Date(), endReason: 'logout' },
  })
}

/**
 * Bump lastSeenAt on uid's open session. No-op if none is open (e.g. the
 * account predates this feature, or the open-session row was somehow
 * missed) — a heartbeat should never throw and interrupt the caller.
 */
export async function heartbeat(uid: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { uid, loggedOutAt: null },
    data: { lastSeenAt: new Date() },
  })
}

// ─────────────────────────────────────────────────────────
//  FORCE LOGOUT
// ─────────────────────────────────────────────────────────

/**
 * Force-terminate every session a user currently holds. Revokes Firebase
 * refresh tokens (so the user's NEXT token refresh — automatic ~55min
 * cycle, or the api-client.ts 401-retry force-refresh — fails and the
 * Firebase client SDK signs them out locally) and closes the open
 * UserSession row. Writes a CRITICAL audit entry under the exact action
 * string ('auth.session_revoked') ACTION_SEVERITY already reserved for
 * this.
 *
 * Relies on verifyAuth.ts's checkRevoked:true — without it, a revoked
 * token would keep passing verification until it naturally expired.
 */
export async function forceLogout(uid: string, actorUid: string, actorRole: string): Promise<void> {
  await getAuth().revokeRefreshTokens(uid)

  const closed = await prisma.userSession.updateMany({
    where: { uid, loggedOutAt: null },
    data: { loggedOutAt: new Date(), endReason: 'forced', forcedByUid: actorUid },
  })

  await auditService.log({
    action: 'auth.session_revoked',
    entityType: 'Auth',
    entityId: uid,
    actorUid,
    actorRole,
    metadata: { context: { targetUid: uid, sessionsClosed: closed.count } },
  })

  logger.info({ event: 'session.forced_logout', uid, actorUid }, '[sessionService] force logout')
}

// ─────────────────────────────────────────────────────────
//  DISPLAY-NAME RESOLUTION
//  Same batch-join shape as userManagementService.listUsers() —
//  StaffProfile/Student by uid, Firebase Auth for displayName/email.
// ─────────────────────────────────────────────────────────

async function resolveDisplayInfo(uids: string[]) {
  const uniqueUids = [...new Set(uids)]
  if (uniqueUids.length === 0) {
    return {
      byUid: new Map<string, { displayName: string | null; email: string | null }>(),
      employeeNoByUid: new Map<string, string>(),
      registrationNoByUid: new Map<string, string>(),
    }
  }

  // getUsers() accepts at most 100 identifiers per call.
  const CHUNK = 100
  const authRecords: UserRecord[] = []
  for (let i = 0; i < uniqueUids.length; i += CHUNK) {
    const chunk = uniqueUids.slice(i, i + CHUNK)
    try {
      const result = await getAuth().getUsers(chunk.map((uid) => ({ uid })))
      authRecords.push(...result.users)
    } catch (err) {
      // A uid that no longer exists in Firebase Auth (deleted account,
      // stale session row) shouldn't fail the whole list — it just falls
      // back to showing the bare uid.
      logger.warn({ err, chunk }, '[sessionService] getUsers batch failed')
    }
  }

  const byUid = new Map(
    authRecords.map((u) => [u.uid, { displayName: u.displayName ?? null, email: u.email ?? null }])
  )

  const [staff, students] = await Promise.all([
    prisma.staffProfile.findMany({ where: { uid: { in: uniqueUids } }, select: { uid: true, employeeNo: true } }),
    prisma.student.findMany({ where: { firebaseUid: { in: uniqueUids } }, select: { firebaseUid: true, registrationNo: true } }),
  ])

  return {
    byUid,
    employeeNoByUid: new Map(staff.map((s) => [s.uid, s.employeeNo])),
    registrationNoByUid: new Map(students.filter((s) => s.firebaseUid).map((s) => [s.firebaseUid as string, s.registrationNo])),
  }
}

// ─────────────────────────────────────────────────────────
//  QUERY — SESSION LIST
// ─────────────────────────────────────────────────────────

/**
 * List sessions with recent activity. `window` filters by lastSeenAt —
 * "who was logged in in the past 10m/30m/1h" — so it naturally includes
 * both currently-active sessions and ones that ended within the window,
 * not just ones still open right now.
 */
export async function listSessions(window: SessionWindow = 'all'): Promise<SessionRow[]> {
  const ms = windowToMs(window)
  const now = new Date()

  const rows = await prisma.userSession.findMany({
    where: ms ? { lastSeenAt: { gte: new Date(now.getTime() - ms) } } : undefined,
    orderBy: { lastSeenAt: 'desc' },
    take: 500,
  })

  const { byUid, employeeNoByUid, registrationNoByUid } = await resolveDisplayInfo(rows.map((r) => r.uid))

  return rows.map((r) => {
    const info = byUid.get(r.uid)
    const isActiveNow = r.loggedOutAt === null && (now.getTime() - r.lastSeenAt.getTime()) <= ACTIVE_GRACE_MS
    const endMoment = r.loggedOutAt ?? r.lastSeenAt
    return {
      id: r.id,
      uid: r.uid,
      role: r.role,
      displayName: info?.displayName ?? null,
      email: info?.email ?? null,
      employeeNo: employeeNoByUid.get(r.uid) ?? null,
      registrationNo: registrationNoByUid.get(r.uid) ?? null,
      loginAt: r.loginAt,
      lastSeenAt: r.lastSeenAt,
      loggedOutAt: r.loggedOutAt,
      endReason: r.endReason,
      isActiveNow,
      durationMs: Math.max(0, endMoment.getTime() - r.loginAt.getTime()),
    }
  })
}

export interface SessionSummary {
  activeNow: number
  last10m: number
  last30m: number
  last1h: number
}

/**
 * KPI-strip counts. activeNow counts distinct uids with an open session
 * whose lastSeenAt is within ACTIVE_GRACE_MS; the window counts are
 * distinct-uid "seen in the last N" figures (a person who logged out and
 * back in within the window still counts once).
 */
export async function getSessionSummary(): Promise<SessionSummary> {
  const now = new Date()

  const [activeRows, last10mRows, last30mRows, last1hRows] = await Promise.all([
    prisma.userSession.findMany({
      where: { loggedOutAt: null, lastSeenAt: { gte: new Date(now.getTime() - ACTIVE_GRACE_MS) } },
      select: { uid: true },
    }),
    prisma.userSession.findMany({
      where: { lastSeenAt: { gte: new Date(now.getTime() - 10 * 60 * 1000) } },
      select: { uid: true },
    }),
    prisma.userSession.findMany({
      where: { lastSeenAt: { gte: new Date(now.getTime() - 30 * 60 * 1000) } },
      select: { uid: true },
    }),
    prisma.userSession.findMany({
      where: { lastSeenAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } },
      select: { uid: true },
    }),
  ])

  return {
    activeNow: new Set(activeRows.map((r) => r.uid)).size,
    last10m: new Set(last10mRows.map((r) => r.uid)).size,
    last30m: new Set(last30mRows.map((r) => r.uid)).size,
    last1h: new Set(last1hRows.map((r) => r.uid)).size,
  }
}

// ─────────────────────────────────────────────────────────
//  QUERY — SESSION ACTIVITY DRILL-DOWN
// ─────────────────────────────────────────────────────────

export interface SessionActivity {
  session: SessionRow
  entries: AuditLogRow[]
}

/**
 * Everything a session's owner did, scoped to that session's own window.
 * The upper bound is always loginAt → loggedOutAt (or now, if still open).
 * The LOWER bound is loginAt itself — UNLESS this is the uid's very first
 * tracked session ever (no earlier UserSession row exists for them), in
 * which case it's left unbounded below.
 *
 * Why: this feature only started recording sessions from the moment it
 * shipped. A person's first session afterwards still has real prior
 * history sitting in AuditLog from before session tracking existed — the
 * kind of gap that stops mattering once every session has a predecessor
 * to bound against, but shows up immediately after rollout as actions
 * that visibly happened (audit log has them) yet don't appear under any
 * session (none existed yet to own them). Rather than a confusing "0
 * actions" next to activity that's plainly visible one tab over, a
 * person's first tracked session shows everything on record up to that
 * session's own end — every session after their second behaves exactly
 * as documented, strictly bounded on both ends.
 */
export async function getSessionActivity(sessionId: string): Promise<SessionActivity | null> {
  const row = await prisma.userSession.findUnique({ where: { id: sessionId } })
  if (!row) return null

  const [{ byUid, employeeNoByUid, registrationNoByUid }, earlierSession] = await Promise.all([
    resolveDisplayInfo([row.uid]),
    prisma.userSession.findFirst({
      where: { uid: row.uid, loginAt: { lt: row.loginAt } },
      select: { id: true },
    }),
  ])
  const info = byUid.get(row.uid)
  const now = new Date()
  const isActiveNow = row.loggedOutAt === null && (now.getTime() - row.lastSeenAt.getTime()) <= ACTIVE_GRACE_MS
  const endMoment = row.loggedOutAt ?? row.lastSeenAt

  const session: SessionRow = {
    id: row.id,
    uid: row.uid,
    role: row.role,
    displayName: info?.displayName ?? null,
    email: info?.email ?? null,
    employeeNo: employeeNoByUid.get(row.uid) ?? null,
    registrationNo: registrationNoByUid.get(row.uid) ?? null,
    loginAt: row.loginAt,
    lastSeenAt: row.lastSeenAt,
    loggedOutAt: row.loggedOutAt,
    endReason: row.endReason,
    isActiveNow,
    durationMs: Math.max(0, endMoment.getTime() - row.loginAt.getTime()),
  }

  const entries = await auditService.queryByActor(row.uid, {
    dateFrom: earlierSession ? row.loginAt : undefined,
    dateTo: row.loggedOutAt ?? now,
    limit: 200,
  })

  return { session, entries }
}
