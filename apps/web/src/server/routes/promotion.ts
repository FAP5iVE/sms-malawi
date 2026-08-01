/**
 * apps/web/src/server/routes/promotion.ts — Phase D1
 *
 * Routes:
 *   GET  /promotion/:year          — fetch existing promotion run status
 *   POST /promotion/:year/preview  — generate (or refresh) preview
 *   POST /promotion/:year/commit   — commit promotion (exam_officer | admin)
 *
 * Mounted in api-app.ts:
 *   app.use('/promotion', requireRole(['admin','exam_officer','high_rank']), promotionRouter)
 */

import 'server-only'
import { Router }             from 'express'
import { z }                  from 'zod'
import {
  runPromotion,
  commitPromotion,
  getPromotionRun,
  getPromotionEligibility,
}                             from '@/server/services/promotionService'
import { requireRole }        from '@/lib/verifyAuth'
import { requirePermission }  from '@/server/middleware/verifyPermission'

export const promotionRouter = Router()

const YearParam = z.string().regex(/^\d{4}\/\d{4}$/, 'Format must be YYYY/YYYY')

// ── GET /promotion/:year ─────────────────────────────────────────────────────
promotionRouter.get('/:year', async (req, res) => {
  const parse = YearParam.safeParse(decodeURIComponent(String(req.params.year)))
  if (!parse.success) return res.status(400).json({ error: parse.error.issues[0]?.message })

  const run = await getPromotionRun(parse.data)
  if (!run) return res.status(404).json({ error: 'No promotion run found for this year' })
  return res.json(run)
})

// ── GET /promotion/:year/eligibility ─────────────────────────────────────────
// PR-2: whether a promotion run is currently allowed (Term 3 + all Term 3
// end-of-term results released) — lets the UI disable the run/commit controls
// and explain why. Readable by the same roles the router mount allows.
promotionRouter.get('/:year/eligibility', async (req, res) => {
  const parse = YearParam.safeParse(decodeURIComponent(String(req.params.year)))
  if (!parse.success) return res.status(400).json({ error: parse.error.issues[0]?.message })
  return res.json(await getPromotionEligibility(parse.data))
})

// ── POST /promotion/:year/preview ────────────────────────────────────────────
promotionRouter.post(
  '/:year/preview',
  // AC-1: a preview is read-only (dry run) — admin may view it. high_rank
  // added for parity with the router mount + exam.runPromotionEngine holders.
  requireRole(['admin', 'exam_officer', 'high_rank']),
  async (req, res) => {
    const parse = YearParam.safeParse(decodeURIComponent(String(req.params.year)))
    if (!parse.success) return res.status(400).json({ error: parse.error.issues[0]?.message })

    const preview = await runPromotion(parse.data, req.user!.uid, true)
    return res.json(preview)
  },
)

// ── POST /promotion/:year/commit ─────────────────────────────────────────────
promotionRouter.post(
  '/:year/commit',
  // AC-1: committing promotion writes results (promotes students) — NOT an
  // admin action. Gated on exam.runPromotionEngine (high_rank + exam_officer).
  requirePermission('exam.runPromotionEngine'),
  async (req, res) => {
    const parse = YearParam.safeParse(decodeURIComponent(String(req.params.year)))
    if (!parse.success) return res.status(400).json({ error: parse.error.issues[0]?.message })

    const result = await commitPromotion(parse.data, req.user!.uid)
    return res.json(result)
  },
)