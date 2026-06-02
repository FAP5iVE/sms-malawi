import 'server-only'

import { Router, type Request, type Response } from 'express'
import { verifyAuth, requireRole }              from '@/lib/verifyAuth'
import {
  requirePermission,
  requireAnyPermission,
  attachPermissions,
} from '@/server/middleware/verifyPermission'
import * as studentService             from '@/server/services/studentService'
import * as pendingActionService       from '@/server/services/pendingActionService'
import type { StudentStatus, Sex }     from '@prisma/client'
import type { UserRole }               from '@shared/types/roles'

export const studentsRouter = Router()

studentsRouter.use(verifyAuth)

// ─────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────

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
      search, classId, status, sex, form, page, pageSize,
    } = req.query

    const result = await studentService.list({
      search:   search   ? String(search)                : undefined,
      classId:  classId  ? String(classId)               : undefined,
      status:   status   ? String(status) as StudentStatus : undefined,
      sex:      sex      ? String(sex)    as Sex           : undefined,
      form:     form     ? parseInt(String(form), 10)    : undefined,
      page:     page     ? parseInt(String(page), 10)    : 1,
      pageSize: pageSize ? parseInt(String(pageSize), 10) : 25,
    })

    res.json({ ...result, capabilities: req.can })
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

    const detail = await studentService.getById(student.id)
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
    const { id }   = req.params

    if (!id) {
      res.status(400).json({ error: 'Student ID is required.' })
      return
    }

    // Student role: enforce ownership — cannot access other students
    if (user?.role === 'student') {
      try {
        await studentService.assertStudentOwnership(user.uid, id)
      } catch (err) {
        const e = err as { status?: number; message: string }
        res.status(e.status ?? 403).json({ error: e.message })
        return
      }
    }

    const detail = await studentService.getById(id)
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
        !district || !guardianName || !guardianPhone || !guardianRelation) {
      res.status(400).json({
        error: 'firstName, lastName, dateOfBirth, sex, nationality, district, guardianName, guardianPhone, and guardianRelation are required.',
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
    const { id }   = req.params

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
    const { id }   = req.params

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
  requireRole(['admin', 'high_rank', 'exam_officer']),
  async (req: Request, res: Response) => {
    const { user } = req
    const { id }   = req.params
    const { status } = req.body as { status?: StudentStatus }

    if (!user || !id) {
      res.status(400).json({ error: 'Student ID is required.' })
      return
    }

    if (!status) {
      res.status(400).json({ error: 'status is required.' })
      return
    }

    const VALID_STATUSES: StudentStatus[] = [
      'ACTIVE', 'AWAITING_MANEB_RESULTS', 'GRADUATED', 'ARCHIVED',
    ]
    if (!VALID_STATUSES.includes(status)) {
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
    const { id }   = req.params
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
    const { applicationId } = req.params

    if (!user || !applicationId) {
      res.status(400).json({ error: 'applicationId is required.' })
      return
    }

    const {
      classId,
      createFirebaseAccount,
    } = req.body as {
      classId?:              string
      createFirebaseAccount?: { email: string; password: string }
    }

    if (createFirebaseAccount) {
      if (!createFirebaseAccount.email || !createFirebaseAccount.password) {
        res.status(400).json({ error: 'email and password are required when creating a Firebase account.' })
        return
      }
      if (createFirebaseAccount.password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters.' })
        return
      }
    }

    const result = await studentService.createFromApplication({
      applicationId,
      classId,
      actorUid:  user.uid,
      actorRole: user.role,
      createFirebaseAccount,
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
    let { id }     = req.params

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