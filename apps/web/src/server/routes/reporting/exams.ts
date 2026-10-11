/**
 * routes/reporting/exams.ts — examination workflow reporting (mounted at /reporting/exams).
 *
 * Gated on exam.viewSchoolAnalytics (school-wide: exam_officer, high_rank, admin)
 * OR exam.viewClassAnalytics. A caller who lacks the school-wide permission is
 * scoped server-side to the (class, subject) pairs they are assigned to — the
 * client cannot widen it.
 */
import type { Request } from 'express'
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requireAnyPermission } from '@/server/middleware/verifyPermission'
import { hasPermission } from '@shared/types/permissions'
import * as exams from '@/server/services/analytics/examAnalytics'
import { resolvePeriod } from './_shared'

export const examsReportingRouter = Router()

const gate = [verifyAuth, requireAnyPermission(['exam.viewSchoolAnalytics', 'exam.viewClassAnalytics'])] as const

function scopeOf(req: Request): exams.ExamScope {
  const user = req.user!
  return hasPermission(user.role, 'exam.viewSchoolAnalytics', user.superUser === true)
    ? { kind: 'school' }
    : { kind: 'teacher', teacherUid: user.uid }
}

examsReportingRouter.get('/overview', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await exams.getExamOverview(academicYear, term, scopeOf(req)))
})

examsReportingRouter.get('/attention', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await exams.getExamAttention(academicYear, term, scopeOf(req)))
})

examsReportingRouter.get('/mark-completion', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await exams.getMarkCompletion(academicYear, term, scopeOf(req)))
})

examsReportingRouter.get('/pipeline', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await exams.getExamPipeline(academicYear, term, scopeOf(req)))
})
