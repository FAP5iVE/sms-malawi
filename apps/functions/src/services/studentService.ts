import { prisma } from '../lib/prisma'
import { generateRegistrationNo } from '@shared/constants/malawi'
import type { CreateStudentInput, UpdateStudentInput } from '@shared/schemas/student'
import type { Prisma } from '@prisma/client'

// ─── LIST STUDENTS ───────────────────────────────────────
export async function listStudents(filters: {
  classId?: string
  status?: string
  search?: string // handled by Algolia on the frontend — here for admin fallback
  page?: number
  limit?: number
}) {
  const { classId, status, page = 1, limit = 50 } = filters
  const where: Prisma.StudentWhereInput = {}

  if (classId) where.classId = classId
  if (status) where.status = status as any

  const [students, total] = await prisma.$transaction([
    prisma.student.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { lastName: 'asc' },
      include: { class: { select: { name: true, form: true } } },
    }),
    prisma.student.count({ where }),
  ])

  return { students, total, page, pages: Math.ceil(total / limit) }
}

// ─── GET SINGLE STUDENT ──────────────────────────────────
export async function getStudent(id: string) {
  return prisma.student.findUniqueOrThrow({
    where: { id },
    include: { class: true },
  })
}

// ─── CREATE STUDENT ──────────────────────────────────────
export async function createStudent(data: CreateStudentInput, actorUid: string, actorRole: string) {
  // Generate unique registration number
  const year = new Date().getFullYear()
  const count = await prisma.student.count()
  const regNo = generateRegistrationNo(year, count + 1)

  const student = await prisma.student.create({
    data: { ...data, registrationNo: regNo, dateOfBirth: new Date(data.dateOfBirth) },
  })

  // Audit log
  await writeAuditLog('student.create', 'Student', student.id, actorUid, actorRole)

  return student
}

// ─── UPDATE STUDENT ──────────────────────────────────────
export async function updateStudent(
  id: string,
  data: UpdateStudentInput,
  actorUid: string,
  actorRole: string
) {
  const updated = await prisma.student.update({
    where: { id },
    data: {
      ...data,
      ...(data.dateOfBirth && { dateOfBirth: new Date(data.dateOfBirth) }),
    },
  })

  await writeAuditLog('student.update', 'Student', id, actorUid, actorRole, data)
  return updated
}

// ─── ARCHIVE STUDENT (never delete) ─────────────────────
export async function archiveStudent(id: string, actorUid: string, actorRole: string) {
  const archived = await prisma.student.update({
    where: { id },
    data: { status: 'ARCHIVED' },
  })

  await writeAuditLog('student.archive', 'Student', id, actorUid, actorRole)
  return archived
}

// ─── AUDIT LOG HELPER ────────────────────────────────────
async function writeAuditLog(
  action: string,
  entityType: string,
  entityId: string,
  actorUid: string,
  actorRole: string,
  metadata?: object
) {
  await prisma.auditLog.create({
    data: { action, entityType, entityId, actorUid, actorRole, metadata },
  })
}
