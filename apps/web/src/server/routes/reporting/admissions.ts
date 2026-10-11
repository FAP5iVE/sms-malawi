/**
 * routes/reporting/admissions.ts — admissions pipeline and student-registry
 * reporting (mounted at /reporting/admissions).
 *
 * Gated on report.viewAdmissionTrends (pipeline) and
 * report.viewStudentRegistration (enrollment); the overview needs both since
 * it spans the two. The attendance KPI is only included when the caller also
 * holds report.viewAttendanceSummary.
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requireAllPermissions, requirePermission } from '@/server/middleware/verifyPermission'
import { hasPermission } from '@shared/types/permissions'
import * as admissions from '@/server/services/analytics/admissionsAnalytics'
import * as attendance from '@/server/services/analytics/attendanceAnalytics'
import { positiveInt, resolvePeriod } from './_shared'

export const admissionsReportingRouter = Router()

const both = [verifyAuth, requireAllPermissions(['report.viewAdmissionTrends', 'report.viewStudentRegistration'])] as const

admissionsReportingRouter.get('/overview', ...both, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  const user = req.user!
  let lowAttendanceClasses: number | null | undefined
  if (hasPermission(user.role, 'report.viewAttendanceSummary', user.superUser === true)) {
    const r = await attendance.getAttendanceReport(academicYear, term, { kind: 'school' })
    lowAttendanceClasses = r.byClass.filter((c) => c.attendanceRate !== null && c.attendanceRate < 85).length
  }
  res.json(await admissions.getAdmissionsOverview(academicYear, { lowAttendanceClasses }))
})

admissionsReportingRouter.get('/attention', ...both, async (_req, res) => {
  res.json(await admissions.getAdmissionsAttention())
})

admissionsReportingRouter.get(
  '/pipeline',
  verifyAuth,
  requirePermission('report.viewAdmissionTrends'),
  async (req, res) => {
    res.json(await admissions.getAdmissionsPipeline(Math.min(positiveInt(req.query.months, 12), 36)))
  },
)

admissionsReportingRouter.get(
  '/enrollment',
  verifyAuth,
  requirePermission('report.viewStudentRegistration'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await admissions.getEnrollment(academicYear))
  },
)
