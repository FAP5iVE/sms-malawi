/**
 * [CHANGE TYPE]: TARGETED EDIT (output in full — every handler in this file
 *   changes)
 * [FILE]: apps/web/src/server/routes/applications.ts
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]:
 *   1. PATCH /:id/status now gates on requirePermission('application.
 *      approve') for APPROVED/AWAITING_ADMISSION and requirePermission(
 *      'application.deny') for DENIED, replacing the coarse requireRole
 *      (['admin','high_rank','lower_rank']) that let lower_rank — who only
 *      holds application.review, not .approve/.deny — reach the same
 *      Approve/Deny actions as a reviewer. This closes a server-side
 *      authorization bypass, not a UI-only gap.
 *   2. The inline ['APPROVED','DENIED','AWAITING_ADMISSION'] literal is
 *      replaced with ApplicationStatusTransitionSchema (@shared/schemas/
 *      student), derived via .extract() from the canonical status enum.
 *   3. POST /public gains createRateLimiter('auth') (10 req/min) — this
 *      unauthenticated endpoint previously had no rate limiting of its own.
 *   4. POST / (internal) and POST /public both now parse against the
 *      unified ApplicationSchema (safeParse, not the two former divergent
 *      schemas).
 *   5. POST /:id/convert is repointed at studentService.createFromApplication()
 *      instead of the now-removed applicationService.convertToStudent() —
 *      the richer implementation with optional Firebase-account creation
 *      that already existed with zero frontend caller.
 * [DEPENDS ON]: @shared/schemas/student (ApplicationSchema,
 *   ApplicationStatusTransitionSchema), apps/web/src/lib/ratelimit.ts,
 *   apps/web/src/server/services/studentService.ts (createFromApplication)
 */
import { Router } from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { requirePermission, requireAnyPermission } from '@/server/middleware/verifyPermission'
import { hasPermission } from '@shared/types/permissions'
import { createRateLimiter } from '@/lib/ratelimit'
import {
  ApplicationSchema,
  ApplicationStatusTransitionSchema,
} from '@shared/schemas/student'
import * as appService    from '@/server/services/applicationService'
import * as studentService from '@/server/services/studentService'
import { sendError } from '@/server/lib/sendError'

export const applicationsRouter = Router()

applicationsRouter.post('/public', createRateLimiter('auth'), async (req, res) => {
  const parsed = ApplicationSchema.safeParse(req.body)
  if (!parsed.success)
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const app = await appService.createPublicApplication(parsed.data)
    return res.status(201).json({ id: app.id, status: app.status })
  } catch (err) {
    if (err instanceof Error && (err as Error & { code?: string }).code === 'DUPLICATE_APPLICATION') {
      return res.status(409).json({
        error: 'DUPLICATE',
        message: 'An application for this applicant (same name, date of birth and guardian contact) already exists and is being reviewed.',
      })
    }
    return sendError(res, err, {
      publicMessage: 'Failed to submit application. Please try again.',
      tags: { module: 'applications' },
    })
  }
})

// GET /applications — authenticated list (paginated as of R15)
applicationsRouter.get(
  '/',
  verifyAuth,
  requirePermission('application.view'),
  async (req, res) => {
    const { status, page, pageSize } = req.query
    const result = await appService.listApplications(
      status ? String(status) : undefined,
      page ? parseInt(String(page), 10) : 1,
      pageSize ? parseInt(String(pageSize), 10) : undefined,
    )
    return res.json(result)
  }
)

// GET /applications/:id — single application for the applicant detail page.
// Same permission gate as the list (application.view). 404 when not found.
applicationsRouter.get(
  '/:id',
  verifyAuth,
  requirePermission('application.view'),
  async (req, res) => {
    const app = await appService.getApplicationById(String(req.params.id))
    if (!app) return res.status(404).json({ error: 'Application not found' })
    return res.json(app)
  }
)

// POST /applications — internal (staff-entered application, e.g. a walk-in)
applicationsRouter.post(
  '/',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    const parsed = ApplicationSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const app = await appService.createApplication(parsed.data)
    return res.status(201).json(app)
  }
)

// PATCH /applications/:id/status — approve / deny / mark awaiting admission.
// Gated per-action: DENIED requires application.deny; APPROVED and
// AWAITING_ADMISSION (part of the same approval pipeline) require
// application.approve. requireAnyPermission is the coarse route-level gate
// (rejects a role holding neither outright); the fine-grained per-status
// check happens inside the handler once the target status is known.
applicationsRouter.patch(
  '/:id/status',
  verifyAuth,
  requireAnyPermission(['application.approve', 'application.deny']),
  async (req, res) => {
    const id = String(req.params.id)
    const { notes } = req.body as { notes?: string }

    const parsedStatus = ApplicationStatusTransitionSchema.safeParse(req.body.status)
    if (!parsedStatus.success) {
      return res.status(400).json({ error: 'Invalid status transition' })
    }
    const status = parsedStatus.data

    const requiredPermission = status === 'DENIED' ? 'application.deny' : 'application.approve'
    if (!hasPermission(req.user!.role, requiredPermission)) {
      return res.status(403).json({
        error: 'You do not have permission to perform this action.',
        required: requiredPermission,
        role: req.user!.role,
      })
    }

    const updated = await appService.updateApplicationStatus(id, status, req.user!.uid, req.user!.role, notes)
    return res.json(updated)
  }
)

// POST /applications/:id/convert — approved app → Student, via
// studentService.createFromApplication() (the audit-logged, optional-
// Firebase-account implementation — see file header).
applicationsRouter.post(
  '/:id/convert',
  verifyAuth,
  requirePermission('application.convertToStudent'),
  async (req, res) => {
    const id = String(req.params.id)
    const { classId, createLoginAccount } = req.body as {
      classId?:            string
      createLoginAccount?: boolean
    }

    const result = await studentService.createFromApplication({
      applicationId: id,
      classId,
      actorUid:  req.user!.uid,
      actorRole: req.user!.role,
      createLoginAccount,
    })

    return res.status(201).json({
      student:                result.student,
      firebaseUid:            result.firebaseUid,
      firebaseAccountCreated: Boolean(result.firebaseUid),
      tempPasswordSet:        Boolean(result.tempPassword),
    })
  }
)