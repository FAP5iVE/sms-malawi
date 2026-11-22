/*
 * apps/web/src/server/routes/procurement.ts
 *
 * [CHANGE TYPE]: NEW FILE (R22)
 * [PURPOSE]: Routes for the procurement domain — this router did not
 *   exist anywhere in the partner's delivered code; the UI
 *   (useProcurement.ts) was calling these paths against nothing.
 *   Mounted at /procurement in api-app.ts.
 *     procurement.createRequisition   — POST /requisitions, /requisitions/:id/submit
 *     procurement.viewRequisitions    — GET /requisitions
 *     procurement.reviewRequisition   — POST /requisitions/:id/approve|reject|return
 *     (any requester)                 — POST /requisitions/:id/cancel (own only)
 *     procurement.manageRFQ           — RFQ + quotation routes
 *     procurement.manageSuppliers     — supplier routes
 *     procurement.managePurchaseOrders — PO routes
 *     procurement.receiveGoods        — goods receipt routes
 *   Static/collection routes are registered before any /:id routes.
 * [DEPENDS ON]: packages/shared/schemas/assetsInventoryProcurement.ts,
 *   apps/web/src/server/services/procurementService.ts (all R22)
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import {
  CreatePurchaseRequisitionSchema, ReviewRequisitionSchema, RejectRequisitionSchema,
  CreateSupplierSchema, CreateRFQSchema, RecordQuotationSchema,
  CreatePurchaseOrderSchema, CreateGoodsReceiptSchema,
} from '@shared/schemas/assetsInventoryProcurement'
import * as procurementService from '@/server/services/procurementService'

export const procurementRouter = Router()

const param = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

// ── REQUISITIONS ──

procurementRouter.get('/requisitions', verifyAuth, requirePermission('procurement.viewRequisitions'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const { departmentId, status } = req.query as { departmentId?: string; status?: string }
    // Requester-only roles (academic/hr) see just their own; broader roles see by department/status filter.
    const canSeeAll = ['finance', 'admin', 'high_rank'].includes(req.user.role)
    return res.json(await procurementService.listRequisitions({ departmentId, status, requestedByUid: canSeeAll ? undefined : req.user.uid }))
  })

procurementRouter.post('/requisitions', verifyAuth, requirePermission('procurement.createRequisition'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreatePurchaseRequisitionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await procurementService.createPurchaseRequisition(parsed.data, req.user.uid, req.user.role))
  })

procurementRouter.post('/requisitions/:id/submit', verifyAuth, requirePermission('procurement.createRequisition'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Requisition id is required.' })
    return res.json(await procurementService.submitRequisition(id, req.user.uid, req.user.role))
  })

procurementRouter.post('/requisitions/:id/approve', verifyAuth, requirePermission('procurement.reviewRequisition'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Requisition id is required.' })
    const parsed = ReviewRequisitionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await procurementService.approveRequisition(id, parsed.data, req.user.uid, req.user.role))
  })

procurementRouter.post('/requisitions/:id/reject', verifyAuth, requirePermission('procurement.reviewRequisition'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Requisition id is required.' })
    const parsed = RejectRequisitionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await procurementService.rejectRequisition(id, parsed.data, req.user.uid, req.user.role))
  })

procurementRouter.post('/requisitions/:id/return', verifyAuth, requirePermission('procurement.reviewRequisition'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Requisition id is required.' })
    const parsed = RejectRequisitionSchema.safeParse(req.body) // same shape: a required reviewNote explaining what to change
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await procurementService.returnRequisition(id, parsed.data, req.user.uid, req.user.role))
  })

procurementRouter.post('/requisitions/:id/cancel', verifyAuth, requirePermission('procurement.createRequisition'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Requisition id is required.' })
    return res.json(await procurementService.cancelRequisition(id, req.user.uid, req.user.role))
  })

// ── SUPPLIERS ──

procurementRouter.get('/suppliers', verifyAuth, requirePermission('procurement.manageSuppliers'),
  async (_req, res) => { return res.json(await procurementService.listSuppliers()) })

procurementRouter.post('/suppliers', verifyAuth, requirePermission('procurement.manageSuppliers'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreateSupplierSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await procurementService.createSupplier(parsed.data, req.user.uid, req.user.role))
  })

// ── RFQ ──

procurementRouter.get('/rfqs', verifyAuth, requirePermission('procurement.manageRFQ'),
  async (req, res) => {
    const { purchaseRequisitionId } = req.query as { purchaseRequisitionId?: string }
    return res.json(await procurementService.listRFQs({ purchaseRequisitionId }))
  })

procurementRouter.post('/rfqs', verifyAuth, requirePermission('procurement.manageRFQ'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreateRFQSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await procurementService.createRFQ(parsed.data, req.user.uid, req.user.role))
  })

procurementRouter.post('/rfqs/:id/close', verifyAuth, requirePermission('procurement.manageRFQ'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'RFQ id is required.' })
    return res.json(await procurementService.closeRFQ(id, req.user.uid, req.user.role))
  })

// ── QUOTATIONS ──

procurementRouter.get('/quotations', verifyAuth, requirePermission('procurement.manageRFQ'),
  async (req, res) => {
    const { rfqId } = req.query as { rfqId?: string }
    return res.json(await procurementService.listQuotations({ rfqId }))
  })

procurementRouter.post('/quotations', verifyAuth, requirePermission('procurement.manageRFQ'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = RecordQuotationSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await procurementService.recordQuotation(parsed.data, req.user.uid, req.user.role))
  })

procurementRouter.post('/quotations/:id/select', verifyAuth, requirePermission('procurement.manageRFQ'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Quotation id is required.' })
    return res.json(await procurementService.selectQuotation(id, req.user.uid, req.user.role))
  })

procurementRouter.post('/quotations/:id/reject', verifyAuth, requirePermission('procurement.manageRFQ'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Quotation id is required.' })
    return res.json(await procurementService.rejectQuotation(id, req.user.uid, req.user.role))
  })

// ── PURCHASE ORDERS ──

procurementRouter.get('/purchase-orders', verifyAuth, requirePermission('procurement.managePurchaseOrders'),
  async (req, res) => {
    const { supplierId, status } = req.query as { supplierId?: string; status?: string }
    return res.json(await procurementService.listPurchaseOrders({ supplierId, status }))
  })

procurementRouter.post('/purchase-orders', verifyAuth, requirePermission('procurement.managePurchaseOrders'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreatePurchaseOrderSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await procurementService.createPurchaseOrder(parsed.data, req.user.uid, req.user.role))
  })

procurementRouter.post('/purchase-orders/:id/approve', verifyAuth, requirePermission('procurement.managePurchaseOrders'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Purchase order id is required.' })
    return res.json(await procurementService.approvePurchaseOrder(id, req.user.uid, req.user.role))
  })

procurementRouter.post('/purchase-orders/:id/send', verifyAuth, requirePermission('procurement.managePurchaseOrders'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Purchase order id is required.' })
    return res.json(await procurementService.sendPurchaseOrder(id, req.user.uid, req.user.role))
  })

procurementRouter.post('/purchase-orders/:id/cancel', verifyAuth, requirePermission('procurement.managePurchaseOrders'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Purchase order id is required.' })
    return res.json(await procurementService.cancelPurchaseOrder(id, req.user.uid, req.user.role))
  })

// ── GOODS RECEIPTS ──

procurementRouter.get('/goods-receipts', verifyAuth, requirePermission('procurement.receiveGoods'),
  async (req, res) => {
    const { purchaseOrderId } = req.query as { purchaseOrderId?: string }
    return res.json(await procurementService.listGoodsReceipts({ purchaseOrderId }))
  })

procurementRouter.post('/goods-receipts', verifyAuth, requirePermission('procurement.receiveGoods'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreateGoodsReceiptSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await procurementService.createGoodsReceipt(parsed.data, req.user.uid, req.user.role))
  })

procurementRouter.post('/goods-receipts/:id/complete', verifyAuth, requirePermission('procurement.receiveGoods'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Goods receipt id is required.' })
    return res.json(await procurementService.completeGoodsReceipt(id, req.user.uid, req.user.role))
  })
