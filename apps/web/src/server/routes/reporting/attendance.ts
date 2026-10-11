/**
 * routes/reporting/attendance.ts — attendance reporting (mounted at /reporting/attendance).
 *
 * Gated on report.viewAttendanceSummary (school-wide) OR class.markAttendance
 * (teachers). A caller without the school-wide permission is scoped
 * server-side to their own classes — the client cannot widen it.
 */
import type { Request } from 'express'
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requireAnyPermission } from '@/server/middleware/verifyPermission'
import { hasPermission } from '@shared/types/permissions'
import * as attendance from '@/server/services/analytics/attendanceAnalytics'
import { resolvePeriod } from './_shared'

export const attendanceReportingRouter = Router()

const gate = [verifyAuth, requireAnyPermission(['report.viewAttendanceSummary', 'class.markAttendance'])] as const

function scopeOf(req: Request): attendance.AttendanceScope {
  const user = req.user!
  return hasPermission(user.role, 'report.viewAttendanceSummary', user.superUser === true)
    ? { kind: 'school' }
    : { kind: 'teacher', teacherUid: user.uid }
}

attendanceReportingRouter.get('/overview', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await attendance.getAttendanceOverview(academicYear, term, scopeOf(req)))
})

attendanceReportingRouter.get('/attention', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await attendance.getAttendanceAttention(academicYear, term, scopeOf(req)))
})

attendanceReportingRouter.get('/report', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await attendance.getAttendanceReport(academicYear, term, scopeOf(req)))
})
