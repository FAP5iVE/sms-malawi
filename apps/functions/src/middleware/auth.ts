import type { Request, Response, NextFunction } from 'express'
import { getAuth } from 'firebase-admin/auth'
import type { UserRole } from '@shared/types/roles'

// Extend Express Request with our user context
declare global {
  namespace Express {
    interface Request {
      user?: { uid: string; role: UserRole; email: string }
    }
  }
}

// ─── VERIFY AUTH ─────────────────────────────────────────
export async function verifyAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = authHeader.slice(7)
  try {
    const decoded = await getAuth().verifyIdToken(token)
    const role = decoded['role'] as UserRole | undefined

    if (!role) {
      return res.status(403).json({ error: 'No role assigned to user' })
    }

    req.user = { uid: decoded.uid, role, email: decoded.email ?? '' }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// ─── REQUIRE ROLE ────────────────────────────────────────
export function requireRole(allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied for your role' })
    }
    next()
  }
}
