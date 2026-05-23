import { prisma } from '../lib/prisma'
import { createStudent } from './studentService'
import type { CreateApplicationInput } from '@shared/schemas/student'
import type { PublicApplicationInput } from '@shared/schemas/student'

export async function listApplications(status?: string) {
  return prisma.application.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: 'desc' },
  })
}

// Public (unauthenticated) application — from the /apply page
export async function createPublicApplication(data: PublicApplicationInput) {
  return prisma.application.create({
    data: {
      firstName: data.firstName,
      lastName: data.surname, // schema uses 'surname'
      dateOfBirth: new Date(data.dateOfBirth),
      sex: data.sex === 'male' ? 'MALE' : 'FEMALE',
      nationality: data.nationality,
      district: data.district ?? '',
      guardianName: data.guardianName,
      guardianPhone: data.guardianPhone,
      guardianRelation: data.guardianRelationship,
      applyingForForm: parseInt(data.classApplying.replace('Form ', '')),
      status: 'PENDING',
    },
  })
}

export async function createApplication(data: CreateApplicationInput) {
  return prisma.application.create({
    data: { ...data, dateOfBirth: new Date(data.dateOfBirth) },
  })
}

export async function updateApplicationStatus(
  id: string,
  status: 'APPROVED' | 'DENIED' | 'AWAITING_ADMISSION',
  actorUid: string,
  notes?: string
) {
  return prisma.application.update({
    where: { id },
    data: {
      status,
      reviewedByUid: actorUid,
      reviewedAt: new Date(),
      notes,
    },
  })
}

// Converts an approved application into a Student record
export async function convertToStudent(
  applicationId: string,
  classId: string | undefined,
  actorUid: string,
  actorRole: string
) {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
  })

  if (app.status !== 'AWAITING_ADMISSION' && app.status !== 'APPROVED') {
    throw new Error('Application must be APPROVED or AWAITING_ADMISSION to convert')
  }

  const student = await createStudent(
    {
      firstName: app.firstName,
      lastName: app.lastName,
      dateOfBirth: app.dateOfBirth.toISOString().slice(0, 10),
      sex: app.sex,
      nationality: app.nationality,
      district: app.district,
      village: app.village ?? undefined,
      guardianName: app.guardianName,
      guardianPhone: app.guardianPhone,
      guardianRelation: app.guardianRelation,
      classId,
    },
    actorUid,
    actorRole
  )

  // Mark application as admitted + link to student record
  await prisma.application.update({
    where: { id: applicationId },
    data: { status: 'ADMITTED', convertedStudentId: student.id },
  })

  return student
}
