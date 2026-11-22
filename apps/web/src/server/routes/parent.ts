/**
 * [FILE]: apps/web/src/server/routes/parent.ts
 * [PURPOSE]: The guardian (parent) API, mounted at /parent. A deliberately thin adapter over
 *   parentController: every route is verifyAuth + requireRole(['parent']) + a rate limit, and
 *   everything that decides what a guardian may see lives in the controller and the per-request
 *   authorization pipeline (guardianAccess), where it is tested.
 *
 *   A child is addressed by the guardian LINK id, never the student id. Responses are never
 *   cached. The route layer adds no authorization logic of its own, so there is none to forget.
 */
import 'server-only'
import { Router, type Request, type Response } from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { rateLimit } from '@/lib/ratelimit'
import { sendError } from '@/server/lib/sendError'
import { checkBalanceGate } from '@/server/services/feeService'
import * as reportCardService from '@/server/services/reportCardService'
import * as settingsService from '@/server/services/settingsService'
import { getOwnAttendanceSummary } from '@/server/services/analyticsService'
import { prismaGuardianDb } from '@/server/services/guardian/prismaDb'
import { getChildModule, getChildren, getMe, type ChildModule, type HttpResult } from '@/server/services/guardian/parentController'
import type { ParentDeps } from '@/server/services/guardian/parentPortalService'

export const parentRouter = Router()
parentRouter.use(verifyAuth)

const db = () => prismaGuardianDb()
// The school's existing fee gate, applied per term exactly as it is for students.
const deps: ParentDeps = {
  isResultsGateOpen: (studentId, term, academicYear) => checkBalanceGate(studentId, term, academicYear),
  // The same builders the student's own screens use, so a parent sees exactly what the child would.
  getReportCardData: (studentId, term, academicYear) => reportCardService.getReportCardData(studentId, term, academicYear),
  resolvePeriod: (input) => settingsService.resolvePeriod(input),
  // The very function behind the student's own attendance page, so the two can never disagree.
  getTermAttendance: (studentId, academicYear, term) => getOwnAttendanceSummary(studentId, academicYear, term) as unknown as Promise<Record<string, unknown>>,
}

function send(res: Response, r: HttpResult): void {
  res.setHeader('Cache-Control', 'no-store')
  res.status(r.status).json(r.body)
}

parentRouter.get('/me', requireRole(['parent']), rateLimit('parent-read'), async (req, res) => {
  try { send(res, await getMe(db(), req.user!.uid)) }
  catch (err) { sendError(res, err, { tags: { module: 'parent', route: 'me' } }) }
})

parentRouter.get('/children', requireRole(['parent']), rateLimit('parent-read'), async (req, res) => {
  try { send(res, await getChildren(db(), req.user!.uid)) }
  catch (err) { sendError(res, err, { tags: { module: 'parent', route: 'children' } }) }
})

function childRoute(module: ChildModule) {
  return async (req: Request, res: Response) => {
    try { send(res, await getChildModule(db(), deps, { uid: req.user!.uid, linkId: req.params.linkId, module, query: { academicYear: req.query.academicYear, term: req.query.term } })) }
    catch (err) { sendError(res, err, { tags: { module: 'parent', route: `child-${module}` } }) }
  }
}

parentRouter.get('/children/:linkId', requireRole(['parent']), rateLimit('parent-read'), childRoute('profile'))
parentRouter.get('/children/:linkId/results', requireRole(['parent']), rateLimit('parent-read'), childRoute('results'))
parentRouter.get('/children/:linkId/report-card', requireRole(['parent']), rateLimit('parent-read'), childRoute('reportCard'))
parentRouter.get('/children/:linkId/fees', requireRole(['parent']), rateLimit('parent-read'), childRoute('fees'))
parentRouter.get('/children/:linkId/attendance', requireRole(['parent']), rateLimit('parent-read'), childRoute('attendance'))
