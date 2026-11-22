/*
 * apps/web/src/server/routes/stocktakes.ts
 *
 * [CHANGE TYPE]: NEW FILE (R22)
 * [PURPOSE]: Routes for the stocktake domain — the UI has buttons for
 *   every one of these already (useAssetsInventory.ts); none had a route.
 *   Mounted at /stocktakes in api-app.ts.
 *     inventory.performStocktake — GET/POST /, GET /:id, /:id/start,
 *                                  /:id/lines, /:id/complete
 *     inventory.resolveVariance  — /:id/variances/:varianceId/resolve
 * [DEPENDS ON]: packages/shared/schemas/assetsInventoryProcurement.ts,
 *   apps/web/src/server/services/stocktakeService.ts (both R22)
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import { CreateStocktakeSchema, RecordStocktakeLineSchema, ResolveVarianceSchema } from '@shared/schemas/assetsInventoryProcurement'
import * as stocktakeService from '@/server/services/stocktakeService'

export const stocktakesRouter = Router()

const param = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

stocktakesRouter.get('/', verifyAuth, requirePermission('inventory.performStocktake'),
  async (req, res) => {
    const { academicYear, term, departmentId, roomId, status } = req.query as { academicYear?: string; term?: string; departmentId?: string; roomId?: string; status?: string }
    return res.json(await stocktakeService.listStocktakes({ academicYear, term: term ? Number(term) : undefined, departmentId, roomId, status }))
  })

stocktakesRouter.post('/', verifyAuth, requirePermission('inventory.performStocktake'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreateStocktakeSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await stocktakeService.createStocktake(parsed.data, req.user.uid, req.user.role))
  })

stocktakesRouter.get('/:id', verifyAuth, requirePermission('inventory.performStocktake'),
  async (req, res) => {
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Stocktake id is required.' })
    return res.json(await stocktakeService.getStocktake(id))
  })

stocktakesRouter.post('/:id/start', verifyAuth, requirePermission('inventory.performStocktake'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Stocktake id is required.' })
    return res.json(await stocktakeService.startStocktake(id, req.user.uid, req.user.role))
  })

stocktakesRouter.post('/:id/lines', verifyAuth, requirePermission('inventory.performStocktake'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Stocktake id is required.' })
    const parsed = RecordStocktakeLineSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await stocktakeService.recordLine({ stocktakeId: id, ...parsed.data }, req.user.uid, req.user.role))
  })

stocktakesRouter.post('/:id/complete', verifyAuth, requirePermission('inventory.performStocktake'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Stocktake id is required.' })
    return res.json(await stocktakeService.completeStocktake(id, req.user.uid, req.user.role))
  })

stocktakesRouter.post('/:id/variances/:varianceId/resolve', verifyAuth, requirePermission('inventory.resolveVariance'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    const varianceId = param(req.params.varianceId)
    if (!id || !varianceId) return res.status(400).json({ error: 'Stocktake id and variance id are required.' })
    const parsed = ResolveVarianceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await stocktakeService.resolveVariance(id, varianceId, parsed.data, req.user.uid, req.user.role))
  })
