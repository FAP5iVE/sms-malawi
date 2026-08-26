/**
 * apps/web/src/server/routes/monitoring.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Authenticated proxy reads + feedback submission for the admin
 *   monitoring tab. Mounted in api-app.ts like every other domain router.
 *   Never calls Sentry's API directly from a request handler with no cache
 *   for anything with a webhook path (issues/alerts) — always reads the
 *   Prisma cache via monitoringService. Endpoints with no webhook
 *   equivalent (logs, replays, releases, feedback list) proxy Sentry live.
 * [DEPENDS ON]: monitoringService, requirePermission, verifyAuth, sendError
 */
import 'server-only'
import { Router, type Request, type Response } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as monitoringService from '@/server/services/monitoringService'
import { sendError } from '@/server/lib/sendError'

export const monitoringRouter = Router()
monitoringRouter.use(verifyAuth)

// GET /monitoring/summary — the KPI strip: crash-free %, Apdex, releases
// count, unresolved issue count, active-outage count, recent alerts.
monitoringRouter.get('/summary', requirePermission('monitoring.view'), async (_req: Request, res: Response) => {
  try {
    return res.json(await monitoringService.getSummary())
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring' } })
  }
})

// GET /monitoring/issues?status=&level=&uptimeOnly=&limit= — Errors & Outages panel (Outages = isUptimeIssue:true)
monitoringRouter.get('/issues', requirePermission('monitoring.view'), async (req: Request, res: Response) => {
  try {
    const { status, level, uptimeOnly, limit } = req.query as Record<string, string>
    return res.json(
      await monitoringService.listIssues({
        status, level,
        uptimeOnly: uptimeOnly === 'true',
        limit: limit ? Number(limit) : undefined,
      }),
    )
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring' } })
  }
})

// GET /monitoring/alerts — recent/configured alerts (current beta Monitors/Alerts model)
monitoringRouter.get('/alerts', requirePermission('monitoring.view'), async (_req: Request, res: Response) => {
  try {
    return res.json(await monitoringService.listAlerts())
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring' } })
  }
})

// PATCH /monitoring/alerts/:id/toggle — enable/disable one alert (manage-only, not view-only)
monitoringRouter.patch('/alerts/:id/toggle', requirePermission('monitoring.manage'), async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body as { enabled?: boolean }
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled (boolean) is required.' })
    await monitoringService.toggleAlert(String(req.params.id), enabled)
    return res.json({ ok: true })
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring' } })
  }
})

// GET /monitoring/replays?statsPeriod= — Session Replay list panel (proxied live, low query frequency)
monitoringRouter.get('/replays', requirePermission('monitoring.view'), async (req: Request, res: Response) => {
  try {
    const statsPeriod = typeof req.query.statsPeriod === 'string' ? req.query.statsPeriod : '14d'
    return res.json(await monitoringService.listReplays(statsPeriod))
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring' } })
  }
})

// GET /monitoring/releases?statsPeriod= — Releases panel (KPI numeral + cadence chart)
monitoringRouter.get('/releases', requirePermission('monitoring.view'), async (req: Request, res: Response) => {
  try {
    const statsPeriod = typeof req.query.statsPeriod === 'string' ? req.query.statsPeriod : '30d'
    return res.json(await monitoringService.listReleases(statsPeriod))
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring' } })
  }
})

// GET /monitoring/logs?level= — Logs panel (Logs have no webhook path — proxied live)
monitoringRouter.get('/logs', requirePermission('monitoring.view'), async (req: Request, res: Response) => {
  try {
    const { level, limit } = req.query as Record<string, string>
    return res.json(await monitoringService.listLogs({ level, limit: limit ? Number(limit) : undefined }))
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring' } })
  }
})

// GET /monitoring/feedback — Feedback panel list
monitoringRouter.get('/feedback', requirePermission('monitoring.view'), async (_req: Request, res: Response) => {
  try {
    return res.json(await monitoringService.listFeedback())
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring' } })
  }
})

// POST /monitoring/feedback — "Report a problem" (our own UI, Sentry.captureFeedback under the hood).
// Broadest gate of this router — every role holds monitoring.submitFeedback,
// unlike the view/manage-gated read endpoints above.
monitoringRouter.post('/feedback', requirePermission('monitoring.submitFeedback'), async (req: Request, res: Response) => {
  try {
    const { message, associatedIssueId } = req.body as { message?: string; associatedIssueId?: string }
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'A message is required.' })
    }
    const result = await monitoringService.submitFeedback({
      message: message.trim(),
      uid: req.user!.uid,
      role: req.user!.role,
      associatedIssueId,
    })
    return res.status(201).json(result)
  } catch (err) {
    return sendError(res, err, { tags: { module: 'monitoring' } })
  }
})