import { Router } from 'express'
import multer from 'multer'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { CreateStaffSchema, LeaveRequestSchema, ReviewLeaveSchema, LoanRequestSchema, PerformanceNoteSchema } from '@shared/schemas/hr'
import * as hrService from '@/server/services/hrService'
import { getViewUrl, STORAGE_BUCKETS } from '@/lib/storage'

export const hrRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

const HR_ADMIN = ['admin', 'hr'] as const
const REVIEWERS = ['admin', 'hr', 'high_rank'] as const

// ── STAFF DIRECTORY (all staff can view) ──
hrRouter.get('/', verifyAuth, requireRole(['admin','hr','high_rank','finance','academic','library','lower_rank','exam_officer']),
  async (req, res) => {
    const { department, status, search } = req.query as Record<string, string>
    const staff = await hrService.listStaff({ department, status, search })
    return res.json(staff)
  })

hrRouter.get('/:id', verifyAuth, requireRole([...REVIEWERS]),
  async (req, res) => {return res.json(await hrService.getStaffProfile(String(req.params.id)))})

hrRouter.post('/', verifyAuth, requireRole([...HR_ADMIN]),
  async (req, res) => {
    const parsed = CreateStaffSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await hrService.createStaff(parsed.data, req.user!.uid))
  })

hrRouter.post('/:id/photo', verifyAuth, requireRole([...HR_ADMIN]), upload.single('photo'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded.' })
    const fileId = await hrService.uploadStaffPhoto(String(req.params.id), req.file.buffer, req.file.originalname)
    const url = await getViewUrl(STORAGE_BUCKETS.STUDENT_FILES, fileId)
    return res.json({ fileId, url })
  })

// ── CONTRACT EXPIRY ALERTS ──
hrRouter.get('/alerts/contracts', verifyAuth, requireRole([...HR_ADMIN]),
  async (req, res) => {
    const days = Number(req.query.days ?? 60)
    return res.json(await hrService.getContractExpiryAlert(days))
  })

// ── LEAVE ──
hrRouter.get('/leave/requests', verifyAuth, requireRole([...REVIEWERS]),
  async (req, res) => {
    const { staffId, status } = req.query as Record<string, string>
    return res.json(await hrService.listLeaveRequests({ staffId, status }))
  })

hrRouter.post('/leave/apply', verifyAuth,
  async (req, res) => {
    const parsed = LeaveRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    // Staff can only apply for themselves
    const staffProfile = await (await import('@/lib/prisma')).prisma.staffProfile.findFirst({
      where: { uid: req.user!.uid }, select: { id: true },
    })
    if (!staffProfile) return res.status(404).json({ error: 'Staff profile not found for this user.' })
    return res.status(201).json(await hrService.applyForLeave(staffProfile.id, parsed.data))
  })

hrRouter.patch('/leave/requests/:id/review', verifyAuth, requireRole([...REVIEWERS]),
  async (req, res) => {
    const parsed = ReviewLeaveSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await hrService.reviewLeave(String(req.params.id), parsed.data, req.user!.uid))
  })

// ── LOANS ──
hrRouter.post('/loans/request', verifyAuth,
  async (req, res) => {
    const parsed = LoanRequestSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const sp = await (await import('@/lib/prisma')).prisma.staffProfile.findFirst({ where: { uid: req.user!.uid }, select: { id: true } })
    if (!sp) return res.status(404).json({ error: 'Staff profile not found.' })
    return res.status(201).json(await hrService.requestLoan(sp.id, parsed.data))
  })

hrRouter.patch('/loans/:id/approve', verifyAuth, requireRole([...HR_ADMIN]),
  async (req, res) => {return res.json(await hrService.approveLoan(String(req.params.id), req.user!.uid))})

hrRouter.patch('/loans/:id/disburse', verifyAuth, requireRole(['admin','finance']),
  async (req, res) => {return res.json(await hrService.disburseLoan(String(req.params.id)))})

hrRouter.patch('/loans/:id/repay', verifyAuth, requireRole(['admin','finance','hr']),
  async (req, res) => {
    const { amount } = req.body as { amount: number }
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required.' })
    return res.json(await hrService.recordLoanRepayment(String(req.params.id), amount))
  })

// ── PERFORMANCE ──
hrRouter.post('/performance', verifyAuth, requireRole([...REVIEWERS]),
  async (req, res) => {
    const parsed = PerformanceNoteSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await hrService.addPerformanceNote(parsed.data, req.user!.uid))
  })