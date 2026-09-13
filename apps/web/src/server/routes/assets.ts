/*
 * apps/web/src/server/routes/assets.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R20 — Assets & Inventory Management
 * [PURPOSE]: Routes for the assets domain — register CRUD, allocation/
 *   return, condition/disposal, and the requisition workflow. Permission
 *   gating follows the exact grants added to permissions.ts this phase:
 *     assets.viewRegister        — GET /, GET /:id
 *     assets.manageRegister      — POST /, PATCH /:id
 *     assets.allocateItem        — POST /:id/allocate
 *     assets.markCondition       — PATCH /:id/condition
 *     assets.dispose             — POST /:id/dispose
 *     assets.viewInventoryReports — GET /stats
 *     assets.requestItem         — POST /requests (any holder)
 *     assets.approveRequest      — PATCH /requests/:id/approve, /reject
 *     assets.viewOwnAssigned     — GET /my-assigned (self-service, no
 *                                   register visibility required)
 *   Collection/static routes (/stats, /requests, /my-assigned) are
 *   registered BEFORE GET /:id — same reasoning as library.ts: Express
 *   matches in registration order, and /:id would otherwise shadow them.
 * [DEPENDS ON]: packages/shared/schemas/assets.ts (same phase),
 *   apps/web/src/server/services/assetService.ts (same phase),
 *   packages/shared/types/permissions.ts (assets.* — same phase)
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import { prisma } from '@/lib/prisma'
import {
  CreateAssetSchema, UpdateAssetSchema, MarkAssetConditionSchema, DisposeAssetSchema,
  AllocateAssetSchema, ReturnAssetSchema, CreateAssetRequestSchema,
  ReviewAssetRequestSchema, RejectAssetRequestSchema,
  RecordAdvanceSchema, ReconcileAdvanceSchema, WriteOffAdvanceSchema,
} from '@shared/schemas/assets'
import * as assetService from '@/server/services/assetService'

export const assetsRouter = Router()

const getRequiredRouteParam = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0]
  return value
}

// ── REPORTS (static routes first) ──
assetsRouter.get('/stats', verifyAuth, requirePermission('assets.viewInventoryReports'),
  async (_req, res) => { return res.json(await assetService.getInventoryStats()) })

assetsRouter.get('/rooms', verifyAuth, requirePermission('assets.viewRegister'),
  async (_req, res) => { return res.json(await assetService.listRoomInventory()) })

// ── SELF-SERVICE ──
assetsRouter.get('/my-assigned', verifyAuth, requirePermission('assets.viewOwnAssigned'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const sp = await prisma.staffProfile.findFirst({ where: { uid: req.user.uid }, select: { id: true } })
    if (!sp) return res.json([])
    return res.json(await assetService.listMyAssignments(sp.id))
  })

// ── REQUISITIONS ──
assetsRouter.get('/requests', verifyAuth, requirePermission('assets.approveRequest'),
  async (req, res) => {
    const { status, department } = req.query as Record<string, string>
    return res.json(await assetService.listAssetRequests({ status, department }))
  })

assetsRouter.get('/requests/by-department', verifyAuth, requirePermission('assets.approveRequest'),
  async (_req, res) => { return res.json(await assetService.getRequestsByDepartment()) })

assetsRouter.post('/requests', verifyAuth, requirePermission('assets.requestItem'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreateAssetRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await assetService.createAssetRequest(parsed.data, req.user.uid, req.user.role))
  })

assetsRouter.get('/requests/mine', verifyAuth, requirePermission('assets.requestItem'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    return res.json(await assetService.listAssetRequests({ requestedByUid: req.user.uid }))
  })

assetsRouter.patch('/requests/:id/approve', verifyAuth, requirePermission('assets.approveRequest'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const requestId = getRequiredRouteParam(req.params.id)
    if (!requestId) return res.status(400).json({ error: 'Request id is required.' })
    const parsed = ReviewAssetRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await assetService.approveAssetRequest(requestId, parsed.data, req.user.uid, req.user.role))
  })

assetsRouter.patch('/requests/:id/reject', verifyAuth, requirePermission('assets.approveRequest'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const requestId = getRequiredRouteParam(req.params.id)
    if (!requestId) return res.status(400).json({ error: 'Request id is required.' })
    const parsed = RejectAssetRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await assetService.rejectAssetRequest(requestId, parsed.data, req.user.uid, req.user.role))
  })

// ── PROCUREMENT ADVANCES (R21) ──
assetsRouter.get('/advances', verifyAuth, requirePermission('assets.viewAdvances'),
  async (req, res) => {
    const { status } = req.query as Record<string, string>
    return res.json(await assetService.listAdvances({ status }))
  })

assetsRouter.get('/requests/:id/advances', verifyAuth, requirePermission('assets.viewAdvances'),
  async (req, res) => {
    const requestId = getRequiredRouteParam(req.params.id)
    if (!requestId) return res.status(400).json({ error: 'Request id is required.' })
    return res.json(await assetService.listAdvances({ assetRequestId: requestId }))
  })

assetsRouter.post('/requests/:id/advances', verifyAuth, requirePermission('assets.manageAdvances'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const requestId = getRequiredRouteParam(req.params.id)
    if (!requestId) return res.status(400).json({ error: 'Request id is required.' })
    const parsed = RecordAdvanceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await assetService.recordAdvance(requestId, parsed.data, req.user.uid, req.user.role))
  })

assetsRouter.patch('/advances/:id/reconcile', verifyAuth, requirePermission('assets.manageAdvances'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const advanceId = getRequiredRouteParam(req.params.id)
    if (!advanceId) return res.status(400).json({ error: 'Advance id is required.' })
    const parsed = ReconcileAdvanceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await assetService.reconcileAdvance(advanceId, parsed.data, req.user.uid, req.user.role))
  })

assetsRouter.patch('/advances/:id/write-off', verifyAuth, requirePermission('assets.manageAdvances'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const advanceId = getRequiredRouteParam(req.params.id)
    if (!advanceId) return res.status(400).json({ error: 'Advance id is required.' })
    const parsed = WriteOffAdvanceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await assetService.writeOffAdvance(advanceId, parsed.data, req.user.uid, req.user.role))
  })

// ── REGISTER ──
assetsRouter.get('/', verifyAuth, requirePermission('assets.viewRegister'),
  async (req, res) => {
    const { category, status, search, sortBy, sortDir } = req.query as Record<string, string>
    return res.json(await assetService.listAssets({
      category, status, search,
      sortBy: sortBy as never, sortDir: sortDir as never,
    }))
  })

assetsRouter.post('/', verifyAuth, requirePermission('assets.manageRegister'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreateAssetSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await assetService.createAsset(parsed.data, req.user.uid, req.user.role))
  })

assetsRouter.get('/:id', verifyAuth, requirePermission('assets.viewRegister'),
  async (req, res) => {
    const assetId = getRequiredRouteParam(req.params.id)
    if (!assetId) return res.status(400).json({ error: 'Asset id is required.' })
    const asset = await assetService.getAssetById(assetId)
    if (!asset) return res.status(404).json({ error: 'Asset not found.' })
    return res.json(asset)
  })

assetsRouter.patch('/:id', verifyAuth, requirePermission('assets.manageRegister'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const assetId = getRequiredRouteParam(req.params.id)
    if (!assetId) return res.status(400).json({ error: 'Asset id is required.' })
    const parsed = UpdateAssetSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await assetService.updateAsset(assetId, parsed.data, req.user.uid, req.user.role))
  })

assetsRouter.patch('/:id/condition', verifyAuth, requirePermission('assets.markCondition'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const assetId = getRequiredRouteParam(req.params.id)
    if (!assetId) return res.status(400).json({ error: 'Asset id is required.' })
    const parsed = MarkAssetConditionSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await assetService.markCondition(assetId, parsed.data, req.user.uid, req.user.role))
  })

assetsRouter.post('/:id/dispose', verifyAuth, requirePermission('assets.dispose'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const assetId = getRequiredRouteParam(req.params.id)
    if (!assetId) return res.status(400).json({ error: 'Asset id is required.' })
    const parsed = DisposeAssetSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await assetService.disposeAsset(assetId, parsed.data, req.user.uid, req.user.role))
  })

// ── ALLOCATION / RETURN ──
assetsRouter.post('/:id/allocate', verifyAuth, requirePermission('assets.allocateItem'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const assetId = getRequiredRouteParam(req.params.id)
    if (!assetId) return res.status(400).json({ error: 'Asset id is required.' })
    const parsed = AllocateAssetSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await assetService.allocateAsset(assetId, parsed.data, req.user.uid, req.user.role))
  })

assetsRouter.get('/:id/assignments', verifyAuth, requirePermission('assets.viewRegister'),
  async (req, res) => {
    const assetId = getRequiredRouteParam(req.params.id)
    if (!assetId) return res.status(400).json({ error: 'Asset id is required.' })
    return res.json(await assetService.listAssignments({ assetId }))
  })

assetsRouter.post('/assignments/:assignmentId/return', verifyAuth, requirePermission('assets.allocateItem'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const assignmentId = getRequiredRouteParam(req.params.assignmentId)
    if (!assignmentId) return res.status(400).json({ error: 'Assignment id is required.' })
    const parsed = ReturnAssetSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await assetService.returnAsset(assignmentId, parsed.data, req.user.uid, req.user.role))
  })