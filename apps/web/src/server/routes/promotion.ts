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
}                             from '@/server/services/promotionService'
import { requireRole }        from '@/lib/verifyAuth'

export const promotionRouter = Router()

const YearParam = z.string().regex(/^\d{4}\/\d{4}$/, 'Format must be YYYY/YYYY')

// ── GET /promotion/:year ─────────────────────────────────────────────────────
promotionRouter.get('/:year', async (req, res) => {
  const parse = YearParam.safeParse(decodeURIComponent(req.params.year!))
  if (!parse.success) return res.status(400).json({ error: parse.error.issues[0]?.message })

  const run = await getPromotionRun(parse.data)
  if (!run) return res.status(404).json({ error: 'No promotion run found for this year' })
  return res.json(run)
})

// ── POST /promotion/:year/preview ────────────────────────────────────────────
promotionRouter.post(
  '/:year/preview',
  requireRole(['admin', 'exam_officer']),
  async (req, res) => {
    const parse = YearParam.safeParse(decodeURIComponent(req.params.year!))
    if (!parse.success) return res.status(400).json({ error: parse.error.issues[0]?.message })

    const preview = await runPromotion(parse.data, req.user!.uid, true)
    return res.json(preview)
  },
)

// ── POST /promotion/:year/commit ─────────────────────────────────────────────
promotionRouter.post(
  '/:year/commit',
  requireRole(['admin', 'exam_officer']),
  async (req, res) => {
    const parse = YearParam.safeParse(decodeURIComponent(req.params.year!))
    if (!parse.success) return res.status(400).json({ error: parse.error.issues[0]?.message })

    const result = await commitPromotion(parse.data, req.user!.uid)
    return res.json(result)
  },
)