// apps/web/src/server/services/classService.ts
// Fixed: createTimetableSlot parameter 'room' typed as string | undefined explicitly
// This satisfies exactOptionalPropertyTypes — Zod outputs string|undefined for optional fields
import { prisma } from '@/lib/prisma'
import type { CreateClassInput } from '@shared/schemas/student'
import { Prisma, Weekday, TimetableType } from '@prisma/client'

export async function listClasses(academicYear?: string) {
  return prisma.class.findMany({
    ...(academicYear ? { where: { academicYear } } : {}),
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
  return prisma.class.create({
    data: {
      name: data.name,
      form: data.form,
      academicYear: data.academicYear,
      stream: data.stream ?? null,
      teacherId: data.teacherId ?? null,
      room: data.room ?? null,
    },
  })
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
  room?: string | undefined   // FIXED: explicit string | undefined satisfies exactOptionalPropertyTypes
  type: string
  academicYear: string
  term: number
}) {
  const weekday = data.day as Weekday
  const slotType = data.type as TimetableType

  if (data.room) {
    const where: Prisma.TimetableSlotWhereInput = {
      room: data.room,
      day: weekday,
      academicYear: data.academicYear,
      term: data.term,
      OR: [
        { periodStart: { gte: data.periodStart, lt: data.periodEnd } },
        { periodEnd: { gt: data.periodStart, lte: data.periodEnd } },
      ],
    }
    const conflict = await prisma.timetableSlot.findFirst({ where })
    if (conflict) throw new Error(`Room ${data.room} already booked at this time`)
  }

  return prisma.timetableSlot.create({
    data: {
      classId: data.classId,
      day: weekday,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      subject: data.subject,
      teacherUid: data.teacherUid,
      room: data.room ?? null,
      type: slotType,
      academicYear: data.academicYear,
      term: data.term,
    },
  })
}