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

interface AuditLoggerFunctions {
  (input: AuditLogInput): void
  critical: (input: AuditLogInput) => Promise<void>
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
       * Set by injectAuditLogger middleware.
       * Call with audit log input after a successful operation.
       *   req.auditLog({ action, entityType, entityId })         // fire-and-forget
       *   await req.auditLog.critical({ action, ... })           // synchronous
       */
      auditLog?: AuditLoggerFunctions

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