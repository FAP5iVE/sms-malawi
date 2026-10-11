/**
 * routes/reporting/finance.ts — finance reporting (mounted at /reporting/finance).
 *
 * Gating mirrors the existing finance analytics routes: each endpoint names the
 * report.* permission that governs the data. high_rank and finance hold them;
 * admin holds none of them (admin's report permissions are system-level).
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as finance from '@/server/services/analytics/financeAnalytics'
import { resolvePeriod, optionalTerm } from './_shared'

export const financeReportingRouter = Router()

financeReportingRouter.get('/overview',
  verifyAuth, requirePermission('report.viewFinanceSummary'),
  async (req, res) => {
    const { academicYear, term } = await resolvePeriod(req)
    res.json(await finance.getFinanceOverview(academicYear, term))
  })

financeReportingRouter.get('/attention',
  verifyAuth, requirePermission('report.viewFinanceSummary'),
  async (req, res) => {
    const { academicYear, term } = await resolvePeriod(req)
    res.json(await finance.getFinanceAttention(academicYear, term))
  })

/** `term` omitted → whole academic year (receivables are cumulative). */
financeReportingRouter.get('/aging',
  verifyAuth, requirePermission('report.viewOutstandingBalances'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await finance.getFinanceAging(academicYear, optionalTerm(req)))
  })

financeReportingRouter.get('/payment-mix',
  verifyAuth, requirePermission('report.viewFeeCollection'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await finance.getPaymentMix(academicYear, optionalTerm(req)))
  })
