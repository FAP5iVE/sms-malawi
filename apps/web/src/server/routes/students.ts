/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/server/routes/students.ts
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: PATCH /:id/status: removed the requireRole(['admin',
 *   'high_rank','exam_officer']) check entirely — Phase 10A confirmed the
 *   permission matrix itself is correct (student.edit is scoped to
 *   high_rank/lower_rank); the route's own requireRole list was the
 *   incorrect, over-granting half of the contradiction (it let admin and
 *   exam_officer through despite neither holding student.edit), not the
 *   permission check. requirePermission('student.edit') alone is now
 *   authoritative. The inline VALID_STATUSES array is replaced with a
 *   derivation from StudentStatusSchema.options.
 * [DEPENDS ON]: @shared/schemas/student (StudentStatusSchema)
 */
import 'server-only'

import { Router, type Request, type Response } from 'express'
import { rateLimit } from '@/lib/ratelimit'
import { verifyAuth, requireRole }              from '@/lib/verifyAuth'
import {
  requirePermission,
  requireAnyPermission,
  attachPermissions,
} from '@/server/middleware/verifyPermission'
import * as studentService             from '@/server/services/studentService'
import * as riskService                from '@/server/services/riskService'
import * as classService               from '@/server/services/classService'
import * as pendingActionService       from '@/server/services/pendingActionService'
import { StudentStatusSchema }         from '@shared/schemas/student'
import type { StudentStatus, Sex }     from '@prisma/client'
import type { UserRole }               from '@shared/types/roles'
import { sendError } from '@/server/lib/sendError'
import { createDirectUploadTicket, FILE_PREFIX } from '@/lib/storage'

export const studentsRouter = Router()

studentsRouter.use(verifyAuth)

// ─────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────

/**
 * The global viewing period travels as ?academicYear=&term= — the same params
 * every other period-aware endpoint takes. Missing/invalid values fall back to
 * the school's current period inside riskService.resolveRiskPeriod().
 */
function periodFromQuery(req: Request): { academicYear?: string; term?: number } {
  const year = typeof req.query['academicYear'] === 'string' && /^\d{4}\/\d{4}$/.test(req.query['academicYear'])
    ? req.query['academicYear']
    : undefined
  const t = Number(req.query['term'])
  return { academicYear: year, term: t === 1 || t === 2 || t === 3 ? t : undefined }
}

/** What this caller may see of the risk engine's output (see riskService.riskViewerFor). */
function riskViewerOf(req: Request): riskService.RiskViewer {
  return riskService.riskViewerFor(req.user?.role, req.user?.superUser === true)
}

/**
 * Resolve the authenticated student's database ID from their Firebase UID.
 * Only used when req.user.role === 'student'.
 * Returns null and sends 403 if no student record is linked.
 */
async function resolveStudentId(
  req: Request,
  res: Response
): Promise<string | null> {
  const student = await studentService.resolveStudentFromUid(req.user!.uid)
  if (!student) {
    res.status(403).json({
      error: 'No student record is linked to your account. Please contact administration.',
    })
    return null
  }
  return student.id
}

// ─────────────────────────────────────────────────────────
//  GET /students
//  Staff: filtered list with role-appropriate columns.
//  Student: redirected to /students/me (cannot list other students).
// ─────────────────────────────────────────────────────────

studentsRouter.get(
  '/',
  requirePermission('student.view'),
  attachPermissions([
    'student.create', 'student.edit', 'student.softDelete',
    'student.viewFeeStatus', 'student.viewLibraryStatus',
    'student.approvePendingAction',
  ]),
  async (req: Request, res: Response) => {
    const { user } = req

    // Students may not list all students — redirect to self
    if (user?.role === 'student') {
      res.redirect('/api/students/me')
      return
    }

    const {
      search, classId, status, sex, form, page, pageSize, sortBy, sortDir,
    } = req.query

    const result = await studentService.list({
      search:   search   ? String(search)                : undefined,
      classId:  classId  ? String(classId)               : undefined,
      status:   status   ? String(status) as StudentStatus : undefined,
      sex:      sex      ? String(sex)    as Sex           : undefined,
      form:     form     ? parseInt(String(form), 10)    : undefined,
      page:     page     ? parseInt(String(page), 10)    : 1,
      pageSize: pageSize ? parseInt(String(pageSize), 10) : 25,
      // R15 — server-side sort; the service allow-lists the column and
      // falls back to the default ordering for anything unrecognised.
      sortBy:   sortBy   ? String(sortBy)                : undefined,
      sortDir:  sortDir === 'desc' ? 'desc' : sortDir === 'asc' ? 'asc' : undefined,
      ...periodFromQuery(req),
    }, riskViewerOf(req))

    res.json({ ...result, capabilities: req.can })
  }
)

// ─────────────────────────────────────────────────────────
//  GET /students/at-risk?limit=&academicYear=&term=
//  HIGH-risk active students for the "Students Needing Attention" widget.
//  This route did not exist before (the hook called it, it fell through to
//  /:id and failed), so the widget could never populate. Registered BEFORE
//  /:id on purpose.
//  Oversight roles see the whole school; a teacher only sees students in
//  classes they teach — same scoping rule as exam analytics.
// ─────────────────────────────────────────────────────────

studentsRouter.get(
  '/at-risk',
  requirePermission('student.viewRiskStatus'),
  async (req: Request, res: Response) => {
    const { user } = req
    const limit = Math.min(Math.max(parseInt(String(req.query['limit'] ?? '6'), 10) || 6, 1), 50)
    const period = await riskService.resolveRiskPeriod(periodFromQuery(req))

    let classIds: string[] | undefined
    if (user && user.superUser !== true && user.role !== 'admin' && user.role !== 'high_rank') {
      classIds = await classService.listClassIdsTaughtBy(user.uid, period.academicYear)
    }

    const students = await riskService.getHighRiskStudents(period.term, period.academicYear, limit, classIds)
    res.json({
      students: students.map((s) => ({
        id: s.id, firstName: s.firstName, lastName: s.lastName, className: s.className,
        riskLevel: s.riskLevel, riskScore: s.riskScore, topFactor: s.topFactor, domains: s.domains,
      })),
    })
  }
)

// ─────────────────────────────────────────────────────────
//  GET /students/risk-summary?academicYear=&term=
//  School-wide counts per risk level and per module (fees / academics /
//  attendance / library). Oversight only — it is a whole-school figure.
// ─────────────────────────────────────────────────────────

studentsRouter.get(
  '/risk-summary',
  requirePermission('student.viewRiskStatus'),
  requireRole(['admin', 'high_rank']),
  async (req: Request, res: Response) => {
    const period = await riskService.resolveRiskPeriod(periodFromQuery(req))
    res.json(await riskService.getSchoolRiskSummary(period.term, period.academicYear))
  }
)

// ─────────────────────────────────────────────────────────
//  GET /students/me
//  Student-role self-lookup — derives studentId from firebaseUid.
// ─────────────────────────────────────────────────────────

studentsRouter.get(
  '/me',
  requirePermission('student.viewOwn'),
  async (req: Request, res: Response) => {
    const { user } = req

    if (user?.role !== 'student') {
      // Staff reaching this endpoint — not intended; redirect to /:id
      res.status(400).json({ error: 'This endpoint is for student role only.' })
      return
    }

    const student = await studentService.resolveStudentFromUid(user.uid)
    if (!student) {
      res.status(403).json({
        error: 'No student record is linked to your account.',
      })
      return
    }

    const detail = await studentService.getById(student.id, periodFromQuery(req), riskViewerOf(req))
    if (!detail) {
      res.status(404).json({ error: 'Student record not found.' })
      return
    }

    res.json(detail)
  }
)

// ─────────────────────────────────────────────────────────
//  GET /students/:id
//  Staff: any student by ID.
//  Student: only their own record (enforced by UID check).
// ─────────────────────────────────────────────────────────

studentsRouter.get(
  '/:id',
  requireAnyPermission(['student.view', 'student.viewOwn']),
  async (req: Request, res: Response) => {
    const { user } = req
    const id = String(req.params['id'] ?? '')

    if (!id) {
      res.status(400).json({ error: 'Student ID is required.' })
      return
    }

    // Student role: enforce ownership — cannot access other students
    if (user?.role === 'student') {
      try {
        await studentService.assertStudentOwnership(user.uid, id)
      } catch (err) {
        return sendError(res, err, { defaultStatus: 403, tags: { module: 'students' } })
      }
    }

    const detail = await studentService.getById(id, periodFromQuery(req), riskViewerOf(req))
    if (!detail) {
      res.status(404).json({ error: 'Student not found.' })
      return
    }

    res.json(detail)
  }
)

// ─────────────────────────────────────────────────────────
//  POST /students
//  Admin and high_rank: direct create.
//  lower_rank: routes to PendingAction workflow.
// ─────────────────────────────────────────────────────────

studentsRouter.post(
  '/',
  requirePermission('student.create'),
  async (req: Request, res: Response) => {
    const { user } = req

    if (!user) {
      res.status(401).json({ error: 'Not authenticated.' })
      return
    }

    const {
      firstName, lastName, otherNames, dateOfBirth, sex, nationality,
      district, village, address, phone, email,
      guardianName, guardianPhone, guardianRelation,
      classId, photoKey, firebaseUid,
    } = req.body as studentService.CreateStudentInput

    if (!firstName || !lastName || !dateOfBirth || !sex || !nationality ||
        !district || !email || !guardianName || !guardianPhone || !guardianRelation) {
      res.status(400).json({
        error: 'firstName, lastName, dateOfBirth, sex, nationality, district, email, guardianName, guardianPhone, and guardianRelation are required.',
      })
      return
    }

    // lower_rank must go through pending action workflow
    if (user.role === 'lower_rank') {
      const alreadyPending = await pendingActionService.hasPendingAction(
        'Student', `new:${guardianPhone}:${dateOfBirth}`, 'student.create'
      )
      if (alreadyPending) {
        res.status(409).json({
          error: 'A pending student creation request already exists with these details.',
        })
        return
      }

      const pendingAction = await pendingActionService.create({
        entityType:     'Student',
        entityId:       `new:${guardianPhone}:${dateOfBirth}`,
        action:         'student.create',
        description:    `Create student: ${firstName} ${lastName} (guardian: ${guardianName})`,
        requestedByUid: user.uid,
        requestedByRole:user.role,
        targetState:    req.body as Record<string, unknown>,
      })

      res.status(202).json({
        message: 'Student creation submitted for approval.',
        pendingActionId: pendingAction.id,
      })
      return
    }

    // Admin / high_rank — direct create
    const student = await studentService.create(
      {
        firstName, lastName, otherNames, dateOfBirth, sex, nationality,
        district, village, address, phone, email,
        guardianName, guardianPhone, guardianRelation,
        classId, photoKey, firebaseUid,
      },
      user.uid,
      user.role
    )

    res.status(201).json(student)
  }
)

// ─────────────────────────────────────────────────────────
//  POST /students/:id/photo/upload-ticket + POST /students/:id/photo
//  [NEW] These didn't exist at all — StudentForm.tsx has been calling
//  POST /students/:id/photo (multipart FormData) since it was written,
//  but no such route was ever defined on this router, so every student
//  photo upload has been silently 404ing (the client swallows the
//  failure with only a console.error, never shown to the user — see
//  StudentForm.tsx's uploadPhotoIfNeeded()). Built directly as a
//  direct-to-Appwrite upload (matching the rest of the app's upload
//  routes) rather than as a multer route that would need fixing again
//  later. Student photos are private (FILE_PREFIX.STUDENT_PHOTO is not
//  one of the public prefixes), so the file gets no public read
//  permission — same gating as creating/editing this student.
// ─────────────────────────────────────────────────────────

studentsRouter.post(
  '/:id/photo/upload-ticket',
  requirePermission('student.edit'),
  rateLimit('upload-ticket'),
  async (_req: Request, res: Response) => {
    try {
      const ticket = await createDirectUploadTicket(FILE_PREFIX.STUDENT_PHOTO)
      res.json(ticket)
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'students', route: 'photo-upload-ticket' } })
    }
  }
)

studentsRouter.post(
  '/:id/photo',
  requirePermission('student.edit'),
  async (req: Request, res: Response) => {
    try {
      const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : undefined
      if (!fileId || !fileId.startsWith(`${FILE_PREFIX.STUDENT_PHOTO}_`)) {
        return res.status(400).json({ error: 'Missing or invalid fileId — upload the photo via /:id/photo/upload-ticket first.' })
      }
      await studentService.attachStudentPhoto(String(req.params.id), fileId)
      res.json({ ok: true, photoKey: fileId })
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'students', route: 'photo-upload' } })
    }
  }
)

// ─────────────────────────────────────────────────────────
//  PATCH /students/:id
//  Admin and high_rank: direct update.
//  lower_rank: routes to PendingAction.
//  Student: cannot update own record via this endpoint (read-only self).
// ─────────────────────────────────────────────────────────

studentsRouter.patch(
  '/:id',
  requirePermission('student.edit'),
  async (req: Request, res: Response) => {
    const { user } = req
    const id = String(req.params['id'] ?? '')

    if (!user || !id) {
      res.status(400).json({ error: 'Student ID is required.' })
      return
    }

    // Student role cannot edit own record via this endpoint
    if (user.role === 'student') {
      res.status(403).json({ error: 'Students may not edit their own records.' })
      return
    }

    // lower_rank → pending action
    if (user.role === 'lower_rank') {
      const pendingAction = await pendingActionService.create({
        entityType:     'Student',
        entityId:       id,
        action:         'student.edit',
        description:    `Edit student record ${id}`,
        requestedByUid: user.uid,
        requestedByRole:user.role,
        targetState:    req.body as Record<string, unknown>,
      })

      res.status(202).json({
        message:         'Student edit submitted for approval.',
        pendingActionId: pendingAction.id,
      })
      return
    }

    const student = await studentService.update(id, req.body as studentService.UpdateStudentInput, user.uid, user.role)
    res.json(student)
  }
)

// ─────────────────────────────────────────────────────────
//  DELETE /students/:id  (soft delete — archives)
//  Admin and high_rank: direct archive.
//  lower_rank: pending action.
// ─────────────────────────────────────────────────────────

studentsRouter.delete(
  '/:id',
  requirePermission('student.softDelete'),
  async (req: Request, res: Response) => {
    const { user } = req
    const id = String(req.params['id'] ?? '')

    if (!user || !id) {
      res.status(400).json({ error: 'Student ID is required.' })
      return
    }

    if (user.role === 'lower_rank') {
      const pendingAction = await pendingActionService.create({
        entityType:     'Student',
        entityId:       id,
        action:         'student.softDelete',
        description:    `Archive student record ${id}`,
        requestedByUid: user.uid,
        requestedByRole:user.role,
        targetState:    { action: 'archive' },
      })

      res.status(202).json({
        message:         'Student archival submitted for approval.',
        pendingActionId: pendingAction.id,
      })
      return
    }

    await studentService.softDelete(id, user.uid, user.role)
    res.json({ ok: true, archived: id })
  }
)

// ─────────────────────────────────────────────────────────
//  PATCH /students/:id/status
//  Change student lifecycle status (ACTIVE, AWAITING_MANEB, GRADUATED).
//  Admin and high_rank only.
// ─────────────────────────────────────────────────────────

studentsRouter.patch(
  '/:id/status',
  requirePermission('student.edit'),
  async (req: Request, res: Response) => {
    const { user } = req
    const id = String(req.params['id'] ?? '')
    const { status } = req.body as { status?: StudentStatus }

    if (!user || !id) {
      res.status(400).json({ error: 'Student ID is required.' })
      return
    }

    if (!status) {
      res.status(400).json({ error: 'status is required.' })
      return
    }

    if (!StudentStatusSchema.options.includes(status)) {
      res.status(400).json({ error: `Invalid status "${status}".` })
      return
    }

    const student = await studentService.changeStatus(id, status, user.uid, user.role)
    res.json(student)
  }
)

// ─────────────────────────────────────────────────────────
//  POST /students/:id/link-firebase-uid
//  Link an existing Firebase UID to a student record.
//  Admin only — one-time operation per student.
// ─────────────────────────────────────────────────────────

studentsRouter.post(
  '/:id/link-firebase-uid',
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    const { user } = req
    const id = String(req.params['id'] ?? '')
    const { firebaseUid } = req.body as { firebaseUid?: string }

    if (!user || !id) {
      res.status(400).json({ error: 'Student ID is required.' })
      return
    }

    if (!firebaseUid || typeof firebaseUid !== 'string' || !firebaseUid.trim()) {
      res.status(400).json({ error: 'firebaseUid is required.' })
      return
    }

    await studentService.linkFirebaseUid({
      studentId:   id,
      firebaseUid: firebaseUid.trim(),
      linkedByUid: user.uid,
      linkedByRole:user.role,
    })

    res.json({ ok: true, studentId: id, firebaseUid: firebaseUid.trim() })
  }
)

// ─────────────────────────────────────────────────────────
//  POST /students/from-application/:applicationId
//  Convert an approved Application to a Student record.
//  Admin and high_rank only.
// ─────────────────────────────────────────────────────────

studentsRouter.post(
  '/from-application/:applicationId',
  requirePermission('application.convertToStudent'),
  async (req: Request, res: Response) => {
    const { user }          = req
    const applicationId = String(req.params['applicationId'] ?? '')

    if (!user || !applicationId) {
      res.status(400).json({ error: 'applicationId is required.' })
      return
    }

    const {
      classId,
      createLoginAccount,
    } = req.body as {
      classId?:            string
      createLoginAccount?: boolean
    }

    const result = await studentService.createFromApplication({
      applicationId,
      classId,
      actorUid:  user.uid,
      actorRole: user.role,
      createLoginAccount,
    })

    // Never return the temp password in the response body —
    // it should be communicated to the guardian via the notification service.
    // We include a flag so the UI can prompt the admin to share it.
    res.status(201).json({
      student:             result.student,
      firebaseUid:         result.firebaseUid,
      firebaseAccountCreated: Boolean(result.firebaseUid),
      // tempPasswordSet is true — admin must communicate password to student/guardian
      tempPasswordSet:     Boolean(result.tempPassword),
    })
  }
)

// ─────────────────────────────────────────────────────────
//  GET /students/:id/fee-gate
//  Returns whether the student may view results for a given term.
//  Used by the exam service and student dashboard.
// ─────────────────────────────────────────────────────────

studentsRouter.get(
  '/:id/fee-gate',
  requireAnyPermission(['student.viewFeeStatus', 'student.viewOwn']),
  async (req: Request, res: Response) => {
    const { user } = req
    let id = String(req.params['id'] ?? '')

    if (!user) {
      res.status(401).json({ error: 'Not authenticated.' })
      return
    }

    // Student role: resolve their own ID — ignore any id in the URL
    if (user.role === 'student') {
      const student = await studentService.resolveStudentFromUid(user.uid)
      if (!student) {
        res.status(403).json({ error: 'No student record linked to your account.' })
        return
      }
      id = student.id
    }

    const { academicYear, term } = req.query

    if (!academicYear || !term) {
      res.status(400).json({ error: 'academicYear and term query parameters are required.' })
      return
    }

    const passes = await studentService.passesFeGate(
      id!,
      String(academicYear),
      parseInt(String(term), 10)
    )

    res.json({
      studentId:    id,
      academicYear: String(academicYear),
      term:         parseInt(String(term), 10),
      passesGate:   passes,
      message:      passes
        ? 'Fees are clear — results are accessible.'
        : 'Outstanding fee balance — results are blocked until fees are cleared.',
    })
  }
)