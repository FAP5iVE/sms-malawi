import 'server-only'

import type { Request, Response, NextFunction } from 'express'
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  type Permission,
} from '@shared/types/permissions'

// ─── SINGLE PERMISSION CHECK ─────────────────────────────

/**
 * Express middleware that requires the authenticated user to hold
 * a specific permission.  Must be placed after verifyAuth.
 *
 * @example
 *   router.post(
 *     '/invoices/bulk-generate',
 *     verifyAuth,
 *     requirePermission('finance.bulkGenerateInvoices'),
 *     handler
 *   )
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' })
      return
    }

    if (!hasPermission(req.user.role, permission)) {
      res.status(403).json({
        error: 'You do not have permission to perform this action.',
        required: permission,
        role: req.user.role,
      })
      return
    }

    next()
  }
}

// ─── ANY-OF PERMISSION CHECK ─────────────────────────────

/**
 * Express middleware that requires the authenticated user to hold
 * AT LEAST ONE of the provided permissions.
 *
 * @example
 *   router.get(
 *     '/payroll',
 *     verifyAuth,
 *     requireAnyPermission(['finance.viewPayrollRuns', 'hr.viewAnyPayslips']),
 *     handler
 *   )
 */
export function requireAnyPermission(permissions: readonly Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' })
      return
    }

    if (!hasAnyPermission(req.user.role, permissions)) {
      res.status(403).json({
        error: 'You do not have permission to perform this action.',
        requiredAny: permissions,
        role: req.user.role,
      })
      return
    }

    next()
  }
}

// ─── ALL-OF PERMISSION CHECK ─────────────────────────────

/**
 * Express middleware that requires the authenticated user to hold
 * ALL of the provided permissions.
 *
 * @example
 *   router.post(
 *     '/payroll/:id/lock',
 *     verifyAuth,
 *     requireAllPermissions(['finance.approvePayroll', 'finance.lockPayroll']),
 *     handler
 *   )
 */
export function requireAllPermissions(permissions: readonly Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' })
      return
    }

    if (!hasAllPermissions(req.user.role, permissions)) {
      res.status(403).json({
        error: 'You do not have permission to perform this action.',
        requiredAll: permissions,
        role: req.user.role,
      })
      return
    }

    next()
  }
}

// ─── CONDITIONAL PERMISSION CHECK (no rejection) ─────────

/**
 * Attaches a boolean `req.can` object to the request so that a
 * single route handler can branch on multiple permissions without
 * needing separate middleware per branch.
 *
 * Usage: place after verifyAuth, then read req.can inside the handler.
 *
 * @example
 *   router.get(
 *     '/students',
 *     verifyAuth,
 *     attachPermissions(['student.create', 'student.edit', 'student.softDelete']),
 *     async (req, res) => {
 *       const { can } = req
 *       const students = await studentService.list(...)
 *       res.json({ students, capabilities: can })
 *     }
 *   )
 */
export function attachPermissions(permissions: readonly Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next()
      return
    }

    const can: Record<string, boolean> = {}
    for (const permission of permissions) {
      can[permission] = hasPermission(req.user.role, permission)
    }

    // Attach to request — downstream handlers access via req.can
    req.can = can
    next()
  }
}