/**
 * routes/reporting/operations.ts — procurement and stocktake reporting
 * (mounted at /reporting/operations).
 *
 * The pipeline carries school-wide requisition/PO values, so it is gated on
 * procurement.reviewRequisition (the oversight permission held by finance and
 * high_rank) rather than procurement.viewRequisitions, which the service layer
 * deliberately scopes to a user's own department. Stocktake variance is gated
 * on the stocktake/variance permissions.
 *
 * The asset register report is gated on assets.viewInventoryReports (outstanding
 * advances additionally need assets.viewAdvances); stock levels and movements on
 * inventory.view; procurement value on procurement.reviewRequisition. Filter
 * values that are present but invalid are rejected with 400 rather than ignored,
 * so a report can never claim a filter it did not apply.
 */
import { Router } from 'express'
import type { Response } from 'express'
import { hasPermission } from '@shared/types/permissions'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission, requireAnyPermission } from '@/server/middleware/verifyPermission'
import * as operations from '@/server/services/analytics/operationsAnalytics'
import {
  ASSET_CONDITIONS, ASSET_STATUSES,
} from '@/server/services/analytics/assetRegisterLogic'
import { STOCKTAKE_STATUSES } from '@/server/services/analytics/stocktakeLogic'
import { resolvePeriod, positiveInt, optionalDate, optionalEnum, optionalString, optionalTerm } from './_shared'

const ASSET_CATEGORIES = ['FURNITURE', 'IT_EQUIPMENT', 'LAB_EQUIPMENT', 'SPORTS_EQUIPMENT', 'KITCHEN_EQUIPMENT', 'VEHICLE', 'MAINTENANCE_TOOL', 'OTHER'] as const
const MAX_DAYS = 3650

function reject(res: Response, message: string): void {
  res.status(400).json({ error: message })
}

/** A from/to pair; replies 400 and returns null when either is malformed or reversed. */
function dateRange(query: Record<string, unknown>, res: Response): { from?: string; to?: string } | null {
  const from = optionalDate(query.from)
  const to = optionalDate(query.to)
  if (from === null || to === null) {
    reject(res, 'Dates must be written as YYYY-MM-DD.')
    return null
  }
  if (from && to && from > to) {
    reject(res, 'The start date must not be after the end date.')
    return null
  }
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) }
}

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

operationsReportingRouter.get('/assets',
  verifyAuth, requirePermission('assets.viewInventoryReports'),
  async (req, res) => {
    const category = optionalEnum(req.query.category, ASSET_CATEGORIES)
    const status = optionalEnum(req.query.status, ASSET_STATUSES)
    const condition = optionalEnum(req.query.condition, ASSET_CONDITIONS)
    if (category === null) return reject(res, 'Unknown asset category.')
    if (status === null) return reject(res, 'Unknown asset status.')
    if (condition === null) return reject(res, 'Unknown asset condition.')
    const range = dateRange(req.query, res)
    if (!range) return
    const user = req.user!
    res.json(
      await operations.getAssetRegisterReport(
        {
          category: category ?? null,
          status: status ?? null,
          condition: condition ?? null,
          departmentId: optionalString(req.query.departmentId) ?? null,
          buildingId: optionalString(req.query.buildingId) ?? null,
          roomId: optionalString(req.query.roomId) ?? null,
          custodianUid: optionalString(req.query.custodianUid) ?? null,
          from: range.from ?? null,
          to: range.to ?? null,
        },
        { advances: hasPermission(user.role, 'assets.viewAdvances', user.superUser === true) },
      ),
    )
  })

operationsReportingRouter.get('/stocktakes',
  verifyAuth,
  requireAnyPermission(['inventory.performStocktake', 'inventory.resolveVariance', 'procurement.reviewRequisition']),
  async (req, res) => {
    const status = optionalEnum(req.query.status, STOCKTAKE_STATUSES)
    if (status === null) return reject(res, 'Unknown stocktake status.')
    const { academicYear } = await resolvePeriod(req)
    const term = optionalTerm(req)
    res.json(
      await operations.getStocktakeReport({
        academicYear,
        ...(term !== undefined ? { term } : {}),
        ...(optionalString(req.query.departmentId) ? { departmentId: optionalString(req.query.departmentId) as string } : {}),
        ...(optionalString(req.query.roomId) ? { roomId: optionalString(req.query.roomId) as string } : {}),
        ...(status ? { status } : {}),
      }),
    )
  })

operationsReportingRouter.get('/procurement-value',
  verifyAuth, requirePermission('procurement.reviewRequisition'),
  async (req, res) => {
    const range = dateRange(req.query, res)
    if (!range) return
    const departmentId = optionalString(req.query.departmentId)
    res.json(
      await operations.getProcurementValue({
        ...range,
        days: Math.min(positiveInt(req.query.days, 365), MAX_DAYS),
        ...(departmentId ? { departmentId } : {}),
      }),
    )
  })

operationsReportingRouter.get('/inventory',
  verifyAuth, requirePermission('inventory.view'),
  async (req, res) => {
    const range = dateRange(req.query, res)
    if (!range) return
    const category = optionalString(req.query.category)
    const departmentId = optionalString(req.query.departmentId)
    const roomId = optionalString(req.query.roomId)
    res.json(
      await operations.getStockReport({
        ...range,
        days: Math.min(positiveInt(req.query.days, 30), 365),
        ...(category ? { category } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(roomId ? { roomId } : {}),
      }),
    )
  })
