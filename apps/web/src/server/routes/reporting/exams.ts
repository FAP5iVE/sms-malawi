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
import { requireAnyPermission, requirePermission } from '@/server/middleware/verifyPermission'
import { hasPermission } from '@shared/types/permissions'
import * as exams from '@/server/services/analytics/examAnalytics'
import { SETTING_KEYS } from '@shared/types/settings'
import * as settingsService from '@/server/services/settingsService'
import { resolvePeriod, optionalEnum, optionalString } from './_shared'

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

const STAGES = ['SCHEDULED', 'IN_PROGRESS', 'MARKS_PENDING', 'MARKS_DRAFT', 'MARKS_FINAL', 'RESULTS_APPROVED', 'RESULTS_RELEASED'] as const

/**
 * Workflow tracking: where every exam is, who has to act, how long it has been
 * there. Teachers are scoped server-side to their own (class, subject) pairs; the
 * audit trail is only returned to holders of exam.viewExamAuditLog.
 */
examsReportingRouter.get('/workflow', ...gate, async (req, res) => {
  const status = optionalEnum(req.query.status, STAGES)
  if (status === null) return res.status(400).json({ error: 'Unknown exam status.' })
  const { academicYear, term } = await resolvePeriod(req)
  const user = req.user!
  const classId = optionalString(req.query.classId)
  const subject = optionalString(req.query.subject)
  const teacherUid = optionalString(req.query.teacherUid)
  res.json(await exams.getExamWorkflow(
    academicYear,
    term,
    scopeOf(req),
    {
      ...(classId ? { classId } : {}),
      ...(subject ? { subject } : {}),
      ...(teacherUid ? { teacherUid } : {}),
      ...(status ? { status } : {}),
    },
    { audit: hasPermission(user.role, 'exam.viewExamAuditLog', user.superUser === true) },
  ))
})

/** MANEB registration and results status — external national-exam records, never school-entered marks. */
examsReportingRouter.get('/maneb-status', verifyAuth, requirePermission('report.viewSchoolPerformance'), async (req, res) => {
  const { academicYear } = await resolvePeriod(req)
  const current = await settingsService.get(SETTING_KEYS.CURRENT_ACADEMIC_YEAR)
  res.json(await exams.getManebStatus(academicYear, { isCurrentYear: academicYear === current }))
})
