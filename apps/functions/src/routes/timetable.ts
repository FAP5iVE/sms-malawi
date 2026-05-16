import { Router } from 'express'
import { verifyAuth, requireRole } from '../middleware/auth'
import { prisma } from '../lib/prisma'

export const timetableRouter = Router()

// GET /timetable?academicYear=2025/2026&term=1&day=MONDAY
timetableRouter.get(
  '/',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student']),
  async (req, res) => {
    const { academicYear = '2025/2026', term = '1', day } = req.query
    const where: any = { academicYear, term: Number(term) }
    if (day) where.day = day

    const slots = await prisma.timetableSlot.findMany({
      where,
      include: { class: { select: { name: true, form: true, stream: true } } },
      orderBy: [{ day: 'asc' }, { periodStart: 'asc' }],
    })
    res.json(slots)
  }
)
