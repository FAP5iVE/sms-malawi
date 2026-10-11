/**
 * routes/reporting/library.ts — library reporting (mounted at /reporting/library).
 * Gated on report.viewLibraryUsage (library, high_rank), like the existing
 * library analytics routes.
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as library from '@/server/services/analytics/libraryAnalytics'
import { positiveInt } from './_shared'

export const libraryReportingRouter = Router()

const gate = [verifyAuth, requirePermission('report.viewLibraryUsage')] as const

libraryReportingRouter.get('/overview', ...gate, async (_req, res) => {
  res.json(await library.getLibraryOverview())
})

libraryReportingRouter.get('/attention', ...gate, async (_req, res) => {
  res.json(await library.getLibraryAttention())
})

libraryReportingRouter.get('/circulation', ...gate, async (req, res) => {
  res.json(await library.getLibraryCirculation(positiveInt(req.query.days, 90)))
})

libraryReportingRouter.get('/fines', ...gate, async (req, res) => {
  res.json(await library.getLibraryFines(positiveInt(req.query.months, 6)))
})
