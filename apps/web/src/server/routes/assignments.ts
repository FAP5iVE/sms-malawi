/**
 * apps/web/src/server/routes/assignments.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT (output in full — most handlers change)
 * [R-PHASE]: R3 — Gateway Hardening (GET/POST access-control hardening,
 *   unchanged by this edit); further edited in R6 — Academics II: Classes,
 *   Assignments & the Attendance Rebuild
 * [PURPOSE — R3, retained]: `GET /` was previously gated by `verifyAuth`
 *   alone — any authenticated user of any role (finance, library, hr,
 *   lower_rank — none of whom hold any assignment-related permission)
 *   could list any class's assignments by guessing/enumerating a classId.
 *   Both GET and POST now enforce real relationship checks:
 *     - GET /  — staff holding a school-wide (class.viewAnalytics: admin,
 *       high_rank, exam_officer) or class-level (class.viewAssignments:
 *       academic) academic-view permission may view any class's
 *       assignments; a student may view only a class they are actually
 *       enrolled in (checked via Student.firebaseUid → Student.classId,
 *       never by assuming req.user.uid equals a Student.id — the
 *       confirmed Firebase-UID/Prisma-student-ID mismatch documented
 *       elsewhere in this audit).
 * [PURPOSE — R6]:
 *   1. POST / narrowed from requireRole(['admin','high_rank','academic'])
 *      to requireRole(['academic']) only — admin/high_rank held no real
 *      teaching relationship to any specific class, and R3's ownership
 *      check already made their bypass a special case rather than a real
 *      capability; removing them from the role gate entirely closes the
 *      over-grant rather than special-casing around it. The ownership
 *      check itself (teacher-matches-Class.teacherId) is now unconditional
 *      since only 'academic' can reach the handler.
 *   2. Added POST /:id/submit — a student uploads a file (multer, Appwrite
 *      storage) against a specific assignment. Gated to students actually
 *      enrolled in :classId (the same enrollment check GET / uses).
 *   3. Prisma logic is extracted to assignmentService.ts (createAssignment/
 *      submitAssignment/listForClass), matching the established
 *      studentService.ts/classService.ts service-layer convention — this
 *      logic previously lived inline in the route handlers.
 *   [NOTE, retained from R3] MASTER_ROADMAP.md's change list for this file
 *   also names a "GET /:id" route to harden — no such route exists
 *   anywhere in this codebase (only GET /, POST /, and now POST /:id/submit
 *   are defined here).
 * [DEPENDS ON]: apps/web/src/server/services/assignmentService.ts,
 *   apps/web/src/lib/storage.ts, @shared/schemas/student
 *   (CreateAssignmentSchema)
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { hasAnyPermission, type Permission } from '@shared/types/permissions'
import { prisma } from '@/lib/prisma'
import { CreateAssignmentSchema } from '@shared/schemas/student'
import * as assignmentService from '@/server/services/assignmentService'
import { uploadFile, FILE_PREFIX } from '@/lib/storage'
import { sendError } from '@/server/lib/sendError'

export const assignmentsRouter = Router({ mergeParams: true })
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }) // 25MB

// Staff permissions that grant visibility into ANY class's assignments —
// class.viewAnalytics (school-wide oversight: admin, high_rank,
// exam_officer) or class.viewAssignments (class-level, held by the
// academic/teacher role). A student also holds class.viewAssignments, but
// is additionally scoped to their own enrolled class below — holding the
// permission alone is not sufficient for the student branch.
const STAFF_ASSIGNMENT_VIEW_PERMISSIONS: readonly Permission[] = [
  'class.viewAnalytics',
  'class.viewAssignments',
]

/**
 * Requires either:
 *   - the requester's role holds one of STAFF_ASSIGNMENT_VIEW_PERMISSIONS, or
 *   - the requester is a student actually enrolled in the target class
 *     (Student.firebaseUid === req.user.uid AND Student.classId === classId).
 * Must run after verifyAuth. Also used by POST /:id/submit — a student
 * must be enrolled in the class to submit against one of its assignments.
 */
async function requireAssignmentViewAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { classId } = req.params as { classId: string }
  const user = req.user!

  if (hasAnyPermission(user.role, STAFF_ASSIGNMENT_VIEW_PERMISSIONS) && user.role !== 'student') {
    next()
    return
  }

  if (user.role === 'student') {
    const enrolled = await prisma.student.findFirst({
      where: { firebaseUid: user.uid, classId },
      select: { id: true },
    })
    if (enrolled) {
      next()
      return
    }
  }

  res.status(403).json({ error: 'You do not have access to this class\u2019s assignments.' })
}

// GET /classes/:classId/assignments
assignmentsRouter.get('/', verifyAuth, requireAssignmentViewAccess, async (req, res) => {
  const { classId } = req.params as { classId: string }
  const assignments = await assignmentService.listForClass(classId)
  return res.json(assignments)
})

// POST /classes/:classId/assignments — 'academic' only. The ownership
// check (teacher-matches-Class.teacherId) is unconditional now that no
// other role can reach this handler.
assignmentsRouter.post(
  '/',
  verifyAuth,
  requireRole(['academic']),
  async (req, res) => {
    const { classId } = req.params as { classId: string }
    const user = req.user!

    const targetClass = await prisma.class.findUnique({
      where: { id: classId },
      select: { teacherId: true },
    })
    if (!targetClass) {
      return res.status(404).json({ error: 'Class not found.' })
    }
    if (targetClass.teacherId !== user.uid) {
      return res.status(403).json({ error: 'You are not the assigned teacher for this class.' })
    }

    const parsed = CreateAssignmentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })

    const assignment = await assignmentService.createAssignment(classId, parsed.data, user.uid, user.role)
    return res.status(201).json(assignment)
  }
)

// POST /classes/:classId/assignments/:id/submit — a student uploads their
// submission file. Gated to students actually enrolled in :classId, same
// check as GET /.
assignmentsRouter.post(
  '/:id/submit',
  verifyAuth,
  requireAssignmentViewAccess,
  upload.single('file'),
  async (req: Request, res: Response) => {
    // [PRODUCTION FIX] No try/catch at all — an error from uploadFile()
    // or submitAssignment() became an unhandled rejection with no response
    // ever sent, hanging the client's fetch. Same systemic bug found across
    // announcements.ts, gallery.ts, finances.ts, hr.ts, and library.ts.
    try {
      const user = req.user!
      if (user.role !== 'student') {
        return res.status(403).json({ error: 'Only enrolled students may submit assignments.' })
      }

      const assignmentId = String(req.params.id)

      const student = await prisma.student.findFirst({
        where:  { firebaseUid: user.uid },
        select: { id: true },
      })
      if (!student) {
        return res.status(404).json({ error: 'No student record is linked to this account.' })
      }

      let fileKey: string | null = null
      if (req.file) {
        const uploaded = await uploadFile(
          FILE_PREFIX.ASSIGNMENT_SUBMISSION,
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype
        )
        fileKey = uploaded.fileId
      }

      const submission = await assignmentService.submitAssignment(
        assignmentId,
        student.id,
        fileKey,
        user.uid,
        user.role
      )
      return res.status(201).json(submission)
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'assignments', route: 'submit' } })
    }
  }
)