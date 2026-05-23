import { Router } from 'express'
import { verifyAuth, requireRole } from '../middleware/auth'
import { CreateStudentSchema, UpdateStudentSchema } from '@shared/schemas/student'
import multer from 'multer'
import { uploadFile, getViewUrl, STORAGE_BUCKETS } from '../lib/storage'
import * as studentService from '../services/studentService'

// multer with memory storage — file stays in RAM, we forward to Appwrite
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

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
    const id = String(req.params.id)
    const student = await studentService.getStudent(id)
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
    const id = String(req.params.id)
    const updated = await studentService.updateStudent(
      id,
      parsed.data,
      req.user!.uid,
      req.user!.role
    )
    res.json(updated)
  }
)

// DELETE /students/:id — archive only (never true delete)
studentsRouter.delete('/:id', verifyAuth, requireRole(['admin', 'high_rank']), async (req, res) => {
  const id = String(req.params.id)
  const result = await studentService.archiveStudent(id, req.user!.uid, req.user!.role)
  res.json({ archived: true, student: result })
})

// POST /students/:id/photo — upload student profile photo
studentsRouter.post(
  '/:id/photo',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank']),
  upload.single('photo'),
  async (req, res) => {
    const id = String(req.params.id)
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    // Upload to Appwrite student_files bucket
    const fileId = await uploadFile(
      STORAGE_BUCKETS.STUDENT_FILES,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    )

    // Save the Appwrite fileId in the student's photoKey column in Neon
    await studentService.updateStudent(id, { photoKey: fileId }, req.user!.uid, req.user!.role)

    return res.json({ fileId })
  }
)

// GET /students/:id/photo — get a signed view URL for the student's photo
studentsRouter.get(
  '/:id/photo',
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
    const id = String(req.params.id)
    const student = await studentService.getStudent(id)
    if (!student.photoKey) return res.status(404).json({ error: 'No photo uploaded' })

    const url = await getViewUrl(STORAGE_BUCKETS.STUDENT_FILES, student.photoKey)
    return res.json({ url })
  }
)
