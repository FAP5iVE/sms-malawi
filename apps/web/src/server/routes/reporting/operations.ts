/**
 * routes/reporting/operations.ts — procurement and stocktake reporting
 * (mounted at /reporting/operations).
 *
 * The pipeline carries school-wide requisition/PO values, so it is gated on
 * procurement.reviewRequisition (the oversight permission held by finance and
 * high_rank) rather than procurement.viewRequisitions, which the service layer
 * deliberately scopes to a user's own department. Stocktake variance is gated
 * on the stocktake/variance permissions.
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission, requireAnyPermission } from '@/server/middleware/verifyPermission'
import * as operations from '@/server/services/analytics/operationsAnalytics'
import { resolvePeriod, positiveInt } from './_shared'

export const operationsReportingRouter = Router()

operationsReportingRouter.get('/procurement-pipeline',
  verifyAuth, requirePermission('procurement.reviewRequisition'),
  async (req, res) => {
    res.json(await operations.getProcurementPipeline(positiveInt(req.query.days, 365)))
  })

operationsReportingRouter.get('/stocktake-variance',
  verifyAuth,
  requireAnyPermission(['inventory.performStocktake', 'inventory.resolveVariance', 'procurement.reviewRequisition']),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await operations.getStocktakeVariance(academicYear))
  })
