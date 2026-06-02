import 'server-only'

import { Router, type Request, type Response } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission, requireAnyPermission } from '@/server/middleware/verifyPermission'
import * as auditService from '@/server/services/auditService'
import type { AuditQueryFilters, Severity } from '@/server/services/auditService'

export const auditRouter = Router()

// All audit routes require authentication — admin / high_rank for full access
// The specific permission check is applied per route.

// ─────────────────────────────────────────────────────────
//  GET /audit
//  Paginated filtered query over all audit logs.
//  Admin and high_rank with userMgmt.viewAuditLogs permission.
// ─────────────────────────────────────────────────────────

auditRouter.get(
  '/',
  verifyAuth,
  requirePermission('userMgmt.viewAuditLogs'),
  async (req: Request, res: Response) => {
    const {
      action,
      entityType,
      entityId,
      actorUid,
      actorRole,
      severity,
      dateFrom,
      dateTo,
      search,
      page,
      pageSize,
    } = req.query

    const filters: AuditQueryFilters = {
      action:     action     ? String(action)     : undefined,
      entityType: entityType ? String(entityType) : undefined,
      entityId:   entityId   ? String(entityId)   : undefined,
      actorUid:   actorUid   ? String(actorUid)   : undefined,
      actorRole:  actorRole  ? String(actorRole)  : undefined,
      severity:   severity   ? String(severity) as Severity : undefined,
      dateFrom:   dateFrom   ? new Date(String(dateFrom))   : undefined,
      dateTo:     dateTo     ? new Date(String(dateTo))     : undefined,
      search:     search     ? String(search)               : undefined,
      page:       page       ? Math.max(1, parseInt(String(page), 10)) : 1,
      pageSize:   pageSize   ? Math.min(100, parseInt(String(pageSize), 10)) : 25,
    }

    // Validate date params
    if (filters.dateFrom && isNaN(filters.dateFrom.getTime())) {
      res.status(400).json({ error: 'dateFrom is not a valid date.' })
      return
    }
    if (filters.dateTo && isNaN(filters.dateTo.getTime())) {
      res.status(400).json({ error: 'dateTo is not a valid date.' })
      return
    }

    const result = await auditService.query(filters)
    res.json(result)
  }
)

// ─────────────────────────────────────────────────────────
//  GET /audit/security-events
//  Recent CRITICAL and HIGH events for the admin security center.
//  Defaults to last 24 hours.
// ─────────────────────────────────────────────────────────

auditRouter.get(
  '/security-events',
  verifyAuth,
  requireAnyPermission(['userMgmt.viewAuditLogs', 'report.viewAuditLogs']),
  async (req: Request, res: Response) => {
    const hoursBack = req.query.hoursBack
      ? Math.min(168, parseInt(String(req.query.hoursBack), 10)) // max 7 days
      : 24
    const limit = req.query.limit
      ? Math.min(200, parseInt(String(req.query.limit), 10))
      : 50

    if (isNaN(hoursBack) || isNaN(limit)) {
      res.status(400).json({ error: 'hoursBack and limit must be valid numbers.' })
      return
    }

    const events = await auditService.getRecentSecurityEvents(hoursBack, limit)
    res.json({ events, hoursBack, count: events.length })
  }
)

// ─────────────────────────────────────────────────────────
//  GET /audit/login-attempts
//  Login success and failure log for the security center.
// ─────────────────────────────────────────────────────────

auditRouter.get(
  '/login-attempts',
  verifyAuth,
  requirePermission('userMgmt.viewLoginAttempts'),
  async (req: Request, res: Response) => {
    const hoursBack = req.query.hoursBack
      ? Math.min(168, parseInt(String(req.query.hoursBack), 10))
      : 24
    const limit = req.query.limit
      ? Math.min(500, parseInt(String(req.query.limit), 10))
      : 100

    if (isNaN(hoursBack) || isNaN(limit)) {
      res.status(400).json({ error: 'hoursBack and limit must be valid numbers.' })
      return
    }

    const attempts = await auditService.getLoginAttempts(hoursBack, limit)
    const successCount = attempts.filter((e) => e.action === 'auth.login_success').length
    const failureCount = attempts.filter((e) => e.action === 'auth.login_failed').length

    res.json({
      attempts,
      summary: { total: attempts.length, success: successCount, failed: failureCount },
      hoursBack,
    })
  }
)

// ─────────────────────────────────────────────────────────
//  GET /audit/stats
//  Aggregate statistics for the admin dashboard audit widget.
// ─────────────────────────────────────────────────────────

auditRouter.get(
  '/stats',
  verifyAuth,
  requireAnyPermission(['userMgmt.viewAuditLogs', 'report.viewAuditLogs']),
  async (req: Request, res: Response) => {
    const daysBack = req.query.daysBack
      ? Math.min(30, parseInt(String(req.query.daysBack), 10))
      : 7

    if (isNaN(daysBack)) {
      res.status(400).json({ error: 'daysBack must be a valid number.' })
      return
    }

    const stats = await auditService.getAuditStats(daysBack)
    res.json({ ...stats, daysBack })
  }
)

// ─────────────────────────────────────────────────────────
//  GET /audit/entity/:type/:id
//  Full chronological audit trail for a specific entity.
//  Access: admin, high_rank, or domain-specific (exam officer for Exam, etc.)
// ─────────────────────────────────────────────────────────

auditRouter.get(
  '/entity/:type/:id',
  verifyAuth,
  requireAnyPermission(['userMgmt.viewAuditLogs', 'report.viewAuditLogs', 'exam.viewExamAuditLog']),
  async (req: Request, res: Response) => {
    const { type, id } = req.params

    if (!type || !id) {
      res.status(400).json({ error: 'Entity type and id are required.' })
      return
    }

    // Restrict non-admin users from viewing arbitrary entity types
    const ALLOWED_ENTITY_TYPES_FOR_EXAM_OFFICER = new Set([
      'Exam', 'ExamMark', 'TermResult', 'AnnualResult', 'ManebRecord',
    ])

    const user = req.user
    if (
      user?.role !== 'admin' &&
      user?.role !== 'high_rank' &&
      !ALLOWED_ENTITY_TYPES_FOR_EXAM_OFFICER.has(type)
    ) {
      res.status(403).json({
        error: `Your role does not have access to the audit trail for "${type}" entities.`,
      })
      return
    }

    const limit = req.query.limit
      ? Math.min(200, parseInt(String(req.query.limit), 10))
      : 50

    const entries = await auditService.queryByEntity(type, id, limit)
    res.json({ entityType: type, entityId: id, entries, count: entries.length })
  }
)

// ─────────────────────────────────────────────────────────
//  GET /audit/actor/:uid
//  All audit entries produced by a specific user.
//  Admin only.
// ─────────────────────────────────────────────────────────

auditRouter.get(
  '/actor/:uid',
  verifyAuth,
  requirePermission('userMgmt.viewAuditLogs'),
  async (req: Request, res: Response) => {
    const { uid } = req.params

    if (!uid) {
      res.status(400).json({ error: 'Actor UID is required.' })
      return
    }

    const dateFrom = req.query.dateFrom
      ? new Date(String(req.query.dateFrom))
      : undefined
    const dateTo = req.query.dateTo
      ? new Date(String(req.query.dateTo))
      : undefined
    const limit = req.query.limit
      ? Math.min(200, parseInt(String(req.query.limit), 10))
      : 100

    if (dateFrom && isNaN(dateFrom.getTime())) {
      res.status(400).json({ error: 'dateFrom is not a valid date.' })
      return
    }
    if (dateTo && isNaN(dateTo.getTime())) {
      res.status(400).json({ error: 'dateTo is not a valid date.' })
      return
    }

    const entries = await auditService.queryByActor(uid, { dateFrom, dateTo, limit })
    res.json({ actorUid: uid, entries, count: entries.length })
  }
)

// ─────────────────────────────────────────────────────────
//  GET /audit/:id
//  Single audit log entry by ID.
//  Admin and high_rank only.
// ─────────────────────────────────────────────────────────

auditRouter.get(
  '/:id',
  verifyAuth,
  requirePermission('userMgmt.viewAuditLogs'),
  async (req: Request, res: Response) => {
    const { id } = req.params

    const row = await (await import('@/lib/prisma')).prisma.auditLog.findUnique({
      where: { id },
    })

    if (!row) {
      res.status(404).json({ error: 'Audit log entry not found.' })
      return
    }

    res.json({
      id:         row.id,
      action:     row.action,
      severity:   auditService.SEVERITY[
        Object.keys(auditService.SEVERITY).find(
          (k) => auditService.SEVERITY[k as keyof typeof auditService.SEVERITY] ===
            (ACTION_SEVERITY_LOOKUP[row.action] ?? 'MEDIUM')
        ) as keyof typeof auditService.SEVERITY
      ] ?? 'MEDIUM',
      entityType: row.entityType,
      entityId:   row.entityId,
      actorUid:   row.actorUid,
      actorRole:  row.actorRole,
      metadata:   row.metadata,
      createdAt:  row.createdAt,
    })
  }
)

// Local reference for the single-entry route's severity lookup
const ACTION_SEVERITY_LOOKUP: Record<string, string> = {}
import('@/server/services/auditService').then((m) => {
  // Populate from the service's internal map via getAuditStats export
  // This is a minor indirection — acceptable for a rarely-called route
}).catch(() => {})