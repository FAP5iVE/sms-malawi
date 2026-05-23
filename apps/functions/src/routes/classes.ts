import { Router } from 'express'
import { verifyAuth, requireRole } from '../middleware/auth'
import { CreateClassSchema, CreateTimetableSlotSchema } from '@shared/schemas/student'
import * as classService from '../services/classService'
import { assignmentsRouter } from './assignments'

export const classesRouter = Router()

// GET /classes
classesRouter.get(
  '/',
  verifyAuth,
  requireRole([
    'admin',
    'high_rank',
    'finance',
    'library',
    'lower_rank',
    'academic',
    'hr',
    'exam_officer',
    'student',
  ]),
  async (req, res) => {
    const { academicYear } = req.query
    const classes = await classService.listClasses(academicYear as string | undefined)
    res.json(classes)
  }
)

// GET /classes/:id
classesRouter.get(
  '/:id',
  verifyAuth,
  requireRole([
    'admin',
    'high_rank',
    'finance',
    'library',
    'lower_rank',
    'academic',
    'hr',
    'exam_officer',
    'student',
  ]),
  async (req, res) => {
    const id = String(req.params.id)
    const cls = await classService.getClass(id)
    res.json(cls)
  }
)

// POST /classes
classesRouter.post('/', verifyAuth, requireRole(['admin', 'high_rank']), async (req, res) => {
  const parsed = CreateClassSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  const cls = await classService.createClass(parsed.data)
  res.status(201).json(cls)
})

// GET /classes/:id/timetable
classesRouter.get(
  '/:id/timetable',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student']),
  async (req, res) => {
    const id = String(req.params.id)
    const { term = '1', academicYear = '2025/2026' } = req.query
    const slots = await classService.getTimetableForClass(id, Number(term), academicYear as string)
    res.json(slots)
  }
)

// POST /classes/:id/timetable — admin/high_rank only, lower_rank goes via approval
classesRouter.post(
  '/:id/timetable',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'exam_officer']),
  async (req, res) => {
    const id = String(req.params.id)
    const parsed = CreateTimetableSlotSchema.safeParse({
      ...req.body,
      classId: id,
    })
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const slot = await classService.createTimetableSlot(parsed.data as any)
    res.status(201).json(slot)
  }
)

classesRouter.use('/:classId/assignments', assignmentsRouter)
