/*
 * apps/web/src/server/services/locationService.ts
 *
 * [CHANGE TYPE]: NEW FILE (R22)
 * [PURPOSE]: Department / Building / Room CRUD — the structured location
 *   domain that Asset/AssetAssignment/Budget/StaffProfile/PurchaseRequisition
 *   optionally reference alongside their existing free-text fields.
 *   Deactivate, don't delete (Artefact 6 §27) — isActive is how an
 *   organizational unit is retired.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (Department/Building/Room — R22)
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'
import type { UserRole } from '@shared/types/roles'

// ─── DEPARTMENTS ──────────────────────────────────────────

export async function listDepartments(includeInactive = false) {
  return prisma.department.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { name: 'asc' },
  })
}

export async function createDepartment(
  input: { code: string; name: string; description?: string },
  actorUid: string, actorRole: UserRole,
) {
  const existing = await prisma.department.findUnique({ where: { code: input.code } })
  if (existing) throw Object.assign(new Error('A department with this code already exists.'), { status: 409 })

  const department = await prisma.department.create({ data: { ...input } })
  await auditService.log({
    action: 'location.department.create', entityType: 'Department', entityId: department.id,
    actorUid, actorRole, metadata: { context: { code: department.code, name: department.name } },
  })
  return department
}

export async function updateDepartment(
  id: string, input: { name?: string; description?: string; isActive?: boolean },
  actorUid: string, actorRole: UserRole,
) {
  const existing = await prisma.department.findUnique({ where: { id } })
  if (!existing) throw Object.assign(new Error('Department not found.'), { status: 404 })

  const department = await prisma.department.update({ where: { id }, data: input })
  await auditService.log({
    action: 'location.department.update', entityType: 'Department', entityId: id,
    actorUid, actorRole, metadata: { before: existing, after: input },
  })
  return department
}

// ─── BUILDINGS ────────────────────────────────────────────

export async function listBuildings(includeInactive = false) {
  return prisma.building.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { rooms: true } } },
  })
}

export async function createBuilding(
  input: { code: string; name: string; description?: string },
  actorUid: string, actorRole: UserRole,
) {
  const existing = await prisma.building.findUnique({ where: { code: input.code } })
  if (existing) throw Object.assign(new Error('A building with this code already exists.'), { status: 409 })

  const building = await prisma.building.create({ data: { ...input } })
  await auditService.log({
    action: 'location.building.create', entityType: 'Building', entityId: building.id,
    actorUid, actorRole, metadata: { context: { code: building.code, name: building.name } },
  })
  return building
}

export async function updateBuilding(
  id: string, input: { name?: string; description?: string; isActive?: boolean },
  actorUid: string, actorRole: UserRole,
) {
  const existing = await prisma.building.findUnique({ where: { id } })
  if (!existing) throw Object.assign(new Error('Building not found.'), { status: 404 })

  const building = await prisma.building.update({ where: { id }, data: input })
  await auditService.log({
    action: 'location.building.update', entityType: 'Building', entityId: id,
    actorUid, actorRole, metadata: { before: existing, after: input },
  })
  return building
}

// ─── ROOMS ────────────────────────────────────────────────

export async function listRooms(filters: { buildingId?: string; departmentId?: string; includeInactive?: boolean }) {
  return prisma.room.findMany({
    where: {
      buildingId: filters.buildingId,
      departmentId: filters.departmentId,
      isActive: filters.includeInactive ? undefined : true,
    },
    include: { building: { select: { name: true, code: true } }, department: { select: { name: true } }, custodian: { select: { firstName: true, lastName: true, uid: true } } },
    orderBy: [{ building: { name: 'asc' } }, { code: 'asc' }],
  })
}

export async function createRoom(
  input: { buildingId: string; code: string; name: string; roomType: string; departmentId?: string; custodianUid?: string },
  actorUid: string, actorRole: UserRole,
) {
  const building = await prisma.building.findUnique({ where: { id: input.buildingId } })
  if (!building) throw Object.assign(new Error('Building not found.'), { status: 400 })

  const existing = await prisma.room.findUnique({ where: { buildingId_code: { buildingId: input.buildingId, code: input.code } } })
  if (existing) throw Object.assign(new Error('A room with this code already exists in this building.'), { status: 409 })

  if (input.custodianUid) {
    const custodian = await prisma.staffProfile.findUnique({ where: { uid: input.custodianUid } })
    if (!custodian) throw Object.assign(new Error('Custodian staff member not found.'), { status: 400 })
  }

  const room = await prisma.room.create({ data: { ...input } })
  await auditService.log({
    action: 'location.room.create', entityType: 'Room', entityId: room.id,
    actorUid, actorRole, metadata: { context: { buildingId: room.buildingId, code: room.code } },
  })
  return room
}

export async function updateRoom(
  id: string,
  input: { name?: string; roomType?: string; departmentId?: string | null; custodianUid?: string | null; isActive?: boolean },
  actorUid: string, actorRole: UserRole,
) {
  const existing = await prisma.room.findUnique({ where: { id } })
  if (!existing) throw Object.assign(new Error('Room not found.'), { status: 404 })

  if (input.custodianUid) {
    const custodian = await prisma.staffProfile.findUnique({ where: { uid: input.custodianUid } })
    if (!custodian) throw Object.assign(new Error('Custodian staff member not found.'), { status: 400 })
  }

  // Room custodianship is physical accountability only — it does not grant
  // financial approval authority (Artefact 8 §11). No permission escalation
  // happens here; approvals are still gated by procurement.* permissions.
  const room = await prisma.room.update({ where: { id }, data: input })
  await auditService.log({
    action: 'location.room.update', entityType: 'Room', entityId: id,
    actorUid, actorRole, metadata: { before: existing, after: input },
  })
  return room
}
