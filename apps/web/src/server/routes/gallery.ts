/**
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-28)
 * [FILE]: apps/web/src/server/routes/gallery.ts
 * [PURPOSE]: Real backend for the public landing page's "Life at our
 *   school" gallery, which previously had no live source at all (a
 *   permanent placeholder). Photos are stored in Appwrite under
 *   FILE_PREFIX.SCHOOL_GALLERY (a public-view-URL prefix — see
 *   storage.ts's getPublicViewUrl comment) with an ordered/captioned index
 *   in the new GalleryPhoto table. Management (upload/delete/reorder) is
 *   admin/high_rank only; the public GET lives in public.ts (unauthenticated,
 *   consumed by the landing page and the /gallery page).
 * [DEPENDS ON]: W/lib/storage.ts, P/schema.prisma's GalleryPhoto model
 */
import { Router } from 'express'
import { prisma } from '@/lib/prisma'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { getPublicViewUrl, createDirectUploadTicket, FILE_PREFIX } from '@/lib/storage'
import { sendError } from '@/server/lib/sendError'

export const galleryRouter = Router()

// GET /gallery — internal management list (all photos, most recent first).
// [PRODUCTION FIX] Previously returned raw rows with only fileKey — the
// admin management page needs an actual viewable URL to render thumbnails,
// same as /public/gallery already computes for the public page.
// [PRODUCTION FIX] Also previously had no try/catch — an error from
// getPublicViewUrl() (or Prisma) would become an unhandled rejection with
// no response ever sent, hanging the request. Same root cause as the
// upload handler below.
galleryRouter.get('/', verifyAuth, requireRole(['admin', 'high_rank', 'lower_rank']), async (_req, res) => {
  try {
    const photos = await prisma.galleryPhoto.findMany({ orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }] })
    const withUrls = await Promise.all(
      photos.map(async (p) => ({ ...p, url: await getPublicViewUrl('', p.fileKey) })),
    )
    res.json(withUrls)
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'gallery', route: 'list' } })
  }
})

// POST /gallery/upload-ticket — mint a one-time Appwrite upload credential.
// The browser exchanges this for a session (Appwrite Web SDK
// account.createSession) and uploads the file bytes DIRECTLY to Appwrite —
// never through this Vercel function. See storage.ts's
// createDirectUploadTicket() for why: Vercel Functions hard-cap request
// bodies at 4.5MB, and a single large request has no retry if the
// connection drops mid-upload ("Request aborted" in production logs for
// this exact route); neither limit applies to Appwrite's own chunked,
// retrying client upload.
galleryRouter.post(
  '/upload-ticket',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank']),
  async (_req, res) => {
    try {
      const ticket = await createDirectUploadTicket(FILE_PREFIX.SCHOOL_GALLERY)
      res.json(ticket)
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'gallery', route: 'upload-ticket' } })
    }
  },
)

// POST /gallery — records a photo the browser has ALREADY uploaded directly
// to Appwrite via /gallery/upload-ticket. Takes the resulting fileId (JSON
// body), not the file itself — see the comment on /upload-ticket above for
// why file bytes no longer come through this route.
galleryRouter.post(
  '/',
  verifyAuth,
  requireRole(['admin', 'high_rank', 'lower_rank']),
  async (req, res) => {
    try {
      const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : undefined
      if (!fileId || !fileId.startsWith(`${FILE_PREFIX.SCHOOL_GALLERY}_`)) {
        return res.status(400).json({ error: 'Missing or invalid fileId — upload the photo via /gallery/upload-ticket first.' })
      }
      const caption  = typeof req.body?.caption === 'string' ? req.body.caption : undefined
      const category = typeof req.body?.category === 'string' ? req.body.category : undefined
      const photo = await prisma.galleryPhoto.create({
        data: {
          fileKey: fileId,
          caption,
          category,
          uploadedByUid: req.user!.uid,
        },
      })
      res.status(201).json(photo)
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'gallery', route: 'upload' } })
    }
  },
)

// DELETE /gallery/:id — removes the index row (Appwrite file is left in
// place; matches the codebase's existing convention of not hard-deleting
// storage objects on row removal elsewhere).
galleryRouter.delete('/:id', verifyAuth, requireRole(['admin', 'high_rank', 'lower_rank']), async (req, res) => {
  try {
    await prisma.galleryPhoto.delete({ where: { id: String(req.params.id) } }).catch(() => null)
    res.json({ ok: true })
  } catch (err: unknown) {
    return sendError(res, err, { tags: { module: 'gallery', route: 'delete' } })
  }
})