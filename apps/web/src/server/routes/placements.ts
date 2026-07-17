/**
 * apps/web/src/server/routes/placements.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: The placement domain's HTTP surface. Applies verifyAuth router-
 *   wide, then gates each route with the R18 placement.* permissions. All
 *   student self-service routes resolve the caller's Firebase UID to their
 *   Prisma student id via resolveStudentFromUid FIRST (never trusting a raw
 *   UID or a client-supplied studentId), so a student can only ever read or
 *   write their own placement.
 *
 *   ROUTE ORDER MATTERS. The literal paths /me, /me/choices, /me/outcome,
 *   /cohort, /catalogue, /eligible, /batch-generate are all registered BEFORE
 *   the parameterised /:studentId and /:id routes, so Express never
 *   mis-captures 'me'/'cohort' as a :studentId. GET /cohort is a first-class
 *   route (roadmap acceptance criterion: GET /api/placements/cohort must not
 *   404) served straight off the mounted router.
 *
 *   PERMISSION MAP (phase11 §5):
 *     placement.viewOwn        → GET /me                (student only)
 *     placement.recordOwnChoice→ PATCH /me/choices, PATCH /me/outcome
 *     placement.view           → GET /:studentId, GET /cohort, GET /catalogue
 *     placement.viewAnalytics  → (analytics route lives in analytics.ts)
 *     placement.manage         → POST /:studentId/generate, POST /batch-generate,
 *                                GET /eligible, PATCH /:id/choices
 *     placement.recordOutcome  → PATCH /:id/outcome
 *     placement.verifyOutcome  → PATCH /:id/verify
 * [DEPENDS ON]: @/lib/verifyAuth, @/server/middleware/verifyPermission,
 *   @/server/services/placementService, @/server/services/studentService,
 *   @shared/schemas/placement
 */
import 'server-only'

import { Router, type Request, type Response } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as placementService from '@/server/services/placementService'
import { resolveStudentFromUid } from '@/server/services/studentService'
import { SetChoicesSchema, RecordOutcomeSchema, VerifyOutcomeSchema, BatchGenerateSchema } from '@shared/schemas/placement'

export const placementsRouter = Router()

// Every placement route requires an authenticated user.
placementsRouter.use(verifyAuth)

// Translate a service error carrying an HTTP `status` into a JSON response.
function sendError(res: Response, err: unknown): Response {
  const status = (err as { status?: number } | null)?.status ?? 500
  const message = err instanceof Error ? err.message : 'Unexpected error.'
  if (status >= 500) console.error('placements route error:', err)
  return res.status(status).json({ error: message })
}

// ─────────────────────────────────────────────────────────
//  STUDENT SELF-SERVICE (/me*) — resolve UID → student id FIRST
// ─────────────────────────────────────────────────────────

// GET /placements/me — the caller's own placement + fresh recommendations.
placementsRouter.get('/me', requirePermission('placement.viewOwn'), async (req: Request, res: Response) => {
  try {
    const student = await resolveStudentFromUid(req.user!.uid)
    if (!student) return res.status(403).json({ error: 'No student record is linked to this account.' })

    const placement = await placementService.getPlacementForStudent(student.id)
    if (!placement) {
      return res.json({ placement: null, recommendations: [] })
    }
    const recommendations = await placementService.getRecommendationsForPlacement(placement.id)
    return res.json({ placement, recommendations })
  } catch (err) {
    return sendError(res, err)
  }
})

// PATCH /placements/me/choices — the student records/replaces their own choices.
placementsRouter.patch('/me/choices', requirePermission('placement.recordOwnChoice'), async (req: Request, res: Response) => {
  const parsed = SetChoicesSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const student = await resolveStudentFromUid(req.user!.uid)
    if (!student) return res.status(403).json({ error: 'No student record is linked to this account.' })

    const placement = await placementService.getPlacementForStudent(student.id)
    if (!placement) return res.status(404).json({ error: 'No placement exists yet. Ask the school to generate your eligibility first.' })

    const updated = await placementService.setChoices(placement.id, parsed.data, req.user!.uid, req.user!.role)
    return res.json(updated)
  } catch (err) {
    return sendError(res, err)
  }
})

// PATCH /placements/me/outcome — the student self-reports their own outcome.
placementsRouter.patch('/me/outcome', requirePermission('placement.recordOwnChoice'), async (req: Request, res: Response) => {
  const parsed = RecordOutcomeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const student = await resolveStudentFromUid(req.user!.uid)
    if (!student) return res.status(403).json({ error: 'No student record is linked to this account.' })

    const placement = await placementService.getPlacementForStudent(student.id)
    if (!placement) return res.status(404).json({ error: 'No placement exists yet.' })

    const updated = await placementService.recordOutcome(placement.id, parsed.data, req.user!.uid, req.user!.role)
    return res.json(updated)
  } catch (err) {
    return sendError(res, err)
  }
})

// ─────────────────────────────────────────────────────────
//  STAFF / COHORT (literal paths before /:param)
// ─────────────────────────────────────────────────────────

// GET /placements/cohort — every placement (optionally filtered by ?status=).
placementsRouter.get('/cohort', requirePermission('placement.view'), async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const placements = await placementService.listPlacements(status ? { status } : {})
    return res.json(placements)
  } catch (err) {
    return sendError(res, err)
  }
})

// GET /placements/catalogue — the university/programme catalogue for pickers.
placementsRouter.get('/catalogue', requirePermission('placement.view'), async (_req: Request, res: Response) => {
  try {
    return res.json(placementService.getCatalogue())
  } catch (err) {
    return sendError(res, err)
  }
})

// GET /placements/eligible?academicYear= — Form 4 / certified-MSCE cohort.
placementsRouter.get('/eligible', requirePermission('placement.manage'), async (req: Request, res: Response) => {
  const academicYear = typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined
  if (!academicYear) return res.status(400).json({ error: 'academicYear query param required.' })
  try {
    const students = await placementService.listPlacementEligibleStudents(academicYear)
    return res.json(students)
  } catch (err) {
    return sendError(res, err)
  }
})

// POST /placements/batch-generate — generate eligibility for the whole cohort.
placementsRouter.post('/batch-generate', requirePermission('placement.manage'), async (req: Request, res: Response) => {
  const parsed = BatchGenerateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const result = await placementService.batchGenerate(parsed.data.academicYear, req.user!.uid, req.user!.role)
    return res.json(result)
  } catch (err) {
    return sendError(res, err)
  }
})

// ─────────────────────────────────────────────────────────
//  PARAMETERISED ROUTES (after all literal paths)
// ─────────────────────────────────────────────────────────

// GET /placements/:studentId — a specific student's placement + recommendations.
placementsRouter.get('/:studentId', requirePermission('placement.view'), async (req: Request, res: Response) => {
  try {
    const studentId = String(req.params['studentId'] ?? '')
    const placement = await placementService.getPlacementForStudent(studentId)
    if (!placement) return res.json({ placement: null, recommendations: [] })
    const recommendations = await placementService.getRecommendationsForPlacement(placement.id)
    return res.json({ placement, recommendations })
  } catch (err) {
    return sendError(res, err)
  }
})

// POST /placements/:studentId/generate — (re)generate eligibility for one student.
placementsRouter.post('/:studentId/generate', requirePermission('placement.manage'), async (req: Request, res: Response) => {
  const academicYear = typeof req.body?.academicYear === 'string' ? req.body.academicYear : undefined
  if (!academicYear) return res.status(400).json({ error: 'academicYear is required in the request body.' })
  try {
    const studentId = String(req.params['studentId'] ?? '')
    const result = await placementService.generateForStudent(studentId, academicYear, req.user!.uid, req.user!.role)
    return res.status(201).json(result)
  } catch (err) {
    return sendError(res, err)
  }
})

// PATCH /placements/:id/choices — staff record/replace a placement's choices.
placementsRouter.patch('/:id/choices', requirePermission('placement.manage'), async (req: Request, res: Response) => {
  const parsed = SetChoicesSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const id = String(req.params['id'] ?? '')
    const updated = await placementService.setChoices(id, parsed.data, req.user!.uid, req.user!.role)
    return res.json(updated)
  } catch (err) {
    return sendError(res, err)
  }
})

// PATCH /placements/:id/outcome — staff record a placement outcome.
placementsRouter.patch('/:id/outcome', requirePermission('placement.recordOutcome'), async (req: Request, res: Response) => {
  const parsed = RecordOutcomeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const id = String(req.params['id'] ?? '')
    const updated = await placementService.recordOutcome(id, parsed.data, req.user!.uid, req.user!.role)
    return res.json(updated)
  } catch (err) {
    return sendError(res, err)
  }
})

// PATCH /placements/:id/verify — high_rank verifies a recorded outcome.
placementsRouter.patch('/:id/verify', requirePermission('placement.verifyOutcome'), async (req: Request, res: Response) => {
  const parsed = VerifyOutcomeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
  try {
    const id = String(req.params['id'] ?? '')
    const updated = await placementService.verifyOutcome(id, parsed.data, req.user!.uid, req.user!.role)
    return res.json(updated)
  } catch (err) {
    return sendError(res, err)
  }
})

export default placementsRouter
