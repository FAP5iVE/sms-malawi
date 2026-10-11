/**
 * routes/reporting/hr.ts — workforce reporting (mounted at /reporting/hr).
 * Every endpoint is governed by report.viewHRReports (held by hr and high_rank).
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as hr from '@/server/services/analytics/hrAnalytics'
import { resolvePeriod, positiveInt } from './_shared'

export const hrReportingRouter = Router()

const gate = [verifyAuth, requirePermission('report.viewHRReports')] as const

hrReportingRouter.get('/overview', ...gate, async (req, res) => {
  const { academicYear } = await resolvePeriod(req)
  res.json(await hr.getHrOverview(academicYear))
})

hrReportingRouter.get('/attention', ...gate, async (req, res) => {
  const { academicYear } = await resolvePeriod(req)
  res.json(await hr.getHrAttention(academicYear))
})

hrReportingRouter.get('/workforce', ...gate, async (_req, res) => {
  res.json(await hr.getHrWorkforce())
})

hrReportingRouter.get('/contracts', ...gate, async (_req, res) => {
  res.json(await hr.getHrContracts())
})

/** `year` is a calendar year (leave balances are calendar-year based). */
hrReportingRouter.get('/leave', ...gate, async (req, res) => {
  res.json(await hr.getHrLeave(positiveInt(req.query.year, new Date().getFullYear())))
})

hrReportingRouter.get('/loans', ...gate, async (_req, res) => {
  res.json(await hr.getHrLoans())
})

hrReportingRouter.get('/reviews', ...gate, async (req, res) => {
  const { academicYear } = await resolvePeriod(req)
  res.json(await hr.getHrReviews(academicYear))
})

hrReportingRouter.get('/promotions', ...gate, async (_req, res) => {
  res.json(await hr.getHrPromotions())
})
