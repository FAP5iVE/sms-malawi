import { Router } from 'express'
import { verifyAuth, requireRole } from '../middleware/auth'
import { CreateStudentSchema, UpdateStudentSchema } from '@shared/schemas/student'
import * as studentService from '../services/studentService'

export const studentsRouter = Router()

// GET /students — list with filters
studentsRouter.get(
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
  ]),
  async (req, res) => {
    const { classId, status, page, limit } = req.query
    const result = await studentService.listStudents({
      classId: classId as string | undefined,
      status: status as string | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
    res.json(result)
  }
)

// GET /students/:id — single student
studentsRouter.get(
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
  ]),
  async (req, res) => {
    const student = await studentService.getStudent(req.params.id)
    res.json(student)
  }
)

// POST /students — create
studentsRouter.post(
  '/',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const parsed = CreateStudentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten() })
    }
    const student = await studentService.createStudent(parsed.data, req.user!.uid, req.user!.role)
    res.status(201).json(student)
  }
)

// PATCH /students/:id — update
studentsRouter.patch(
  '/:id',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const parsed = UpdateStudentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ errors: parsed.error.flatten() })
    }
    const updated = await studentService.updateStudent(
      req.params.id,
      parsed.data,
      req.user!.uid,
      req.user!.role
    )
    res.json(updated)
  }
)

// DELETE /students/:id — archive only (never true delete)
studentsRouter.delete(
  '/:id',
  verifyAuth,
  requireRole(['admin', 'high_rank']), // lower_rank must go through approval workflow
  async (req, res) => {
    const result = await studentService.archiveStudent(req.params.id, req.user!.uid, req.user!.role)
    res.json({ archived: true, student: result })
  }
)
