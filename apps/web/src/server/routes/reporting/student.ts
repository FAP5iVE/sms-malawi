/**
 * routes/reporting/student.ts — a student's own reports (mounted at /reporting/student).
 *
 * Self-scoped by construction: the Student record is resolved from the
 * authenticated Firebase uid and NO endpoint accepts a student id, so a caller
 * can only ever read the record linked to their own account (a caller with no
 * linked student record gets 404). Academic figures pass through the fee gate
 * inside studentAnalytics; fee, attendance, assignment and library figures are
 * the student's own and are not gated, as on the existing screens.
 */
import type { Request, Response } from 'express'
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import { resolveStudentFromUid } from '@/server/services/studentService'
import * as student from '@/server/services/analytics/studentAnalytics'
import { resolvePeriod } from './_shared'

export const studentReportingRouter = Router()

async function ownStudentId(req: Request, res: Response): Promise<string | null> {
  const record = await resolveStudentFromUid(req.user!.uid)
  if (!record) {
    res.status(404).json({ error: 'No student record is linked to this account.' })
    return null
  }
  return record.id
}

const performance = [verifyAuth, requirePermission('report.viewOwnPerformance')] as const
const attendance = [verifyAuth, requirePermission('report.viewOwnAttendance')] as const
const fees = [verifyAuth, requirePermission('report.viewOwnFeeStatement')] as const

studentReportingRouter.get('/overview', ...performance, async (req, res) => {
  const id = await ownStudentId(req, res)
  if (!id) return
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await student.getStudentOverview(id, academicYear, term))
})

studentReportingRouter.get('/attention', ...performance, async (req, res) => {
  const id = await ownStudentId(req, res)
  if (!id) return
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await student.getStudentAttention(id, academicYear, term))
})

studentReportingRouter.get('/progress', ...performance, async (req, res) => {
  const id = await ownStudentId(req, res)
  if (!id) return
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await student.getStudentProgress(id, academicYear, term))
})

studentReportingRouter.get('/assignments', ...performance, async (req, res) => {
  const id = await ownStudentId(req, res)
  if (!id) return
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await student.getStudentAssignments(id, academicYear, term))
})

studentReportingRouter.get('/library', ...performance, async (req, res) => {
  const id = await ownStudentId(req, res)
  if (!id) return
  const { academicYear } = await resolvePeriod(req)
  res.json(await student.getStudentLibrary(id, academicYear))
})

studentReportingRouter.get('/attendance', ...attendance, async (req, res) => {
  const id = await ownStudentId(req, res)
  if (!id) return
  const { academicYear, term } = await resolvePeriod(req)
  res.json(await student.getStudentAttendance(id, academicYear, term))
})

studentReportingRouter.get('/fees', ...fees, async (req, res) => {
  const id = await ownStudentId(req, res)
  if (!id) return
  const { academicYear } = await resolvePeriod(req)
  res.json(await student.getStudentFees(id, academicYear))
})
