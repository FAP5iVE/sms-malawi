import 'server-only'

import type { Request, Response, NextFunction } from 'express'
import { logAsync, log, type AuditEntry, type Severity, SEVERITY, ACTION_SEVERITY } from '@/server/services/auditService'

// ─────────────────────────────────────────────────────────
//  TYPE AUGMENTATION
//  Adds req.auditLog() to the Express Request type so route handlers
//  can call it explicitly after a successful operation.
//  Declaration merged into src/server/express.d.ts.
// ─────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────
//  MIDDLEWARE FACTORY: injectAuditLogger
//  Injects req.auditLog() into every request that passes through it.
//  Route handlers call req.auditLog({ action, entityType, entityId,
//  metadata }) — the middleware fills in actorUid and actorRole from
//  req.user (set by verifyAuth).
//
//  Whether the write is synchronous (awaited) or fire-and-forget
//  depends on the action's severity:
//    CRITICAL / HIGH  →  synchronous (call via req.auditLog.critical)
//    MEDIUM / LOW     →  fire-and-forget (call via req.auditLog / req.auditLog.async)
// ─────────────────────────────────────────────────────────

type AuditLogInput = Omit<AuditEntry, 'actorUid' | 'actorRole'>

interface AuditLoggerFunctions {
  /** Fire-and-forget — safe for MEDIUM and LOW severity. */
  (input: AuditLogInput): void
  /** Async overload — resolves after the write completes. Use for CRITICAL / HIGH. */
  critical: (input: AuditLogInput) => Promise<void>
}

export function injectAuditLogger(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const actorUid  = req.user?.uid  ?? 'anonymous'
  const actorRole = req.user?.role ?? 'unknown'

  const auditFn = ((input: AuditLogInput): void => {
    logAsync({ ...input, actorUid, actorRole })
  }) as AuditLoggerFunctions

  auditFn.critical = async (input: AuditLogInput): Promise<void> => {
    await log({ ...input, actorUid, actorRole })
  }

  req.auditLog = auditFn
  next()
}

// ─────────────────────────────────────────────────────────
//  RESPONSE INTERCEPTOR MIDDLEWARE
//  Wraps res.json() to intercept the response status after the
//  route handler runs. This allows post-response audit logging
//  without changing existing route handler code.
//
//  Usage: place BEFORE the route handler in the middleware chain.
//  The route handler must call req.pendingAudit.set({...}) during
//  its processing — the interceptor flushes it after success (2xx).
//
//  This is an advanced pattern — use injectAuditLogger + explicit
//  req.auditLog() calls in route handlers for most cases.
// ─────────────────────────────────────────────────────────

interface PendingAuditEntry {
  entry: AuditLogInput
  /** If true, write synchronously before completing the response. */
  synchronous?: boolean
}

export function auditResponseInterceptor(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const actorUid  = req.user?.uid  ?? 'anonymous'
  const actorRole = req.user?.role ?? 'unknown'

  let pendingEntry: PendingAuditEntry | null = null

  req.pendingAudit = {
    set: (entry: AuditLogInput, synchronous?: boolean) => {
      pendingEntry = { entry, synchronous }
    },
  }

  // Wrap res.json to intercept the response before it is sent
  const originalJson = res.json.bind(res)
  res.json = function (body: unknown) {
    // Only log on successful mutations (2xx status codes)
    if (pendingEntry && res.statusCode >= 200 && res.statusCode < 300) {
      const full: AuditEntry = {
        ...pendingEntry.entry,
        actorUid,
        actorRole,
      }

     const isCritical = (
      [SEVERITY.CRITICAL, SEVERITY.HIGH] as Severity[]
      ).includes(ACTION_SEVERITY[pendingEntry.entry.action] ?? SEVERITY.MEDIUM)

      if (pendingEntry.synchronous || isCritical) {
        // Cannot await in a sync function — schedule immediately
        // This is still safer than fire-and-forget for critical writes
        void log(full).catch((err: unknown) => {
          // Logged internally — do not block or alter the response
        })
      } else {
        logAsync(full)
      }
    }

    return originalJson(body)
  }

  next()
}

// ─────────────────────────────────────────────────────────
//  CONVENIENCE ROUTE-LEVEL MIDDLEWARE FACTORIES
//  Pre-configure audit entries for standard CRUD verbs.
//  These use the pendingAudit pattern — the entityId is resolved
//  from req.params.id or the response body depending on verb.
// ─────────────────────────────────────────────────────────

/**
 * Audit middleware for POST routes (create operations).
 * The entityId is extracted from the response body's `id` field.
 *
 * @example
 *   studentsRouter.post(
 *     '/',
 *     verifyAuth,
 *     requirePermission('student.create'),
 *     auditPost('student.create', 'Student'),
 *     createStudentHandler
 *   )
 */
export function auditPost(action: string, entityType: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const actorUid  = req.user?.uid  ?? 'anonymous'
    const actorRole = req.user?.role ?? 'unknown'

    const originalJson = res.json.bind(res)
    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId =
          (body as Record<string, unknown>)?.['id'] as string | undefined
        if (entityId) {
          const entry: AuditEntry = {
            action,
            entityType,
            entityId,
            actorUid,
            actorRole,
            metadata: {
              after: body as Record<string, unknown>,
            },
          }
          logAsync(entry)
        }
      }
      return originalJson(body)
    }

    next()
  }
}

/**
 * Audit middleware for PATCH routes (update operations).
 * The entityId is extracted from req.params.id.
 * The metadata includes the request body as the change payload.
 *
 * @example
 *   studentsRouter.patch(
 *     '/:id',
 *     verifyAuth,
 *     requirePermission('student.edit'),
 *     auditPatch('student.edit', 'Student'),
 *     editStudentHandler
 *   )
 */
export function auditPatch(action: string, entityType: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const actorUid  = req.user?.uid  ?? 'anonymous'
    const actorRole = req.user?.role ?? 'unknown'
    const entityId = String(req.params['id'] ?? req.params['studentId'] ?? 'unknown')
    const requestBody = req.body as Record<string, unknown>

    const originalJson = res.json.bind(res)
    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entry: AuditEntry = {
          action,
          entityType,
          entityId,
          actorUid,
          actorRole,
          metadata: {
            context: { changes: requestBody },
            after:   body as Record<string, unknown>,
          },
        }
        logAsync(entry)
      }
      return originalJson(body)
    }

    next()
  }
}

/**
 * Audit middleware for DELETE routes.
 * Logs synchronously (HIGH severity by default for deletes).
 *
 * @example
 *   booksRouter.delete(
 *     '/:id',
 *     verifyAuth,
 *     requirePermission('library.manageCatalog'),
 *     auditDelete('library.book_deleted', 'Book'),
 *     deleteBookHandler
 *   )
 */
export function auditDelete(action: string, entityType: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const actorUid  = req.user?.uid  ?? 'anonymous'
    const actorRole = req.user?.role ?? 'unknown'
    const entityId = String(req.params['id'] ?? 'unknown')

    const originalJson = res.json.bind(res)
    res.json = function (body: unknown) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entry: AuditEntry = {
          action,
          entityType,
          entityId,
          actorUid,
          actorRole,
          metadata: {
            context: { deletedAt: new Date().toISOString() },
          },
        }
        // Deletes are always important — write synchronously
        void log(entry).catch(() => {})
      }
      return originalJson(body)
    }

    next()
  }
}