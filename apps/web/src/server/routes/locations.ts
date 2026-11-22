/*
 * apps/web/src/server/routes/locations.ts
 *
 * [CHANGE TYPE]: NEW FILE (R22)
 * [PURPOSE]: Department/Building/Room CRUD, plus the legacy-mapping
 *   propose/review/apply workflow (Artefacts 9/10). Mounted at /locations
 *   in api-app.ts.
 *     location.view    — GET routes
 *     location.manage  — POST/PATCH routes, mapping propose/apply
 * [DEPENDS ON]: packages/shared/schemas/assetsInventoryProcurement.ts,
 *   apps/web/src/server/services/locationService.ts,
 *   apps/web/src/server/services/mappingService.ts (all R22)
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import {
  CreateDepartmentSchema, UpdateDepartmentSchema, CreateBuildingSchema, UpdateBuildingSchema,
  CreateRoomSchema, UpdateRoomSchema, ReviewMappingSchema,
} from '@shared/schemas/assetsInventoryProcurement'
import * as locationService from '@/server/services/locationService'
import * as mappingService from '@/server/services/mappingService'

export const locationsRouter = Router()

const param = (value: string | string[] | undefined): string | undefined => Array.isArray(value) ? value[0] : value

// ── DEPARTMENTS ──

locationsRouter.get('/departments', verifyAuth, requirePermission('location.view'),
  async (req, res) => {
    const { includeInactive } = req.query as { includeInactive?: string }
    return res.json(await locationService.listDepartments(includeInactive === 'true'))
  })

locationsRouter.post('/departments', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreateDepartmentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await locationService.createDepartment(parsed.data, req.user.uid, req.user.role))
  })

locationsRouter.patch('/departments/:id', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Department id is required.' })
    const parsed = UpdateDepartmentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await locationService.updateDepartment(id, parsed.data, req.user.uid, req.user.role))
  })

// ── BUILDINGS ──

locationsRouter.get('/buildings', verifyAuth, requirePermission('location.view'),
  async (req, res) => {
    const { includeInactive } = req.query as { includeInactive?: string }
    return res.json(await locationService.listBuildings(includeInactive === 'true'))
  })

locationsRouter.post('/buildings', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreateBuildingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await locationService.createBuilding(parsed.data, req.user.uid, req.user.role))
  })

locationsRouter.patch('/buildings/:id', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Building id is required.' })
    const parsed = UpdateBuildingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await locationService.updateBuilding(id, parsed.data, req.user.uid, req.user.role))
  })

// ── ROOMS ──

locationsRouter.get('/rooms', verifyAuth, requirePermission('location.view'),
  async (req, res) => {
    const { buildingId, departmentId, includeInactive } = req.query as { buildingId?: string; departmentId?: string; includeInactive?: string }
    return res.json(await locationService.listRooms({ buildingId, departmentId, includeInactive: includeInactive === 'true' }))
  })

locationsRouter.post('/rooms', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const parsed = CreateRoomSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await locationService.createRoom(parsed.data, req.user.uid, req.user.role))
  })

locationsRouter.patch('/rooms/:id', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Room id is required.' })
    const parsed = UpdateRoomSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await locationService.updateRoom(id, parsed.data, req.user.uid, req.user.role))
  })

// ── LEGACY MAPPING (backfill review workflow — Artefacts 9/10) ──

locationsRouter.get('/mappings', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    const { status } = req.query as { status?: string }
    return res.json(await mappingService.listMappings(status))
  })

locationsRouter.post('/mappings/propose-departments', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    return res.status(201).json(await mappingService.proposeDepartmentMappings(req.user.uid, req.user.role))
  })

locationsRouter.post('/mappings/propose-locations', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    return res.status(201).json(await mappingService.proposeLocationMappings(req.user.uid, req.user.role))
  })

locationsRouter.post('/mappings/:id/approve', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Mapping id is required.' })
    const parsed = ReviewMappingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await mappingService.approveMapping(id, req.user.uid, req.user.role, parsed.data.notes))
  })

locationsRouter.post('/mappings/:id/reject', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    const id = param(req.params.id)
    if (!id) return res.status(400).json({ error: 'Mapping id is required.' })
    const parsed = ReviewMappingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await mappingService.rejectMapping(id, req.user.uid, req.user.role, parsed.data.notes))
  })

locationsRouter.post('/mappings/apply', verifyAuth, requirePermission('location.manage'),
  async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated.' })
    return res.json(await mappingService.applyApprovedMappings(req.user.uid, req.user.role))
  })
