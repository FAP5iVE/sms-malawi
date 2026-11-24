/**
 * apps/web/src/server/routes/signatures.ts
 *
 * [CHANGE TYPE]: NEW (phase 17, digital signature)
 * [PURPOSE]: "My signature" for staff, and the head's switch for using signatures on documents.
 *   GET    /signatures/me         whether I have a signature, when it was saved, and the school switch
 *   PUT    /signatures/me         save or replace mine (raw PNG or JPG body, up to 200 KB)
 *   DELETE /signatures/me         remove mine
 *   PUT    /signatures/settings   admin or head: use signatures on documents, on or off
 *   No route returns the image. The server only reads it when it builds a PDF (signatureService).
 *
 * Mounted in api-app.ts: app.use('/signatures', verifyAuth, signaturesRouter)
 */
import 'server-only'

import express, { Router } from 'express'
import { z } from 'zod'
import { rateLimit } from '@/lib/ratelimit'
import { requireRole } from '@/lib/verifyAuth'
import { sendError } from '@/server/lib/sendError'
import * as signatureService from '@/server/services/signatureService'
import { SignatureError } from '@/server/services/signatureService'
import { SIGNATURE_MAX_BYTES, SIGNATURE_TYPES } from '@shared/constants/signature'

export const signaturesRouter = Router()

/** Everyone who can produce or approve a document. Students and parents have no signature. */
const SIGNERS = ['admin', 'high_rank', 'finance', 'academic', 'hr', 'exam_officer', 'lower_rank', 'library'] as const

const fail = (res: express.Response, err: unknown): void => {
  if (err instanceof SignatureError) { res.status(400).json({ error: err.message }); return }
  sendError(res, err, { tags: { module: 'signatures' } })
}

signaturesRouter.get('/me', requireRole([...SIGNERS]), async (req, res) => {
  try { res.json(await signatureService.getStatus(req.user!.uid)) } catch (err) { fail(res, err) }
})

signaturesRouter.put(
  '/me',
  requireRole([...SIGNERS]),
  rateLimit('upload-ticket'),
  express.raw({ type: [...SIGNATURE_TYPES], limit: SIGNATURE_MAX_BYTES + 1024 }),
  async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new SignatureError('Use a PNG or JPG image.')
      res.json(await signatureService.saveSignature(req.user!.uid, req.user!.role, req.body))
    } catch (err) { fail(res, err) }
  },
)

signaturesRouter.delete('/me', requireRole([...SIGNERS]), async (req, res) => {
  try { res.json(await signatureService.removeSignature(req.user!.uid, req.user!.role)) } catch (err) { fail(res, err) }
})

const SettingsBody = z.object({ useOnDocuments: z.boolean() })

signaturesRouter.put('/settings', requireRole(['admin', 'high_rank']), async (req, res) => {
  const parsed = SettingsBody.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Choose on or off.' }); return }
  try {
    await signatureService.setUsingSignatures(parsed.data.useOnDocuments, req.user!.uid, req.user!.role)
    res.json(await signatureService.getStatus(req.user!.uid))
  } catch (err) { fail(res, err) }
})
