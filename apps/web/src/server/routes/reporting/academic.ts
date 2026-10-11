/**
 * routes/reporting/academic.ts — a teacher's own teaching reports (mounted at /reporting/academic).
 *
 * Gated on report.viewClassPerformance, like the existing /analytics/academic
 * routes. Every endpoint is scoped to the CALLER's classes and subjects by
 * req.user.uid — there is no teacher-id parameter, so it cannot be used to look
 * at another teacher. Student fee information is never part of these payloads.
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as academic from '@/server/services/analytics/academicAnalytics'
import { resolvePeriod } from './_shared'

export const academicReportingRouter = Router()

const gate = [verifyAuth, requirePermission('report.viewClassPerformance')] as const

academicReportingRouter.get('/overview', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await academic.getAcademicOverview(req.user!.uid, academicYear, term))
})

academicReportingRouter.get('/attention', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await academic.getAcademicAttention(req.user!.uid, academicYear, term))
})

academicReportingRouter.get('/teaching', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await academic.getTeachingReport(req.user!.uid, academicYear, term))
})

academicReportingRouter.get('/assignments', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await academic.getAssignmentReport(req.user!.uid, academicYear, term))
})

academicReportingRouter.get('/students', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await academic.getStudentAttention(req.user!.uid, academicYear, term))
})

academicReportingRouter.get('/readiness', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await academic.getExamReadiness(req.user!.uid, academicYear, term))
})
