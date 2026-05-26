import { Router } from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { prisma } from '@/lib/prisma'
import { type Prisma, Weekday, TimetableType } from '@prisma/client'

export const timetableRouter = Router()

// GET /timetable?academicYear=2025/2026&term=1&day=MONDAY
timetableRouter.get(
  '/',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student']),
  async (req, res) => {
    const { academicYear = '2025/2026', term = '1', day } = req.query
    const where: Prisma.TimetableSlotWhereInput = {
      academicYear: String(academicYear),
      term: Number(term),
    }
    // day must be cast to Weekday — Prisma rejects plain string for enum filter
    if (day) where.day = String(day) as Weekday

    const slots = await prisma.timetableSlot.findMany({
      where,
      include: { class: { select: { name: true, form: true, stream: true } } },
      orderBy: [{ day: 'asc' }, { periodStart: 'asc' }],
    })
    res.json(slots)
  }
)

// POST /timetable — create slot (admin/high_rank/exam_officer)
timetableRouter.post(
  '/',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'exam_officer']),
  async (req, res) => {
    const { classId, day, periodStart, periodEnd, subject, teacherUid, room, type, academicYear, term } =
      req.body as Record<string, string | number | undefined>
    if (!classId || !day || !periodStart || !periodEnd || !subject || !teacherUid || !type || !academicYear || !term) {
      return res.status(400).json({ error: 'Missing required timetable fields' })
    }
    // Validate enum values at runtime before passing to Prisma
    if (!Object.values(Weekday).includes(String(day) as Weekday)) {
      return res.status(400).json({ error: `day must be one of: ${Object.values(Weekday).join(', ')}` })
    }
    if (!Object.values(TimetableType).includes(String(type) as TimetableType)) {
      return res.status(400).json({ error: `type must be one of: ${Object.values(TimetableType).join(', ')}` })
    }
    const slot = await prisma.timetableSlot.create({
      data: {
        classId: String(classId),
        day: String(day) as Weekday,           // cast to Prisma Weekday enum
        periodStart: String(periodStart),
        periodEnd: String(periodEnd),
        subject: String(subject),
        teacherUid: String(teacherUid),
        room: room ? String(room) : null,
        type: String(type) as TimetableType,   // cast to Prisma TimetableType enum
        academicYear: String(academicYear),
        term: Number(term),
      },
    })
    res.status(201).json(slot)
  }
)