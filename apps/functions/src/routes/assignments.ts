import { Router } from 'express'
import { verifyAuth, requireRole } from '../middleware/auth'
import { prisma } from '../lib/prisma'

export const assignmentsRouter = Router({ mergeParams: true })

// GET /classes/:classId/assignments
assignmentsRouter.get('/', verifyAuth, async (req, res) => {
  const { classId } = req.params as { classId: string }
  const assignments = await prisma.assignment.findMany({
    where: { classId },
    include: { submissions: { select: { studentId: true, status: true, submittedAt: true } } },
    orderBy: { dueDate: 'asc' },
  })
  return res.json(assignments)
})

// POST /classes/:classId/assignments
assignmentsRouter.post(
  '/',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'academic']),
  async (req, res) => {
    const { classId } = req.params as { classId: string }
    const { title, description, subject, dueDate } = req.body as Record<string, string>
    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        subject,
        dueDate: new Date(dueDate),
        classId,
        createdByUid: req.user!.uid,
      },
    })
    return res.status(201).json(assignment)
  }
)
