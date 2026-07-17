/**
 * apps/web/src/server/routes/pendingActions.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R3 — Gateway Hardening
 * [PURPOSE]: POST /expire-stale sat behind this router's own top-level
 *   `pendingActionsRouter.use(verifyAuth)` (a Firebase-ID-token check),
 *   which unconditionally rejected Vercel's CRON_SECRET-bearing scheduler
 *   request with a 401 before the handler's own isCron branch ever ran —
 *   pending actions never expired in production as a direct result of this
 *   ordering. The route is now registered BEFORE the router-level
 *   verifyAuth mount, with its own composite verifyCronOrAdmin middleware:
 *   a valid CRON_SECRET bearer token grants access with no Firebase token
 *   at all; anything else falls through to a real verifyAuth + admin-role
 *   check (fail-closed the same way the five real cron route files are —
 *   an unset CRON_SECRET can never match any bearer token, including the
 *   literal string "Bearer undefined"). Every other route in this file is
 *   unchanged and continues to sit behind the router-level verifyAuth.
 * [DEPENDS ON]: none
 */
import 'server-only'

import { Router, type Request, type Response, type NextFunction } from 'express'
import { verifyAuth, requireRole }              from '@/lib/verifyAuth'
import { requireAnyPermission }                 from '@/server/middleware/verifyPermission'
import * as pendingActionService                from '@/server/services/pendingActionService'
import type { PendingActionStatus }             from '@prisma/client'
import type { PendingActionType }               from '@/server/services/pendingActionService'

export const pendingActionsRouter = Router()

/**
 * Grants access to either:
 *   - a caller presenting the exact CRON_SECRET bearer token (Vercel's
 *     scheduler — no Firebase ID token involved at all), or
 *   - a caller with a verified Firebase session holding the admin role.
 * Fail-closed: if CRON_SECRET is unset, the left side of the && below is
 * falsy, so no bearer token — including the literal string
 * "Bearer undefined" — can ever match it; every request then falls through
 * to the real Firebase-auth + admin-role check.
 */
async function verifyCronOrAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    next()
    return
  }
  await verifyAuth(req, res, () => requireRole(['admin'])(req, res, next))
}

// ─────────────────────────────────────────────────────────
//  POST /pending-actions/expire-stale
//  Mark expired actions. Called by nightly cron.
//  Registered ahead of the router-level verifyAuth mount below so a
//  CRON_SECRET-bearing request never gets rejected by a Firebase-token
//  check it was never meant to pass — see file header comment.
// ─────────────────────────────────────────────────────────

pendingActionsRouter.post('/expire-stale', verifyCronOrAdmin, async (_req: Request, res: Response) => {
  const count = await pendingActionService.expireStale()
  res.json({ expired: count, ts: new Date().toISOString() })
})

// All routes below require authentication
pendingActionsRouter.use(verifyAuth)

// ─────────────────────────────────────────────────────────
//  GET /pending-actions
//  List with filters. Admins and high_rank see all.
//  Other roles see only their own submitted actions.
// ─────────────────────────────────────────────────────────

pendingActionsRouter.get(
  '/',
  requireAnyPermission(['student.approvePendingAction', 'class.approvePendingAction']),
  async (req: Request, res: Response) => {
    const { user } = req
    if (!user) { res.status(401).json({ error: 'Not authenticated.' }); return }

    const isReviewer = pendingActionService.canReview(user.role)

    const {
      status,
      entityType,
      action,
      page,
      pageSize,
      dateFrom,
      dateTo,
    } = req.query

    const result = await pendingActionService.query({
      status:          status ? (String(status) as PendingActionStatus | 'ALL') : 'ALL',
      entityType:      entityType ? String(entityType) : undefined,
      requestedByUid:  isReviewer ? undefined : user.uid,   // Non-reviewers see only own
      action:          action     ? String(action)     : undefined,
      page:            page       ? parseInt(String(page), 10) : 1,
      pageSize:        pageSize   ? Math.min(100, parseInt(String(pageSize), 10)) : 25,
      dateFrom:        dateFrom   ? new Date(String(dateFrom)) : undefined,
      dateTo:          dateTo     ? new Date(String(dateTo))   : undefined,
    })

    res.json(result)
  }
)

// ─────────────────────────────────────────────────────────
//  GET /pending-actions/counts
//  Count breakdown for dashboard badge.
// ─────────────────────────────────────────────────────────

pendingActionsRouter.get(
  '/counts',
  requireAnyPermission(['student.approvePendingAction', 'class.approvePendingAction']),
  async (_req: Request, res: Response) => {
    const counts = await pendingActionService.getCounts()
    res.json(counts)
  }
)

// ─────────────────────────────────────────────────────────
//  GET /pending-actions/entity/:type/:id
//  All pending actions for a specific entity.
// ─────────────────────────────────────────────────────────

pendingActionsRouter.get(
  '/entity/:type/:id',
  async (req: Request, res: Response) => {
    const type = String(req.params['type'] ?? '')
const id   = String(req.params['id']   ?? '')

    if (!type || !id) {
      res.status(400).json({ error: 'Entity type and ID are required.' })
      return
    }

    const rows = await pendingActionService.getPendingForEntity(type, id)
    res.json({ entityType: type, entityId: id, actions: rows, count: rows.length })
  }
)

// ─────────────────────────────────────────────────────────
//  GET /pending-actions/:id
//  Single pending action by ID.
// ─────────────────────────────────────────────────────────

pendingActionsRouter.get('/:id', async (req: Request, res: Response) => {
  const { user } = req
  if (!user) { res.status(401).json({ error: 'Not authenticated.' }); return }

  const row = await pendingActionService.getById(String(req.params['id'] ?? ''))

  if (!row) {
    res.status(404).json({ error: 'Pending action not found.' })
    return
  }

  // Non-reviewers may only see their own
  const isReviewer = pendingActionService.canReview(user.role)
  if (!isReviewer && row.requestedByUid !== user.uid) {
    res.status(403).json({ error: 'You do not have access to this pending action.' })
    return
  }

  res.json(row)
})

// ─────────────────────────────────────────────────────────
//  POST /pending-actions
//  Create a new pending action (submitted by lower_rank / academic).
// ─────────────────────────────────────────────────────────

pendingActionsRouter.post('/', async (req: Request, res: Response) => {
  const { user } = req
  if (!user) { res.status(401).json({ error: 'Not authenticated.' }); return }

  // Reviewers (admin / high_rank) should never need to submit a pending action —
  // they can perform the operation directly.
  if (pendingActionService.canReview(user.role)) {
    res.status(400).json({
      error: 'Your role does not require approval for this action. Perform it directly.',
    })
    return
  }

  const { entityType, entityId, action, description, targetState, expiresAt } =
    req.body as {
      entityType?:  string
      entityId?:    string
      action?:      PendingActionType
      description?: string
      targetState?: Record<string, unknown>
      expiresAt?:   string
    }

  if (!entityType || !entityId || !action || !description) {
    res.status(400).json({
      error: 'entityType, entityId, action, and description are required.',
    })
    return
  }

  if (!pendingActionService.PENDING_ACTION_TYPES.includes(action as PendingActionType)) {
    res.status(400).json({ error: `Unknown action type: "${action}".` })
    return
  }

  // Prevent duplicate pending actions for the same entity + action
  const alreadyPending = await pendingActionService.hasPendingAction(
    entityType, entityId, action
  )
  if (alreadyPending) {
    res.status(409).json({
      error: 'A pending action of this type already exists for this entity. Please wait for it to be reviewed.',
    })
    return
  }

  const row = await pendingActionService.create({
    entityType,
    entityId,
    action,
    description,
    requestedByUid:  user.uid,
    requestedByRole: user.role,
    targetState,
    expiresAt,
  })

  res.status(201).json(row)
})

// ─────────────────────────────────────────────────────────
//  PATCH /pending-actions/:id/approve
//  Approve — admin and high_rank only.
// ─────────────────────────────────────────────────────────

pendingActionsRouter.patch(
  '/:id/approve',
  requireAnyPermission(['student.approvePendingAction', 'class.approvePendingAction']),
  async (req: Request, res: Response) => {
    const { user } = req
    if (!user) { res.status(401).json({ error: 'Not authenticated.' }); return }

    const { notes } = req.body as { notes?: string }
    const id        = String(req.params['id'] ?? '')

    if (!id) {
      res.status(400).json({ error: 'Pending action ID is required.' })
      return
    }

    const row = await pendingActionService.approve({
      id,
      reviewedByUid:  user.uid,
      reviewedByRole: user.role,
      notes,
    })

    res.json(row)
  }
)

// ─────────────────────────────────────────────────────────
//  PATCH /pending-actions/:id/reject
//  Reject — admin and high_rank only.
// ─────────────────────────────────────────────────────────

pendingActionsRouter.patch(
  '/:id/reject',
  requireAnyPermission(['student.approvePendingAction', 'class.approvePendingAction']),
  async (req: Request, res: Response) => {
    const { user } = req
    if (!user) { res.status(401).json({ error: 'Not authenticated.' }); return }

    const { notes } = req.body as { notes?: string }
    const id = String(req.params['id'] ?? '')

    if (!id) {
      res.status(400).json({ error: 'Pending action ID is required.' })
      return
    }

    const row = await pendingActionService.reject({
      id,
      reviewedByUid:  user.uid,
      reviewedByRole: user.role,
      notes,
    })

    res.json(row)
  }
)

// ─────────────────────────────────────────────────────────
//  PATCH /pending-actions/:id/cancel
//  Cancel — requester or reviewer.
// ─────────────────────────────────────────────────────────

pendingActionsRouter.patch('/:id/cancel', async (req: Request, res: Response) => {
  const { user } = req
  if (!user) { res.status(401).json({ error: 'Not authenticated.' }); return }

  const id = String(req.params['id'] ?? '')
  if (!id) {
    res.status(400).json({ error: 'Pending action ID is required.' })
    return
  }

  const row = await pendingActionService.cancel(id, user.uid, user.role)
  res.json(row)
})