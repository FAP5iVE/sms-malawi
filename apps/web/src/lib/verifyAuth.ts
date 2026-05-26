import type { Request, Response, NextFunction } from 'express'
import * as admin from 'firebase-admin'
import type { App } from 'firebase-admin/app'
import type { UserRole } from '@shared/types/roles'

let adminApp: App | undefined

function getAdminApp(): App {
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