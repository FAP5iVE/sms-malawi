/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/routes/approvals.ts
 * [PURPOSE]: HTTP surface for the Approvals Hub (/approvals). Every route is
 *   authenticated only — there is deliberately no single permission gate,
 *   because visibility and every decision are decided per request TYPE inside
 *   approvalHubService, using the same gates as each module's own routes:
 *   a viewer sees the modules they can review plus their own submissions.
 *
 *     GET   /approvals                       list (scope/status/module/search/dates/page)
 *     GET   /approvals/summary               tab counts + per-module pending
 *     GET   /approvals/badge                 awaiting-my-review count (sidebar)
 *     GET   /approvals/:source/:id           one request, with viewer capabilities
 *     POST  /approvals/:source/:id/decision  approve | reject | return | cancel
 *     POST  /approvals/bulk                  approve | reject | return many
 *
 * [DEPENDS ON]: approvalHubService, @shared/schemas/approvals
 */
import 'server-only'

import { Router, type Request, type Response } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { sendError } from '@/server/lib/sendError'
import * as hub from '@/server/services/approvalHubService'
import { isApprovalSource } from '@shared/constants/approvals'
import {
  ApprovalBulkBodySchema,
  ApprovalDecisionBodySchema,
  ApprovalListQuerySchema,
  ApprovalSummaryQuerySchema,
} from '@shared/schemas/approvals'

export const approvalsRouter = Router()

approvalsRouter.use(verifyAuth)

function actorOf(req: Request) {
  const { user } = req
  if (!user) return null
  return { uid: user.uid, role: user.role }
}

approvalsRouter.get('/', async (req: Request, res: Response) => {
  const actor = actorOf(req)
  if (!actor) return res.status(401).json({ error: 'Not authenticated.' })
  const parsed = ApprovalListQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  try {
    return res.json(await hub.listApprovals(parsed.data, actor))
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'approvals', route: 'list' } })
  }
})

approvalsRouter.get('/summary', async (req: Request, res: Response) => {
  const actor = actorOf(req)
  if (!actor) return res.status(401).json({ error: 'Not authenticated.' })
  const parsed = ApprovalSummaryQuerySchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  try {
    return res.json(await hub.getSummary(parsed.data.scope, actor))
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'approvals', route: 'summary' } })
  }
})

approvalsRouter.get('/badge', async (req: Request, res: Response) => {
  const actor = actorOf(req)
  if (!actor) return res.status(401).json({ error: 'Not authenticated.' })
  try {
    return res.json({ awaitingMyReview: await hub.getBadgeCount(actor) })
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'approvals', route: 'badge' } })
  }
})

// Registered before /:source/:id so "bulk" is never read as a source key.
approvalsRouter.post('/bulk', async (req: Request, res: Response) => {
  const actor = actorOf(req)
  if (!actor) return res.status(401).json({ error: 'Not authenticated.' })
  const parsed = ApprovalBulkBodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  try {
    const { action, notes, paidImmediately, items } = parsed.data
    return res.json(
      await hub.decideMany(items, action, actor, {
        ...(notes ? { notes } : {}),
        ...(paidImmediately !== undefined ? { paidImmediately } : {}),
      }),
    )
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'approvals', route: 'bulk' } })
  }
})

approvalsRouter.get('/:source/:id', async (req: Request, res: Response) => {
  const actor = actorOf(req)
  if (!actor) return res.status(401).json({ error: 'Not authenticated.' })
  const source = String(req.params['source'] ?? '')
  if (!isApprovalSource(source)) return res.status(404).json({ error: 'Unknown approval type.' })
  try {
    return res.json(await hub.getApproval(source, String(req.params['id'] ?? ''), actor))
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'approvals', route: 'detail' } })
  }
})

approvalsRouter.post('/:source/:id/decision', async (req: Request, res: Response) => {
  const actor = actorOf(req)
  if (!actor) return res.status(401).json({ error: 'Not authenticated.' })
  const source = String(req.params['source'] ?? '')
  if (!isApprovalSource(source)) return res.status(404).json({ error: 'Unknown approval type.' })
  const parsed = ApprovalDecisionBodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
  try {
    const { action, notes, paidImmediately } = parsed.data
    const result = await hub.decide(source, String(req.params['id'] ?? ''), action, actor, {
      ...(notes ? { notes } : {}),
      ...(paidImmediately !== undefined ? { paidImmediately } : {}),
    })
    return res.json({ ok: true, ...result })
  } catch (err: unknown) {
    return sendError(res, err, { defaultStatus: 400, tags: { module: 'approvals', route: 'decision' } })
  }
})
