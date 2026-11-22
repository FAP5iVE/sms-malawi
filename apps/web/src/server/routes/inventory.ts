/*
 * apps/web/src/server/routes/inventory.ts
 *
 * [CHANGE TYPE]: NEW FILE (R22)
 * [PURPOSE]: Routes for the inventory domain. Mounted at /inventory in
 *   api-app.ts.
 *     inventory.view          — GET /items, /transactions
 *     inventory.manageItems   — POST /items, PATCH /items/:id
 *     inventory.receive       — POST /transactions/receipt
 *     inventory.issue         — POST /transactions/issue
 *     inventory.transfer      — POST /transactions/transfer
 * [DEPENDS ON]: packages/shared/schemas/assetsInventoryProcurement.ts,
 *   apps/web/src/server/services/inventoryService.ts (both R22)
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import {
  CreateInventoryItemSchema, UpdateInventoryItemSchema,
  StockReceiptSchema, StockIssueSchema, StockTransferSchema, StockAdjustSchema,
} from '@shared/schemas/assetsInventoryProcurement'
import * as inventoryService from '@/server/services/inventoryService'

export const inventoryRouter = Router()

const param = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

// ── ITEMS (static routes before /:id) ──

inventoryRouter.get('/items', verifyAuth, requirePermission('inventory.view'),
  async (req, res) => {
    const { category, search, lowStock, includeInactive } = req.query as { category?: string; search?: string; lowStock?: string; includeInactive?: string }
    return res.json(await inventoryService.listItems({ category, search, lowStock: lowStock === 'true', includeInactive: includeInactive === 'true' }))
  })

inventoryRouter.post('/items', verifyAuth, requirePermission('inventory.manageItems'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreateInventoryItemSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await inventoryService.createItem(parsed.data, req.user.uid, req.user.role))
  })

inventoryRouter.patch('/items/:id', verifyAuth, requirePermission('inventory.manageItems'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Item id is required.' })
    const parsed = UpdateInventoryItemSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await inventoryService.updateItem(id, parsed.data, req.user.uid, req.user.role))
  })

inventoryRouter.get('/items/:id/balance', verifyAuth, requirePermission('inventory.view'),
  async (req, res) => {
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Item id is required.' })
    return res.json(await inventoryService.getStockBalance(id))
  })

// ── TRANSACTIONS ──

inventoryRouter.get('/transactions', verifyAuth, requirePermission('inventory.view'),
  async (req, res) => {
    const { inventoryItemId, departmentId, roomId, limit } = req.query as { inventoryItemId?: string; departmentId?: string; roomId?: string; limit?: string }
    return res.json(await inventoryService.listTransactions({ inventoryItemId, departmentId, roomId, limit: limit ? Number(limit) : undefined }))
  })

inventoryRouter.post('/transactions/receipt', verifyAuth, requirePermission('inventory.receive'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = StockReceiptSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await inventoryService.receiveStock(parsed.data, req.user.uid, req.user.role))
  })

inventoryRouter.post('/transactions/issue', verifyAuth, requirePermission('inventory.issue'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = StockIssueSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await inventoryService.issueStock(parsed.data, req.user.uid, req.user.role))
  })

inventoryRouter.post('/transactions/transfer', verifyAuth, requirePermission('inventory.transfer'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = StockTransferSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await inventoryService.transferStock(parsed.data, req.user.uid, req.user.role))
  })

inventoryRouter.post('/transactions/adjust', verifyAuth, requirePermission('inventory.manageItems'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = StockAdjustSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await inventoryService.adjustStock(parsed.data, req.user.uid, req.user.role))
  })
