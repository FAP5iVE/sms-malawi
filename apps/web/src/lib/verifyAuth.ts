/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/lib/verifyAuth.ts
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: Exports the Firebase Admin singleton getAdminApp() (previously
 *   module-private) so studentService.ts's own duplicate initializer can be
 *   deleted and import this canonical one instead — see sms-erp-backend
 *   Rule 4 / sms-erp-constraints Rule 5 on never re-deriving a singleton
 *   that already exists elsewhere in the codebase. No behavioral change to
 *   verifyAuth/requireRole/getIdTokenFromRequest.
 * [DEPENDS ON]: none
 */
import type { Request, Response, NextFunction } from 'express'
import * as admin from 'firebase-admin'
import type { App } from 'firebase-admin/app'
import type { UserRole } from '@shared/types/roles'
import { type NextRequest } from 'next/server'

let adminApp: App | undefined

export function getAdminApp(): App {
  if (!adminApp) {
    if (admin.apps.length > 0) {
      adminApp = admin.app()
    } else {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
          privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        }),
      })
    }
  }
  return adminApp
}

export async function verifyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  const token = authHeader.slice(7)
  try {
    const decoded = await admin.auth(getAdminApp()).verifyIdToken(token)
    const role = decoded['role'] as UserRole | undefined
    if (!role) return res.status(403).json({ error: 'No role assigned to user' })
    req.user = { uid: decoded.uid, role, email: decoded.email ?? '' }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireRole(allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied for your role' })
    }
    next()
  }
}

/**
 * Extracts and verifies a Firebase ID token from a Next.js App Router request.
 * Returns the decoded token or null if missing/invalid.
 * Used by API route handlers (not Express middleware).
 *
 * [PRODUCTION FIX] Added a `?token=` query-param fallback alongside the
 * Authorization header. This route's only real caller,
 * /api/files/[fileId]/route.ts, hands back URLs (via storage.ts's
 * getSignedViewUrl()) meant to be opened directly — <a href>, <iframe src>,
 * window.open() — none of which can attach a request header. Every such
 * consumer (ReportCardGenerator.tsx's view/download links,
 * DigitalResourceViewer.tsx's iframe) was getting a 401 "Unauthorised" on
 * every click, since a header-only check can never be satisfied by a plain
 * navigation. The `ttl=` param already baked into these URLs signals this
 * was always meant to work as a self-contained link — this fallback
 * actually implements that intent rather than just naming it. Query-param
 * tokens are still short-lived Firebase ID tokens (~1hr) verified exactly
 * like the header path, so this doesn't weaken the access-control checks
 * that follow in the route (canReadFile still runs against the same
 * decoded uid/role either way) — it only changes where the token may be read from.
 */
export async function getIdTokenFromRequest(
  request: NextRequest,
): Promise<import('firebase-admin/auth').DecodedIdToken | null> {
  const authHeader  = request.headers.get('authorization') ?? ''
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const queryToken  = request.nextUrl.searchParams.get('token') ?? ''
  const token       = headerToken || queryToken
  if (!token) return null
  try {
    const { getAuth } = await import('firebase-admin/auth')
    return await getAuth().verifyIdToken(token)
  } catch {
    return null
  }
}