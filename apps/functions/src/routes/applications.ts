import { Router } from 'express'
import { verifyAuth, requireRole } from '../middleware/auth'
import { CreateApplicationSchema, PublicApplicationSchema } from '@shared/schemas/student'
import * as appService from '../services/applicationService'

export const applicationsRouter = Router()

// POST /applications/public — no auth required (from /apply page)
applicationsRouter.post('/public', async (req, res) => {
  const parsed = PublicApplicationSchema.safeParse(req.body)
  if (!parsed.success)
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const app = await appService.createPublicApplication(parsed.data)
    return res.status(201).json({ id: app.id, status: app.status })
  } catch (err) {
    console.error('Public application error:', err)
    return res.status(500).json({ error: 'Failed to submit application. Please try again.' })
  }
})

// GET /applications — authenticated list
applicationsRouter.get(
  '/',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const { status } = req.query
    const apps = await appService.listApplications(status as string | undefined)
    return res.json(apps)
  }
)

// POST /applications — internal (within the system)
applicationsRouter.post(
  '/',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const parsed = CreateApplicationSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const app = await appService.createApplication(parsed.data)
    return res.status(201).json(app)
  }
)

// PATCH /applications/:id/status
applicationsRouter.patch(
  '/:id/status',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const id = String(req.params.id) // ← was missing (caused TS2304)
    const { notes } = req.body as { notes?: string }
    const status = req.body.status as 'APPROVED' | 'DENIED' | 'AWAITING_ADMISSION'
    if (!['APPROVED', 'DENIED', 'AWAITING_ADMISSION'].includes(status))
      return res.status(400).json({ error: 'Invalid status transition' })
    const updated = await appService.updateApplicationStatus(id, status, req.user!.uid, notes)
    return res.json(updated)
  }
)

// POST /applications/:id/convert — approved app → Student
applicationsRouter.post(
  '/:id/convert',
  verifyAuth,
  requireRole(['admin', 'high_rank']),
  async (req, res) => {
    const id = String(req.params.id)
    const { classId } = req.body as { classId?: string }
    const student = await appService.convertToStudent(id, classId, req.user!.uid, req.user!.role)
    return res.status(201).json(student)
  }
)
