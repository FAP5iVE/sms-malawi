import { prisma } from '../lib/prisma'
import { generateRegistrationNo } from '@shared/constants/malawi'
import type { CreateStudentInput, UpdateStudentInput } from '@shared/schemas/student'
import type { Prisma } from '@prisma/client'
import { algoliasearch } from 'algoliasearch' // v5 named import

// Algolia v5: client.saveObjects() — no more initIndex()
const algolia = algoliasearch(process.env.ALGOLIA_APP_ID ?? '', process.env.ALGOLIA_ADMIN_KEY ?? '')

async function syncToAlgolia(student: {
  id: string
  firstName: string
  lastName: string
  registrationNo: string
  classId?: string | null
  status: string
}) {
  if (!process.env.ALGOLIA_APP_ID) return // skip if not configured
  await algolia.saveObjects({
    indexName: 'students',
    objects: [
      {
        objectID: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        registrationNo: student.registrationNo,
        classId: student.classId ?? '',
        status: student.status,
      },
    ],
  })
}

export async function listStudents(filters: {
  classId?: string
  status?: string
  search?: string
  page?: number
  limit?: number
}) {
  const { classId, status, page = 1, limit = 50 } = filters
  const where: Prisma.StudentWhereInput = {}
  if (classId) where.classId = classId
  if (status)
    where.status = status as 'ACTIVE' | 'ARCHIVED' | 'AWAITING_MANEB_RESULTS' | 'GRADUATED'

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

export async function getStudent(id: string) {
  return prisma.student.findUniqueOrThrow({
    where: { id },
    include: { class: true },
  })
}

export async function createStudent(data: CreateStudentInput, actorUid: string, actorRole: string) {
  const year = new Date().getFullYear()
  const count = await prisma.student.count()
  const regNo = generateRegistrationNo(year, count + 1)

  const student = await prisma.student.create({
    data: { ...data, registrationNo: regNo, dateOfBirth: new Date(data.dateOfBirth) },
  })

  await syncToAlgolia(student).catch((e) => console.error('Algolia sync failed:', e))
  await writeAuditLog('student.create', 'Student', student.id, actorUid, actorRole)
  return student
}

export async function updateStudent(
  id: string,
  data: UpdateStudentInput & { photoKey?: string },
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

export async function archiveStudent(id: string, actorUid: string, actorRole: string) {
  const archived = await prisma.student.update({ where: { id }, data: { status: 'ARCHIVED' } })
  await writeAuditLog('student.archive', 'Student', id, actorUid, actorRole)
  return archived
}

async function writeAuditLog(
  action: string,
  entityType: string,
  entityId: string,
  actorUid: string,
  actorRole: string,
  metadata?: object
) {
  await prisma.auditLog
    .create({
      data: { action, entityType, entityId, actorUid, actorRole, metadata },
    })
    .catch(() => {}) // never block main operation for audit
}
