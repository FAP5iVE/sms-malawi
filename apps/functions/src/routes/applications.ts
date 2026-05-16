import { Router } from 'express'
import { verifyAuth, requireRole } from '../middleware/auth'
import { CreateApplicationSchema } from '@shared/schemas/student'
import * as appService from '../services/applicationService'

export const applicationsRouter = Router()

// GET /applications
applicationsRouter.get(
  '/',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const { status } = req.query
    const apps = await appService.listApplications(status as string | undefined)
    res.json(apps)
  }
)

// POST /applications — public endpoint (application form page)
applicationsRouter.post('/', async (req, res) => {
  const parsed = CreateApplicationSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  const app = await appService.createApplication(parsed.data)
  res.status(201).json(app)
})

// PATCH /applications/:id/status — approve / deny / await admission
applicationsRouter.patch(
  '/:id/status',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const { status, notes } = req.body
    if (!['APPROVED', 'DENIED', 'AWAITING_ADMISSION'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    const id = String(req.params.id)
    const updated = await appService.updateApplicationStatus(id, status, req.user!.uid, notes)
    res.json(updated)
  }
)

// POST /applications/:id/convert — convert approved application to Student record
applicationsRouter.post(
  '/:id/convert',
  verifyAuth,
  requireRole(['admin', 'high_rank']),
  async (req, res) => {
    const { classId } = req.body
    const id = String(req.params.id)
    const student = await appService.convertToStudent(id, classId, req.user!.uid, req.user!.role)
    res.status(201).json(student)
  }
)
