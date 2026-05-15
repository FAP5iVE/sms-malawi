Copy
import { prisma } from '../lib/prisma'
import type { CreateClassInput } from '@shared/schemas/student'

export async function listClasses(academicYear?: string) {
  return prisma.class.findMany({
    where: academicYear ? { academicYear } : undefined,
    orderBy: [{ form: 'asc' }, { stream: 'asc' }],
    include: { _count: { select: { students: true } } },
  })
}

export async function getClass(id: string) {
  return prisma.class.findUniqueOrThrow({
    where: { id },
    include: {
      students: { where: { status: 'ACTIVE' }, orderBy: { lastName: 'asc' } },
      timetable: { orderBy: [{ day: 'asc' }, { periodStart: 'asc' }] },
      assignments: { orderBy: { dueDate: 'asc' } },
    },
  })
}

export async function createClass(data: CreateClassInput) {
  return prisma.class.create({ data })
}

export async function getTimetableForClass(classId: string, term: number, academicYear: string) {
  return prisma.timetableSlot.findMany({
    where: { classId, term, academicYear },
    orderBy: [{ day: 'asc' }, { periodStart: 'asc' }],
  })
}

export async function createTimetableSlot(data: {
  classId: string
  day: string
  periodStart: string
  periodEnd: string
  subject: string
  teacherUid: string
  room?: string
  type: string
  academicYear: string
  term: number
}) {
  // Check for time conflicts in the same room on the same day
  if (data.room) {
    const conflict = await prisma.timetableSlot.findFirst({
      where: {
        room: data.room,
        day: data.day as any,
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

  return prisma.timetableSlot.create({ data: data as any })
}
