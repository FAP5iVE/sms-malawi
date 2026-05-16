'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const _listApplications = listApplications
export { _listApplications as listApplications }
const _createApplication = createApplication
export { _createApplication as createApplication }
const _updateApplicationStatus = updateApplicationStatus
export { _updateApplicationStatus as updateApplicationStatus }
const _convertToStudent = convertToStudent
export { _convertToStudent as convertToStudent }
import { prisma } from '../lib/prisma'
import { createStudent } from './studentService'
async function listApplications(status) {
  return prisma.application.findMany({
    where: status ? { status: status } : undefined,
    orderBy: { createdAt: 'desc' },
  })
}
async function createApplication(data) {
  return prisma.application.create({
    data: { ...data, dateOfBirth: new Date(data.dateOfBirth) },
  })
}
async function updateApplicationStatus(id, status, actorUid, notes) {
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
async function convertToStudent(applicationId, classId, actorUid, actorRole) {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
  })
  if (app.status !== 'AWAITING_ADMISSION' && app.status !== 'APPROVED') {
    throw new Error('Application must be APPROVED or AWAITING_ADMISSION to convert')
  }
  const student = await (0, createStudent)(
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
