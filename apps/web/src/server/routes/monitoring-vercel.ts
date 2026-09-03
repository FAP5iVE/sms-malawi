/**
 * apps/web/src/server/routes/monitoring-vercel.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Authenticated reads for the "Vercel Platform" tab of
 *   /monitoring — a sibling to routes/monitoring.ts (Sentry), backed by
 *   vercelMonitoringService instead. Mounted at /monitoring/vercel in
 *   api-app.ts, same permission model (monitoring.view / monitoring.manage)
 *   as the existing monitoring routes.
 * [DEPENDS ON]: vercelMonitoringService, requirePermission, verifyAuth, sendError
 */
import 'server-only'
import { Router, type Request, type Response } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as vercelMonitoringService from '@/server/services/vercelMonitoringService'
import { sendError } from '@/server/lib/sendError'

export const monitoringVercelRouter = Router()
monitoringVercelRouter.use(verifyAuth)

// GET /monitoring/vercel/summary — traffic stats, latest deployment state,
// unacknowledged DIY-alert count, 24h error count.
monitoringVercelRouter.get('/summary', requirePermission('monitoring.view'), async (_req: Request, res: Response) => {
  try {
    return res.json(await vercelMonitoringService.getVercelSummary())
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring-vercel' } })
  }
})

// GET /monitoring/vercel/deployments?limit= — recent deployments + build status
monitoringVercelRouter.get('/deployments', requirePermission('monitoring.view'), async (req: Request, res: Response) => {
  try {
    const { limit } = req.query as Record<string, string>
    return res.json(await vercelMonitoringService.listVercelDeployments(limit ? Number(limit) : undefined))
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring-vercel' } })
  }
})

// GET /monitoring/vercel/errors?level=&limit= — runtime log rows (default: error/fatal/warning)
monitoringVercelRouter.get('/errors', requirePermission('monitoring.view'), async (req: Request, res: Response) => {
  try {
    const { level, limit } = req.query as Record<string, string>
    return res.json(await vercelMonitoringService.listVercelErrors({ level, limit: limit ? Number(limit) : undefined }))
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring-vercel' } })
  }
})

// GET /monitoring/vercel/alerts — DIY alerts (deployment_failed, error_spike)
monitoringVercelRouter.get('/alerts', requirePermission('monitoring.view'), async (_req: Request, res: Response) => {
  try {
    return res.json(await vercelMonitoringService.listVercelAlerts())
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring-vercel' } })
  }
})

// PATCH /monitoring/vercel/alerts/:id/acknowledge — dismiss a DIY alert (manage-only, not view-only)
monitoringVercelRouter.patch('/alerts/:id/acknowledge', requirePermission('monitoring.manage'), async (req: Request<{ id: string }>, res: Response) => {
  try {
    await vercelMonitoringService.acknowledgeAlert(req.params.id)
    return res.json({ ok: true })
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring-vercel' } })
  }
})