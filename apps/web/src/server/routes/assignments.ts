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
 *   2. Added POST /:id/submit — a student uploads a file (direct R2 upload) against a specific assignment. Gated to students actually
 *      enrolled in :classId (the same enrollment check GET / uses).
 *   3. Prisma logic is extracted to assignmentService.ts (createAssignment/
 *      submitAssignment/listForClass), matching the established
 *      studentService.ts/classService.ts service-layer convention — this
 *      logic previously lived inline in the route handlers.
 *   [NOTE, retained from R3] MASTER_ROADMAP.md's change list for this file
 *   also names a "GET /:id" route to harden — no such route exists
 *   anywhere in this codebase (only GET /, POST /, and now POST /:id/submit
 *   are defined here).
 * [MAINT 2026-10-28 — Assignment workflow, merged & hardened]: the full set
 *     GET    /                              list (scoped per viewer)
 *     POST   /                              create  (subject teacher / class teacher)
 *     POST   /attachments/image|file/upload-ticket   teacher pictures / documents
 *     GET    /:id                           detail  (a pure read - no side effects)
 *     POST   /:id/view                      a student opened it (atomic, debounced)
 *     PATCH  /:id                           edit    (stale-edit check via expectedUpdatedAt)
 *     DELETE /:id                           delete  (refused once real work exists)
 *     GET    /:id/roster                    class list: opened / submitted / late / not submitted
 *     PUT    /:id/submissions/:studentId    record one student (submitted-on required)
 *     GET    /:id/submissions/:studentId/file   authorised URL for one hand-in file
 *     POST   /:id/submit/upload-ticket      student hand-in upload credential
 *     POST   /:id/submit                    student hand-in (file and/or note)
 *   Every rule lives in assignmentService.ts; this file authenticates, validates
 *   the ids and body, and delegates. The router is also mounted without a
 *   :classId, so every id in the path is validated before any handler runs.
 * [DEPENDS ON]: apps/web/src/server/services/assignmentService.ts,
 *   apps/web/src/lib/storage.ts, @shared/schemas/student
 *   (CreateAssignmentSchema, UpdateAssignmentSchema, MarkSubmissionSchema)
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import { rateLimit } from '@/lib/ratelimit'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { hasAnyPermission, type Permission } from '@shared/types/permissions'
import { prisma } from '@/lib/prisma'
import {
  CreateAssignmentSchema,
  UpdateAssignmentSchema,
  MarkSubmissionSchema,
  SubmitAssignmentSchema,
  IdParamSchema,
} from '@shared/schemas/student'
import * as assignmentService from '@/server/services/assignmentService'
import { createDirectUploadTicket, FILE_PREFIX, getSignedViewUrl } from '@/lib/storage'
import { sendError } from '@/server/lib/sendError'

export const assignmentsRouter = Router({ mergeParams: true })

// Every id that reaches a handler is shape-checked first: a missing :classId (the
// router is also mounted at /assignments) is a 404, a malformed id of any kind a
// 400 - neither ever reaches a query.
assignmentsRouter.use((req: Request, res: Response, next: NextFunction) => {
  const { classId } = req.params as { classId?: string }
  if (!classId) { res.status(404).json({ error: 'Not found.' }); return }
  if (!IdParamSchema.safeParse(classId).success) { res.status(400).json({ error: 'Invalid class id.' }); return }
  next()
})
for (const name of ['id', 'studentId'] as const) {
  assignmentsRouter.param(name, (_req, res, next, value) => {
    if (!IdParamSchema.safeParse(value).success) { res.status(400).json({ error: `Invalid ${name === 'id' ? 'assignment' : 'student'} id.` }); return }
    next()
  })
}

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

  // This router is also mounted at /assignments (no :classId). Without a class
  // there is nothing to authorise, and a missing classId must never fall
  // through to an unfiltered query.
  if (!classId) {
    res.status(404).json({ error: 'Not found.' })
    return
  }

  if (hasAnyPermission(user.role, STAFF_ASSIGNMENT_VIEW_PERMISSIONS, user.superUser === true) && user.role !== 'student') {
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
// [2026-10-22] Scoped per viewer - see assignmentService.scopeForViewer().
// Deliberately NOT behind requireAssignmentViewAccess: that gate is a broad
// role check, whereas the real rule is subject-level.
assignmentsRouter.get('/', verifyAuth, async (req, res) => {
  const { classId } = req.params as { classId?: string }
  if (!classId) return res.status(404).json({ error: 'Not found.' })
  try {
    const user = req.user!
    return res.json(await assignmentService.listForViewer(classId, { uid: user.uid, role: user.role, superUser: user.superUser === true }))
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'assignments', route: 'list' } })
  }
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

    if (!classId) return res.status(404).json({ error: 'Not found.' })

    const parsed = CreateAssignmentSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })

    // [2026-10-22] Ownership is now per SUBJECT: the subject must be assigned
    // to a teacher in this class, and the actor must be that teacher or the
    // class teacher (assignmentService.assertCanCreateForSubject, called by
    // createAssignment).
    try {
      const assignment = await assignmentService.createAssignment(classId, parsed.data, user.uid, user.role)
      return res.status(201).json(assignment)
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'assignments', route: 'create' } })
    }
  }
)

const viewerOf = (req: Request) => {
  const u = req.user!
  return { uid: u.uid, role: u.role, superUser: u.superUser === true }
}

// POST /classes/:classId/assignments/attachments/image/upload-ticket
// POST /classes/:classId/assignments/attachments/file/upload-ticket
// One-time upload credentials for a teacher's assignment pictures (public-read
// prefix, so they show in <img> tags) and documents (private). Declared before
// the /:id routes. Gate: a teacher who can post at least one subject here.
for (const [kind, prefix] of [['image', FILE_PREFIX.ASSIGNMENT_IMAGE], ['file', FILE_PREFIX.ASSIGNMENT_FILE]] as const) {
  assignmentsRouter.post(
    `/attachments/${kind}/upload-ticket`,
    verifyAuth,
    requireRole(['academic']),
    rateLimit('upload-ticket'),
    async (req: Request, res: Response) => {
      try {
        await assignmentService.assertCanPostInClass(String(req.params.classId), viewerOf(req))
        res.json(await createDirectUploadTicket(prefix, req.body))
      } catch (err: unknown) {
        return sendError(res, err, { tags: { module: 'assignments', route: `attachment-${kind}-ticket` } })
      }
    },
  )
}

// GET /classes/:classId/assignments/:id — full detail. A pure read: opening an
// assignment is recorded by POST /:id/view, so refetches/retries/prefetches can
// never change the data.
assignmentsRouter.get('/:id', verifyAuth, async (req: Request, res: Response) => {
  try {
    return res.json(await assignmentService.getDetail(String(req.params.classId), String(req.params.id), viewerOf(req)))
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'assignments', route: 'detail' } })
  }
})

// POST /classes/:classId/assignments/:id/view — the student opened the assignment.
assignmentsRouter.post('/:id/view', verifyAuth, requireRole(['student']), async (req: Request, res: Response) => {
  try {
    return res.json(await assignmentService.recordView(String(req.params.classId), String(req.params.id), viewerOf(req)))
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'assignments', route: 'view' } })
  }
})

// PATCH /classes/:classId/assignments/:id — subject teacher / class teacher only
assignmentsRouter.patch('/:id', verifyAuth, requireRole(['academic']), async (req: Request, res: Response) => {
  const parsed = UpdateAssignmentSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  try {
    return res.json(await assignmentService.updateAssignment(String(req.params.classId), String(req.params.id), parsed.data, viewerOf(req)))
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'assignments', route: 'update' } })
  }
})

// DELETE /classes/:classId/assignments/:id — refused once real work exists
assignmentsRouter.delete('/:id', verifyAuth, requireRole(['academic']), async (req: Request, res: Response) => {
  try {
    return res.json(await assignmentService.deleteAssignment(String(req.params.classId), String(req.params.id), viewerOf(req)))
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'assignments', route: 'delete' } })
  }
})

// GET /classes/:classId/assignments/:id/roster — the class list with who has
// opened it and who has handed in / is late / has not. Staff only (a student gets
// 403 from the service); admin / high_rank / exam_officer see it read-only.
assignmentsRouter.get('/:id/roster', verifyAuth, async (req: Request, res: Response) => {
  try {
    return res.json(await assignmentService.getRoster(String(req.params.classId), String(req.params.id), viewerOf(req)))
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'assignments', route: 'roster' } })
  }
})

// PUT /classes/:classId/assignments/:id/submissions/:studentId — record one student.
// Body: { status: SUBMITTED | LATE | MISSING, submittedOn (required unless MISSING),
//         marks?, feedback?, expectedUpdatedAt? }. Only the subject teacher / class teacher.
assignmentsRouter.put('/:id/submissions/:studentId', verifyAuth, requireRole(['academic']), async (req: Request, res: Response) => {
  const parsed = MarkSubmissionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  try {
    return res.json(
      await assignmentService.markStudent(
        String(req.params.classId), String(req.params.id), String(req.params.studentId), parsed.data, viewerOf(req),
      ),
    )
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'assignments', route: 'mark-student' } })
  }
})

// GET /classes/:classId/assignments/:id/submissions/:studentId/file — the
// authorised way to open one hand-in. The storage id is never in list payloads; it
// is resolved here after the student-is-self / teacher-has-the-class check, and the
// file proxy then authorises the download again.
assignmentsRouter.get('/:id/submissions/:studentId/file', verifyAuth, async (req: Request, res: Response) => {
  try {
    const fileId = await assignmentService.getSubmissionFileId(
      String(req.params.classId), String(req.params.id), String(req.params.studentId), viewerOf(req),
    )
    return res.json({ url: await getSignedViewUrl(fileId) })
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'assignments', route: 'submission-file' } })
  }
})

// POST /classes/:classId/assignments/:id/submit/upload-ticket — mints a one-time
// upload credential for this student's hand-in file. Hand-ins are private
// (FILE_PREFIX.ASSIGNMENT_SUBMISSION is not a public prefix): no public read.
assignmentsRouter.post(
  '/:id/submit/upload-ticket',
  verifyAuth,
  requireAssignmentViewAccess,
  rateLimit('upload-ticket'),
  async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'student') {
        return res.status(403).json({ error: 'Only enrolled students may submit assignments.' })
      }
      res.json(await createDirectUploadTicket(FILE_PREFIX.ASSIGNMENT_SUBMISSION, req.body))
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'assignments', route: 'submit-upload-ticket' } })
    }
  }
)

// POST /classes/:classId/assignments/:id/submit — hand in work the browser has
// ALREADY uploaded straight to storage (file and/or note). The student is derived
// from the signed-in user inside the service - never from the request - and the
// uploaded file is verified there (prefix, unclaimed, stored type/size/age).
assignmentsRouter.post(
  '/:id/submit',
  verifyAuth,
  requireAssignmentViewAccess,
  async (req: Request, res: Response) => {
    const body = SubmitAssignmentSchema.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({ error: body.error.issues[0]?.message ?? 'Invalid hand-in.' })
    }
    try {
      const submission = await assignmentService.submitAssignment(
        String(req.params.classId), String(req.params.id), viewerOf(req), body.data,
      )
      return res.status(201).json({ id: submission.id, status: submission.status, submittedAt: submission.submittedAt })
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'assignments', route: 'submit' } })
    }
  }
)
