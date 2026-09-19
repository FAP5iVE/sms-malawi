/*
 * apps/web/src/server/services/mappingService.ts
 *
 * [CHANGE TYPE]: NEW FILE (R22)
 * [PURPOSE]: Turns free-text legacy department/location strings into
 *   reviewed, canonical Department/Room references, per Artefacts 6/9/10's
 *   "controlled mapping" design: propose -> human review -> approve ->
 *   apply. Never auto-merges similarly-spelled values.
 *
 * [FIX — supersedes the partner's draft]: the delivered draft's
 *   proposeDepartmentMappings() created value-level LegacyMapping rows
 *   (one per distinct normalized legacy string, no sourceRecordId), but
 *   applyApprovedMappings() only knew how to apply *record-level* mappings
 *   keyed by sourceRecordId — so every mapping ever proposed by that draft
 *   was rejected by apply() with "Unsupported mapping application:
 *   DEPARTMENT". This version is value-level end to end: propose finds
 *   distinct legacy strings, approve is a human decision per distinct
 *   value, and apply bulk-updates every source row whose legacy field
 *   normalizes to that value. Far fewer mapping rows than a per-record
 *   design, and matches the "canonical mapping" framing in Artefact 9/10.
 *
 * [SCOPE NOTE]: Class.room / TimetableSlot.room are also free-text room
 *   references (Artefact 7 §18) but belong to the Class/Timetable modules,
 *   which are explicitly out of scope for this migration (Artefact 6 §38).
 *   Not touched here — a later, separately-reviewed piece of work.
 *
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (LegacyMapping, Department,
 *   Room — R22), src/server/services/auditService.ts
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'
import type { UserRole } from '@shared/types/roles'

export function normalizeLegacyValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

interface Candidate {
  normalizedValue: string
  sampleRawValue: string
  occurrences: number
}

function collectCandidates(values: (string | null)[]): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>()
  for (const raw of values) {
    if (!raw?.trim()) continue
    const normalizedValue = normalizeLegacyValue(raw)
    const existing = candidates.get(normalizedValue)
    if (existing) {
      existing.occurrences++
    } else {
      candidates.set(normalizedValue, {
        normalizedValue,
        sampleRawValue: raw.trim(),
        occurrences: 1,
      })
    }
  }
  return candidates
}

// ─── PROPOSE ──────────────────────────────────────────────

/**
 * Scans StaffProfile.department, Budget.department and AssetRequest.department
 * for distinct legacy values, and proposes a mapping to an existing Department
 * for every value whose normalized form exactly matches an existing
 * Department.name. Values with no confident match are returned as
 * `unmatched` for manual Department creation first — never auto-created.
 */
export async function proposeDepartmentMappings(actorUid: string, actorRole: UserRole) {
  const [staff, budgets, requests, departments, existingMappings] = await Promise.all([
    prisma.staffProfile.findMany({ select: { department: true } }),
    prisma.budget.findMany({ select: { department: true } }),
    prisma.assetRequest.findMany({ select: { department: true } }),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.legacyMapping.findMany({
      where: { mappingType: 'DEPARTMENT' },
      select: { normalizedValue: true },
    }),
  ])

  const candidates = collectCandidates([
    ...staff.map((s) => s.department),
    ...budgets.map((b) => b.department),
    ...requests.map((r) => r.department),
  ])

  const departmentByName = new Map(departments.map((d) => [normalizeLegacyValue(d.name), d]))
  const alreadyProposed = new Set(existingMappings.map((m) => m.normalizedValue))

  const created: unknown[] = []
  const unmatched: Array<{
    normalizedValue: string
    sampleRawValue: string
    occurrences: number
    reason: string
  }> = []

  for (const candidate of candidates.values()) {
    if (alreadyProposed.has(candidate.normalizedValue)) continue
    const target = departmentByName.get(candidate.normalizedValue)
    if (!target) {
      unmatched.push({
        ...candidate,
        reason: 'No Department with a matching name — create it first, then re-run.',
      })
      continue
    }
    created.push(
      await prisma.legacyMapping.create({
        data: {
          mappingType: 'DEPARTMENT',
          normalizedValue: candidate.normalizedValue,
          legacyValue: candidate.sampleRawValue,
          targetType: 'Department',
          targetId: target.id,
          status: 'PROPOSED',
          createdByUid: actorUid,
        },
      })
    )
  }

  await auditService.log({
    action: 'location.mapping.proposeDepartments',
    entityType: 'LegacyMapping',
    entityId: 'batch',
    actorUid,
    actorRole,
    metadata: { context: { created: created.length, unmatched } },
  })
  return { created, unmatched }
}

/**
 * Same idea for room/location legacy strings (Asset.location,
 * AssetAssignment.departmentOrRoom). A value may resolve to either a Room
 * or, for values that were always organizational rather than physical, a
 * Department — targetType records which.
 */
export async function proposeLocationMappings(actorUid: string, actorRole: UserRole) {
  const [assets, assignments, rooms, departments, existingMappings] = await Promise.all([
    prisma.asset.findMany({ select: { location: true } }),
    prisma.assetAssignment.findMany({ select: { departmentOrRoom: true } }),
    prisma.room.findMany({ select: { id: true, name: true, code: true } }),
    prisma.department.findMany({ select: { id: true, name: true } }),
    prisma.legacyMapping.findMany({
      where: { mappingType: 'LOCATION' },
      select: { normalizedValue: true },
    }),
  ])

  const candidates = collectCandidates([
    ...assets.map((a) => a.location),
    ...assignments.map((a) => a.departmentOrRoom),
  ])

  const roomByNameOrCode = new Map<string, { id: string }>()
  for (const r of rooms) {
    roomByNameOrCode.set(normalizeLegacyValue(r.name), r)
    roomByNameOrCode.set(normalizeLegacyValue(r.code), r)
  }
  const departmentByName = new Map(departments.map((d) => [normalizeLegacyValue(d.name), d]))
  const alreadyProposed = new Set(existingMappings.map((m) => m.normalizedValue))

  const created: unknown[] = []
  const unmatched: Array<{
    normalizedValue: string
    sampleRawValue: string
    occurrences: number
    reason: string
  }> = []

  for (const candidate of candidates.values()) {
    if (alreadyProposed.has(candidate.normalizedValue)) continue
    const room = roomByNameOrCode.get(candidate.normalizedValue)
    const department = departmentByName.get(candidate.normalizedValue)
    const target = room ?? department
    const targetType = room ? 'Room' : department ? 'Department' : null
    if (!target || !targetType) {
      unmatched.push({
        ...candidate,
        reason: 'No Room or Department with a matching name/code — create it first, then re-run.',
      })
      continue
    }
    created.push(
      await prisma.legacyMapping.create({
        data: {
          mappingType: 'LOCATION',
          normalizedValue: candidate.normalizedValue,
          legacyValue: candidate.sampleRawValue,
          targetType,
          targetId: target.id,
          status: 'PROPOSED',
          createdByUid: actorUid,
        },
      })
    )
  }

  await auditService.log({
    action: 'location.mapping.proposeLocations',
    entityType: 'LegacyMapping',
    entityId: 'batch',
    actorUid,
    actorRole,
    metadata: { context: { created: created.length, unmatched } },
  })
  return { created, unmatched }
}

export async function listMappings(status?: string) {
  return prisma.legacyMapping.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { createdAt: 'asc' },
  })
}

// ─── APPROVE / REJECT ─────────────────────────────────────

export async function approveMapping(
  id: string,
  actorUid: string,
  actorRole: UserRole,
  notes?: string
) {
  const mapping = await prisma.legacyMapping.findUnique({ where: { id } })
  if (!mapping) throw Object.assign(new Error('Mapping not found.'), { status: 404 })
  if (mapping.status !== 'PROPOSED')
    throw Object.assign(new Error('Only proposed mappings can be approved.'), { status: 409 })

  const updated = await prisma.legacyMapping.update({
    where: { id },
    data: { status: 'APPROVED', reviewedByUid: actorUid, reviewedAt: new Date(), notes },
  })
  await auditService.log({
    action: 'location.mapping.approve',
    entityType: 'LegacyMapping',
    entityId: id,
    actorUid,
    actorRole,
    metadata: {
      context: {
        mappingType: mapping.mappingType,
        legacyValue: mapping.legacyValue,
        targetType: mapping.targetType,
        targetId: mapping.targetId,
      },
    },
  })
  return updated
}

export async function rejectMapping(
  id: string,
  actorUid: string,
  actorRole: UserRole,
  notes?: string
) {
  const mapping = await prisma.legacyMapping.findUnique({ where: { id } })
  if (!mapping) throw Object.assign(new Error('Mapping not found.'), { status: 404 })
  if (mapping.status !== 'PROPOSED')
    throw Object.assign(new Error('Only proposed mappings can be rejected.'), { status: 409 })

  const updated = await prisma.legacyMapping.update({
    where: { id },
    data: { status: 'REJECTED', reviewedByUid: actorUid, reviewedAt: new Date(), notes },
  })
  await auditService.log({
    action: 'location.mapping.reject',
    entityType: 'LegacyMapping',
    entityId: id,
    actorUid,
    actorRole,
  })
  return updated
}

// ─── APPLY ────────────────────────────────────────────────

/**
 * Applies every APPROVED mapping. For each one, bulk-updates every source
 * row whose legacy field normalizes to that mapping's value. Never touches
 * a row whose legacy value doesn't match any approved mapping — those
 * remain nullable/unmapped and stay visible in reporting (Artefact 6 §10).
 */
export async function applyApprovedMappings(actorUid: string, actorRole: UserRole) {
  const mappings = await prisma.legacyMapping.findMany({
    where: { status: 'APPROVED' },
    orderBy: { createdAt: 'asc' },
  })

  let applied = 0
  const skipped: Array<{ id: string; reason: string }> = []

  for (const mapping of mappings) {
    try {
      const recordsAffected = await prisma.$transaction(async (tx) => {
        let count = 0

        if (mapping.mappingType === 'DEPARTMENT') {
          const [staff, budgets, requests] = await Promise.all([
            tx.staffProfile.findMany({ select: { id: true, department: true } }),
            tx.budget.findMany({ select: { id: true, department: true } }),
            tx.assetRequest.findMany({ select: { id: true, department: true } }),
          ])
          const staffIds = staff
            .filter(
              (s) => s.department && normalizeLegacyValue(s.department) === mapping.normalizedValue
            )
            .map((s) => s.id)
          const budgetIds = budgets
            .filter(
              (b) => b.department && normalizeLegacyValue(b.department) === mapping.normalizedValue
            )
            .map((b) => b.id)
          const requestIds = requests
            .filter(
              (r) => r.department && normalizeLegacyValue(r.department) === mapping.normalizedValue
            )
            .map((r) => r.id)

          if (staffIds.length)
            count += (
              await tx.staffProfile.updateMany({
                where: { id: { in: staffIds } },
                data: { departmentId: mapping.targetId },
              })
            ).count
          if (budgetIds.length)
            count += (
              await tx.budget.updateMany({
                where: { id: { in: budgetIds } },
                data: { departmentId: mapping.targetId },
              })
            ).count
          if (requestIds.length)
            count += (
              await tx.assetRequest.updateMany({
                where: { id: { in: requestIds } },
                data: { departmentId: mapping.targetId },
              })
            ).count
        } else if (mapping.mappingType === 'LOCATION') {
          const [assets, assignments] = await Promise.all([
            tx.asset.findMany({
              where: { location: { not: null } },
              select: { id: true, location: true },
            }),
            tx.assetAssignment.findMany({
              where: { departmentOrRoom: { not: null } },
              select: { id: true, departmentOrRoom: true },
            }),
          ])
          const assetIds = assets
            .filter(
              (a) => a.location && normalizeLegacyValue(a.location) === mapping.normalizedValue
            )
            .map((a) => a.id)
          const assignmentIds = assignments
            .filter(
              (a) =>
                a.departmentOrRoom &&
                normalizeLegacyValue(a.departmentOrRoom) === mapping.normalizedValue
            )
            .map((a) => a.id)

          if (mapping.targetType === 'Room') {
            if (assetIds.length)
              count += (
                await tx.asset.updateMany({
                  where: { id: { in: assetIds } },
                  data: { roomId: mapping.targetId },
                })
              ).count
            if (assignmentIds.length)
              count += (
                await tx.assetAssignment.updateMany({
                  where: { id: { in: assignmentIds } },
                  data: { roomId: mapping.targetId, departmentId: null },
                })
              ).count
          } else if (mapping.targetType === 'Department') {
            if (assetIds.length)
              count += (
                await tx.asset.updateMany({
                  where: { id: { in: assetIds } },
                  data: { departmentId: mapping.targetId },
                })
              ).count
            if (assignmentIds.length)
              count += (
                await tx.assetAssignment.updateMany({
                  where: { id: { in: assignmentIds } },
                  data: { departmentId: mapping.targetId, roomId: null },
                })
              ).count
          } else {
            throw new Error(
              `Unrecognized targetType "${mapping.targetType}" for a LOCATION mapping.`
            )
          }
        } else {
          throw new Error(`Unsupported mapping type: ${mapping.mappingType}`)
        }

        await tx.legacyMapping.update({
          where: { id: mapping.id },
          data: { status: 'APPLIED', appliedAt: new Date(), recordsAffected: count },
        })
        return count
      })

      applied++
      await auditService.log({
        action: 'location.mapping.apply',
        entityType: 'LegacyMapping',
        entityId: mapping.id,
        actorUid,
        actorRole,
        metadata: { context: { mappingType: mapping.mappingType, recordsAffected } },
      })
    } catch (error) {
      skipped.push({
        id: mapping.id,
        reason: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  return { applied, skipped }
}
