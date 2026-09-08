/**
 * apps/web/src/server/routes/placements.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE (OVERHAUL)
 * [R-PHASE]: R18 — University Placement Module, redesigned against the
 *   "Malawi Higher Education Placement & Advisory" reference module.
 * [PURPOSE]: HTTP surface for the placement domain, restructured around the
 *   reference module's five functional areas instead of the old
 *   ranked-choices pipeline:
 *
 *     STUDENT SELF-SERVICE (Student Claim Portal — graduated students only)
 *       GET  /placements/me          placement.viewOwn
 *       POST /placements/me/claim    placement.recordOwnChoice  (server also
 *                                     enforces Student.status === 'GRADUATED')
 *
 *     MSCE ADVISORY (all roles — pure calculator, not tied to any record)
 *       POST /placements/advisory    placement.view
 *
 *     PLACEMENT REGISTRY & ANALYTICS (all roles)
 *       GET  /placements/registry    placement.view
 *       GET  /placements/catalogue   placement.view OR placement.viewOwn
 *
 *     STAFF PLACEMENT ENTRY (admin, high_rank, lower_rank)
 *       GET  /placements/eligible    placement.manage OR placement.recordOutcome
 *       POST /placements/staff-entry placement.manage OR placement.recordOutcome
 *
 *     CLAIMS VERIFICATION DESK (admin, high_rank only)
 *       GET   /placements/queue          placement.verifyOutcome
 *       PATCH /placements/:id/approve    placement.verifyOutcome
 *       PATCH /placements/:id/reject     placement.verifyOutcome
 *
 *   The old /:studentId lookup and the generate/batch-generate/set-choices/
 *   record-outcome/verify-outcome routes are gone with the pipeline they
 *   served — staff now pick a candidate from /eligible (which already
 *   carries manebRecordId) rather than looking a student up by id.
 * [DEPENDS ON]: @/lib/verifyAuth, @/server/middleware/verifyPermission,
 *   @/server/lib/sendError, @/server/services/placementService,
 *   @shared/schemas/placement
 */
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission, requireAnyPermission } from '@/server/middleware/verifyPermission'
import { createRateLimiter } from '@/lib/ratelimit'
import { sendError } from '@/server/lib/sendError'
import * as placementService from '@/server/services/placementService'
import { explainRecommendation } from '@/server/services/placementAdvisoryAIService'
import {
  StaffPlacementEntrySchema,
  StudentClaimSchema,
  RejectClaimSchema,
  AdvisoryCheckSchema,
  ExplainRecommendationSchema,
} from '@shared/schemas/placement'

export const placementsRouter = Router()

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { status: 400 })
}

function getSingleRouteParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

// ─────────────────────────────────────────────────────────
//  STUDENT SELF-SERVICE — Student Claim Portal
// ─────────────────────────────────────────────────────────

placementsRouter.get(
  '/me',
  verifyAuth,
  requirePermission('placement.viewOwn'),
  async (req, res) => {
    try {
      res.json(await placementService.getMyPlacement(req.user!.uid))
    } catch (err) {
      sendError(res, err, { tags: { module: 'placements' } })
    }
  }
)

placementsRouter.post(
  '/me/claim',
  verifyAuth,
  requirePermission('placement.recordOwnChoice'),
  async (req, res) => {
    const parsed = StudentClaimSchema.safeParse(req.body)
    if (!parsed.success) {
      return sendError(res, badRequest(parsed.error.errors[0]?.message ?? 'Invalid claim.'))
    }
    try {
      res.status(201).json(await placementService.submitClaim(req.user!.uid, parsed.data))
    } catch (err) {
      sendError(res, err, { tags: { module: 'placements' } })
    }
  }
)

// ─────────────────────────────────────────────────────────
//  MSCE ADVISORY — self-service calculator, all roles
// ─────────────────────────────────────────────────────────
// Not gated by any student record or placement status — anyone can run
// grades through it, including staff helping a student in person.

placementsRouter.post(
  '/advisory',
  verifyAuth,
  requirePermission('placement.view'),
  async (req, res) => {
    const parsed = AdvisoryCheckSchema.safeParse(req.body)
    if (!parsed.success) {
      return sendError(res, badRequest(parsed.error.errors[0]?.message ?? 'Invalid grades.'))
    }
    try {
      const grades: Record<string, number> = {}
      for (const g of parsed.data.grades) grades[g.subject] = g.grade
      res.json(placementService.advise(grades, parsed.data.programmes))
    } catch (err) {
      sendError(res, err, { tags: { module: 'placements' } })
    }
  }
)

// ─────────────────────────────────────────────────────────
//  AI EXPLANATION (optional, additive — Gemini API layer)
// ─────────────────────────────────────────────────────────
// Same permission as the calculator itself (open to everyone). The 'ai'
// rate-limit tier is deliberately tighter than the app's standard tier —
// see lib/ratelimit.ts — because the shared free-tier Gemini quota is far
// smaller than this app's own request budget. Recomputes eligibility fresh
// from `grades` server-side before it ever reaches the model; never trusts
// anything the client claims the verdict already is.

placementsRouter.post(
  '/advisory/explain',
  verifyAuth,
  requirePermission('placement.view'),
  createRateLimiter('ai'),
  async (req, res) => {
    const parsed = ExplainRecommendationSchema.safeParse(req.body)
    if (!parsed.success) {
      return sendError(res, badRequest(parsed.error.errors[0]?.message ?? 'Invalid request.'))
    }
    try {
      const grades: Record<string, number> = {}
      for (const g of parsed.data.grades) grades[g.subject] = g.grade
      const result = await explainRecommendation({
        grades,
        universityId: parsed.data.universityId,
        programmeId: parsed.data.programmeId,
        question: parsed.data.question,
      })
      res.json(result)
    } catch (err) {
      sendError(res, err, { tags: { module: 'placements' } })
    }
  }
)

// ─────────────────────────────────────────────────────────
//  PLACEMENT REGISTRY & ANALYTICS — everyone
// ─────────────────────────────────────────────────────────

placementsRouter.get(
  '/registry',
  verifyAuth,
  requirePermission('placement.view'),
  async (req, res) => {
    try {
      const academicYear =
        typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined
      res.json(await placementService.listConfirmedPlacements({ academicYear }))
    } catch (err) {
      sendError(res, err, { tags: { module: 'placements' } })
    }
  }
)

placementsRouter.get(
  '/catalogue',
  verifyAuth,
  requireAnyPermission(['placement.view', 'placement.viewOwn']),
  (_req, res) => {
    res.json(placementService.getCatalogue())
  }
)

// ─────────────────────────────────────────────────────────
//  STAFF PLACEMENT ENTRY
// ─────────────────────────────────────────────────────────

placementsRouter.get(
  '/eligible',
  verifyAuth,
  requireAnyPermission(['placement.manage', 'placement.recordOutcome']),
  async (req, res) => {
    const academicYear =
      typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined
    if (!academicYear)
      return sendError(res, badRequest('academicYear query parameter is required.'))
    try {
      res.json(await placementService.listGraduatingCohort(academicYear))
    } catch (err) {
      sendError(res, err, { tags: { module: 'placements' } })
    }
  }
)

placementsRouter.post(
  '/staff-entry',
  verifyAuth,
  requireAnyPermission(['placement.manage', 'placement.recordOutcome']),
  async (req, res) => {
    const parsed = StaffPlacementEntrySchema.safeParse(req.body)
    if (!parsed.success) {
      return sendError(
        res,
        badRequest(parsed.error.errors[0]?.message ?? 'Invalid placement entry.')
      )
    }
    try {
      const updated = await placementService.recordStaffPlacement(
        parsed.data,
        req.user!.uid,
        req.user!.role
      )
      res.status(201).json(updated)
    } catch (err) {
      sendError(res, err, { tags: { module: 'placements' } })
    }
  }
)

// ─────────────────────────────────────────────────────────
//  CLAIMS VERIFICATION DESK
// ─────────────────────────────────────────────────────────

placementsRouter.get(
  '/queue',
  verifyAuth,
  requirePermission('placement.verifyOutcome'),
  async (req, res) => {
    try {
      const academicYear =
        typeof req.query.academicYear === 'string' ? req.query.academicYear : undefined
      res.json(await placementService.listClaimsQueue({ academicYear }))
    } catch (err) {
      sendError(res, err, { tags: { module: 'placements' } })
    }
  }
)

placementsRouter.patch(
  '/:id/approve',
  verifyAuth,
  requirePermission('placement.verifyOutcome'),
  async (req, res) => {
    const claimId = getSingleRouteParam(req.params.id)
    if (!claimId) return sendError(res, badRequest('Claim id is required.'))

    try {
      res.json(await placementService.approveClaim(claimId, req.user!.uid, req.user!.role))
    } catch (err) {
      sendError(res, err, { tags: { module: 'placements' } })
    }
  }
)

placementsRouter.patch(
  '/:id/reject',
  verifyAuth,
  requirePermission('placement.verifyOutcome'),
  async (req, res) => {
    const claimId = getSingleRouteParam(req.params.id)
    if (!claimId) return sendError(res, badRequest('Claim id is required.'))

    const parsed = RejectClaimSchema.safeParse(req.body)
    if (!parsed.success) {
      return sendError(
        res,
        badRequest(parsed.error.errors[0]?.message ?? 'A rejection reason is required.')
      )
    }
    try {
      res.json(
        await placementService.rejectClaim(claimId, parsed.data, req.user!.uid, req.user!.role)
      )
    } catch (err) {
      sendError(res, err, { tags: { module: 'placements' } })
    }
  }
)
