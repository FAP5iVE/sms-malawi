/**
 * routes/reporting/admin.ts — platform reporting for administrators (mounted at /reporting/admin).
 *
 * Each section is gated on the permission that already governs that data:
 *   security   → report.viewLoginAttempts
 *   sessions   → userMgmt.viewActiveSessions
 *   governance → report.viewAuditLogs
 *   adoption   → userMgmt.viewActiveSessions
 * The overview/attention queue spans security and sessions, so it needs both
 * of those; live service health and error-monitoring figures are only added
 * when the caller also holds report.viewSystemHealth / monitoring.view.
 */
import type { Request } from 'express'
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requireAllPermissions, requirePermission } from '@/server/middleware/verifyPermission'
import { hasPermission } from '@shared/types/permissions'
import * as admin from '@/server/services/analytics/adminAnalytics'
import { positiveInt } from './_shared'

export const adminReportingRouter = Router()

const MAX_DAYS = 90
const days = (raw: unknown, fallback = 30) => Math.min(positiveInt(raw, fallback), MAX_DAYS)

function optionsOf(req: Request): admin.AdminOverviewOptions {
  const user = req.user!
  const su = user.superUser === true
  return {
    includeHealth: hasPermission(user.role, 'report.viewSystemHealth', su),
    includeMonitoring: hasPermission(user.role, 'monitoring.view', su),
  }
}

const overviewGate = [verifyAuth, requireAllPermissions(['report.viewLoginAttempts', 'userMgmt.viewActiveSessions'])] as const

adminReportingRouter.get('/overview', ...overviewGate, async (req, res) => {
  res.json(await admin.getAdminOverview(optionsOf(req)))
})

adminReportingRouter.get('/attention', ...overviewGate, async (req, res) => {
  res.json(await admin.getAdminAttention(optionsOf(req)))
})

adminReportingRouter.get('/security', verifyAuth, requirePermission('report.viewLoginAttempts'), async (req, res) => {
  res.json(await admin.getSecurityReport(days(req.query.days)))
})

adminReportingRouter.get('/sessions', verifyAuth, requirePermission('userMgmt.viewActiveSessions'), async (req, res) => {
  res.json(await admin.getSessionsReport(days(req.query.days)))
})

adminReportingRouter.get('/governance', verifyAuth, requirePermission('report.viewAuditLogs'), async (req, res) => {
  res.json(await admin.getGovernanceReport(days(req.query.days)))
})

adminReportingRouter.get('/adoption', verifyAuth, requirePermission('userMgmt.viewActiveSessions'), async (_req, res) => {
  res.json(await admin.getAdoptionReport())
})
