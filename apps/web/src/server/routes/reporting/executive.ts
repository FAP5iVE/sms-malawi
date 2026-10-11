/**
 * routes/reporting/executive.ts — school-wide management view (mounted at /reporting/executive).
 *
 * Gated on report.viewSchoolPerformance AND report.viewFinanceSummary, which
 * together identify the high_rank role in the existing matrix without adding a
 * new permission. Inside, each domain is included only if the caller also
 * holds that domain's own report permission, so this endpoint can never show
 * more than the domain endpoints would.
 */
import type { Request } from 'express'
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requireAllPermissions } from '@/server/middleware/verifyPermission'
import { hasPermission, type Permission } from '@shared/types/permissions'
import * as executive from '@/server/services/analytics/executiveAnalytics'
import { resolvePeriod } from './_shared'

export const executiveReportingRouter = Router()

const gate = [verifyAuth, requireAllPermissions(['report.viewSchoolPerformance', 'report.viewFinanceSummary'])] as const

function accessOf(req: Request): executive.ExecutiveAccess {
  const user = req.user!
  const su = user.superUser === true
  const can = (p: Permission) => hasPermission(user.role, p, su)
  return {
    finance: can('report.viewFinanceSummary'),
    hr: can('report.viewHRReports'),
    library: can('report.viewLibraryUsage'),
    admissions: can('report.viewAdmissionTrends') && can('report.viewStudentRegistration'),
    attendance: can('report.viewAttendanceSummary'),
    exams: can('exam.viewSchoolAnalytics'),
    operations: can('procurement.reviewRequisition'),
  }
}

executiveReportingRouter.get('/overview', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await executive.getExecutiveOverview(academicYear, term, accessOf(req)))
})

executiveReportingRouter.get('/attention', ...gate, async (req, res) => {
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await executive.getExecutiveAttention(academicYear, term, accessOf(req)))
})
