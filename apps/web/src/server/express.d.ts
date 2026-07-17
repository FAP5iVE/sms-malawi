/**
 * apps/web/src/server/express.d.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R4 — Auth/Security Domain
 * [PURPOSE]: Removes the req.auditLog / req.auditLog.critical type
 *   augmentation (and its sole supporting type, AuditLoggerFunctions) now
 *   that server/middleware/auditLog.ts — the only file that ever set
 *   req.auditLog — has been deleted in this same phase (zero callers
 *   anywhere in the 23-router system; see that file's own removal and
 *   api-app.ts's updated header comment for the exhaustive-grep
 *   justification).
 *   [NOTE] req.pendingAudit (and the auditResponseInterceptor middleware
 *   its doc comment references) is left untouched — it is outside this
 *   phase's change list — but a grep alongside this edit shows it has the
 *   same zero-consumer profile as the removed req.auditLog: no file in this
 *   codebase implements auditResponseInterceptor or calls
 *   req.pendingAudit.set() anywhere. Flagged here for a future phase to
 *   confirm and remove; not acted on in R4 since the roadmap's change list
 *   for this file names only the auditLog augmentation.
 * [DEPENDS ON]: R4's own deletion of server/middleware/auditLog.ts
 */
import type { UserRole } from '@shared/types/roles'

type AuditLogInput = {
  action: string
  entityType: string
  entityId: string
  metadata?: {
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>
    context?: Record<string, unknown>
  }
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by verifyAuth middleware after successful Firebase token verification.
       * Optional — public routes and cron routes may not have this set.
       * Always defined when requireRole / requirePermission has been applied.
       */
      user?: {
        uid:   string
        role:  UserRole
        email: string
      }

      /**
       * Set by attachPermissions middleware.
       * Keys are Permission strings; values are booleans indicating
       * whether req.user.role holds that permission.
       */
      can?: Record<string, boolean>

      /**
       * Set by auditResponseInterceptor middleware.
       * Call req.pendingAudit.set({...}) inside the route handler —
       * the interceptor flushes it after the response is sent successfully.
       */
      pendingAudit?: {
        set: (input: AuditLogInput, synchronous?: boolean) => void
      }
    }
  }
}