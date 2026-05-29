import { Router } from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { getSystemHealth } from '@/server/services/systemHealthService'

export const healthRouter = Router()

// GET /health — admin only — full health check
healthRouter.get('/', verifyAuth, requireRole(['admin']),
  async (_req, res) => res.json(await getSystemHealth()))

// GET /health/ping — public, no auth — for external uptime monitors
healthRouter.get('/ping',
  async (_req, res) => res.json({ status: 'ok', ts: Date.now() }))
