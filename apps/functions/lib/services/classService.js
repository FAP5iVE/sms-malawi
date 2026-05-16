'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const _listClasses = listClasses
export { _listClasses as listClasses }
const _getClass = getClass
export { _getClass as getClass }
const _createClass = createClass
export { _createClass as createClass }
const _getTimetableForClass = getTimetableForClass
export { _getTimetableForClass as getTimetableForClass }
const _createTimetableSlot = createTimetableSlot
export { _createTimetableSlot as createTimetableSlot }
Copy
import { prisma } from '../lib/prisma'
async function listClasses(academicYear) {
  return prisma.class.findMany({
    where: academicYear ? { academicYear } : undefined,
    orderBy: [{ form: 'asc' }, { stream: 'asc' }],
    include: { _count: { select: { students: true } } },
  })
}
async function getClass(id) {
  return prisma.class.findUniqueOrThrow({
    where: { id },
    include: {
      students: { where: { status: 'ACTIVE' }, orderBy: { lastName: 'asc' } },
      timetable: { orderBy: [{ day: 'asc' }, { periodStart: 'asc' }] },
      assignments: { orderBy: { dueDate: 'asc' } },
    },
  })
}
async function createClass(data) {
  return prisma.class.create({ data })
}
async function getTimetableForClass(classId, term, academicYear) {
  return prisma.timetableSlot.findMany({
    where: { classId, term, academicYear },
    orderBy: [{ day: 'asc' }, { periodStart: 'asc' }],
  })
}
async function createTimetableSlot(data) {
  // Check for time conflicts in the same room on the same day
  if (data.room) {
    const conflict = await prisma.timetableSlot.findFirst({
      where: {
        room: data.room,
        day: data.day,
        academicYear: data.academicYear,
        term: data.term,
        OR: [
          { periodStart: { gte: data.periodStart, lt: data.periodEnd } },
          { periodEnd: { gt: data.periodStart, lte: data.periodEnd } },
        ],
      },
    })
    if (conflict) {
      throw new Error(`Room ${data.room} already booked at this time`)
    }
  }
  return prisma.timetableSlot.create({ data: data })
}
