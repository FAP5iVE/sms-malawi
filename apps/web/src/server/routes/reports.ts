import { Router } from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import * as reportService from '@/server/services/reportService'

export const reportsRouter = Router()

// GET /reports/admin
reportsRouter.get('/admin', verifyAuth, requireRole(['admin']),
  async (_req, res) => res.json(await reportService.getAdminSystemReport()))

// GET /reports/school?academicYear=2025/2026&term=1
reportsRouter.get('/school', verifyAuth, requireRole(['admin','high_rank']),
  async (req, res) => {
    const { academicYear = '2025/2026', term = '1' } = req.query as Record<string, string>
    return res.json(await reportService.getSchoolPerformanceReport(academicYear, Number(term)))
  })

// GET /reports/finance?academicYear=2025/2026&term=1
reportsRouter.get('/finance', verifyAuth, requireRole(['admin','high_rank','finance']),
  async (req, res) => {
    const { academicYear = '2025/2026', term } = req.query as Record<string, string>
    return res.json(await reportService.getFeeCollectionReport(academicYear, term ? Number(term) : undefined))
  })

// GET /reports/library
reportsRouter.get('/library', verifyAuth, requireRole(['admin','high_rank','library']),
  async (_req, res) => res.json(await reportService.getLibraryReport()))

// GET /reports/hr
reportsRouter.get('/hr', verifyAuth, requireRole(['admin','hr','high_rank']),
  async (_req, res) => res.json(await reportService.getHRReport()))

// GET /reports/academic?academicYear=2025/2026
reportsRouter.get('/academic', verifyAuth, requireRole(['admin','high_rank','academic']),
  async (req, res) => {
    const { academicYear = '2025/2026' } = req.query as Record<string, string>
    return res.json(await reportService.getAcademicReport(req.user!.uid, academicYear))
  })

// GET /reports/exam-officer?academicYear=2025/2026&term=1
reportsRouter.get('/exam-officer', verifyAuth, requireRole(['admin','exam_officer']),
  async (req, res) => {
    const { academicYear = '2025/2026', term = '1' } = req.query as Record<string, string>
    return res.json(await reportService.getExamOfficerReport(academicYear, Number(term)))
  })

// GET /reports/student — student sees only their own data
reportsRouter.get('/student', verifyAuth, requireRole(['admin','high_rank','student']),
  async (req, res) => {
    const studentId = req.user!.role === 'student'
      ? (req.query.studentId as string ?? req.user!.uid)
      : req.query.studentId as string
    if (!studentId) return res.status(400).json({ error: 'studentId required' })
    return res.json(await reportService.getStudentReport(studentId))
  })

// GET /reports/audit
reportsRouter.get('/audit', verifyAuth, requireRole(['admin']),
  async (req, res) => {
    const { entityType, actorUid, action, from, to, page, limit } = req.query as Record<string, string>
    return res.json(await reportService.getAuditLogs({
      entityType, actorUid, action, from, to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    }))
  })