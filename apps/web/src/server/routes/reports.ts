/**
 * apps/web/src/server/routes/reports.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [R-PHASE]: R14 — Analytics & Reports Domain
 * [PURPOSE]: The same authorization-correctness sweep analytics.ts receives
 *   in this phase, applied to its nine sibling routes. Every route gated on a
 *   hand-maintained requireRole([...]) allowlist that had drifted from
 *   PERMISSIONS_MAP.md, in BOTH directions:
 *
 *   - Over-grant (6 of 9 routes): 'admin' was allowed on /school, /finance,
 *     /library, /hr, /academic, /exam-officer and /student, none of which it
 *     holds a report permission for — admin's report permissions are
 *     system-level only (viewSystemHealth / viewAuditLogs /
 *     viewLoginAttempts / viewDatabaseMetrics / viewBackupStatus).
 *
 *   - Under-grant (the reverse-direction violation, unique to this file):
 *     GET /audit excluded 'high_rank' despite the matrix granting
 *     report.viewAuditLogs to both admin AND high_rank; GET /exam-officer
 *     excluded 'high_rank' though every comparable sibling route includes it.
 *
 *   Each route now names the one permission that actually governs it, so the
 *   allowlist cannot drift from the matrix again — the matrix IS the
 *   allowlist. /student additionally branches on
 *   report.viewAnyStudentPerformance (S/types/permissions.ts, R14) exactly as
 *   analytics.ts's /student/* routes do: a student may only ever read their
 *   own record, and a staff caller must hold the new oversight permission and
 *   name the student explicitly.
 *
 *   Hardcoded '2025/2026' / term '1' query defaults are replaced by a
 *   settingsService lookup of SETTING_KEYS.CURRENT_ACADEMIC_YEAR /
 *   CURRENT_TERM.
 * [DEPENDS ON]: S/types/permissions.ts (report.viewAnyStudentPerformance),
 *   W/server/services/reportService.ts, W/server/services/settingsService.ts
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import {
  requirePermission,
  requireAnyPermission,
} from '@/server/middleware/verifyPermission'
import { SETTING_KEYS } from '@shared/types/settings'
import * as reportService from '@/server/services/reportService'
import * as settingsService from '@/server/services/settingsService'

export const reportsRouter = Router()

// ─── SHARED QUERY-PARAM RESOLUTION ───────────────────────────────────────────

/** The academicYear/term this request is about — defaulting to whatever
 *  SystemSettings says the CURRENT period is, never a hardcoded literal. */
async function resolvePeriod(req: Request): Promise<{ academicYear: string; term: number }> {
  const settings = await settingsService.getMany([
    SETTING_KEYS.CURRENT_ACADEMIC_YEAR,
    SETTING_KEYS.CURRENT_TERM,
  ])

  const queryYear = typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined
  const queryTerm = typeof req.query.term === 'string' ? Number(req.query.term) : undefined

  return {
    academicYear: queryYear ?? settings[SETTING_KEYS.CURRENT_ACADEMIC_YEAR],
    term:
      queryTerm !== undefined && Number.isInteger(queryTerm) && queryTerm >= 1 && queryTerm <= 3
        ? queryTerm
        : settings[SETTING_KEYS.CURRENT_TERM],
  }
}

/** Optional term filter — omitting `term` means "all terms", not "current". */
function optionalTerm(req: Request): number | undefined {
  const raw = req.query.term
  if (typeof raw !== 'string') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 3 ? n : undefined
}

/** A `student` caller reads only their own record — their studentId query
 *  param is ignored outright, not defaulted from. Any other caller holds
 *  report.viewAnyStudentPerformance (enforced by middleware) and must name the
 *  student explicitly. Sends its own response and returns null when
 *  unresolvable. */
function resolveStudentId(req: Request, res: Response): string | null {
  if (req.user!.role === 'student') return req.user!.uid

  const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined
  if (!studentId) {
    res.status(400).json({ error: 'studentId required.' })
    return null
  }
  return studentId
}

const OWN_PERFORMANCE = ['report.viewOwnPerformance', 'report.viewAnyStudentPerformance'] as const

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// GET /reports/admin — system-level counts. admin only, correctly.
reportsRouter.get('/admin',
  verifyAuth, requirePermission('report.viewSystemHealth'),
  async (_req, res) => {
    res.json(await reportService.getAdminSystemReport())
  })

// GET /reports/school — high_rank + exam_officer (was: admin + high_rank).
reportsRouter.get('/school',
  verifyAuth, requirePermission('report.viewSchoolPerformance'),
  async (req, res) => {
    const { academicYear, term } = await resolvePeriod(req)
    res.json(await reportService.getSchoolPerformanceReport(academicYear, term))
  })

// GET /reports/finance — high_rank + finance (was: admin + high_rank + finance).
reportsRouter.get('/finance',
  verifyAuth, requirePermission('report.viewFeeCollection'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await reportService.getFeeCollectionReport(academicYear, optionalTerm(req)))
  })

// GET /reports/library — high_rank + library (was: admin + high_rank + library).
reportsRouter.get('/library',
  verifyAuth, requirePermission('report.viewLibraryUsage'),
  async (_req, res) => {
    res.json(await reportService.getLibraryReport())
  })

// GET /reports/hr — high_rank + hr (was: admin + hr + high_rank).
reportsRouter.get('/hr',
  verifyAuth, requirePermission('report.viewHRReports'),
  async (_req, res) => {
    res.json(await reportService.getHRReport())
  })

// GET /reports/academic — academic + high_rank + exam_officer
// (was: admin + high_rank + academic). Scoped to the CALLER's own classes by
// req.user.uid — reportService.getAcademicReport() now honours that scope,
// which it previously ignored entirely (R14, same phase).
reportsRouter.get('/academic',
  verifyAuth, requirePermission('report.viewClassPerformance'),
  async (req, res) => {
    const { academicYear } = await resolvePeriod(req)
    res.json(await reportService.getAcademicReport(req.user!.uid, academicYear))
  })

// GET /reports/exam-officer — exam_officer + high_rank (was: admin +
// exam_officer; high_rank was the one role excluded here despite being
// included on every comparable sibling route).
reportsRouter.get('/exam-officer',
  verifyAuth, requirePermission('report.viewSchoolPerformance'),
  async (req, res) => {
    const { academicYear, term } = await resolvePeriod(req)
    res.json(await reportService.getExamOfficerReport(academicYear, term))
  })

// GET /reports/student — a student reads their own record; a staff caller must
// hold report.viewAnyStudentPerformance and name the student explicitly.
reportsRouter.get('/student',
  verifyAuth, requireAnyPermission(OWN_PERFORMANCE),
  async (req, res) => {
    const studentId = resolveStudentId(req, res)
    if (studentId === null) return
    res.json(await reportService.getStudentReport(studentId))
  })

// GET /reports/audit — admin AND high_rank both hold report.viewAuditLogs;
// high_rank was wrongly excluded.
reportsRouter.get('/audit',
  verifyAuth, requirePermission('report.viewAuditLogs'),
  async (req, res) => {
    const { entityType, actorUid, action, from, to, page, limit } = req.query as Record<string, string | undefined>
    res.json(await reportService.getAuditLogs({
      entityType,
      actorUid,
      action,
      from,
      to,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    }))
  })
