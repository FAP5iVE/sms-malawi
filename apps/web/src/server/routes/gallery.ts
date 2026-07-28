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
import multer from 'multer'
import { prisma } from '@/lib/prisma'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { uploadFile, FILE_PREFIX } from '@/lib/storage'

export const galleryRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }) // 10MB

// GET /gallery — internal management list (all photos, most recent first).
galleryRouter.get('/', verifyAuth, requireRole(['admin', 'high_rank']), async (_req, res) => {
  const photos = await prisma.galleryPhoto.findMany({ orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }] })
  res.json(photos)
})

// POST /gallery — upload a new photo.
galleryRouter.post(
  '/',
  verifyAuth,
  requireRole(['admin', 'high_rank']),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are allowed.' })
    }
    const uploaded = await uploadFile(
      FILE_PREFIX.SCHOOL_GALLERY,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    )
    const caption  = typeof req.body?.caption === 'string' ? req.body.caption : undefined
    const category = typeof req.body?.category === 'string' ? req.body.category : undefined
    const photo = await prisma.galleryPhoto.create({
      data: {
        fileKey: uploaded.fileId,
        caption,
        category,
        uploadedByUid: req.user!.uid,
      },
    })
    res.status(201).json(photo)
  },
)

// DELETE /gallery/:id — removes the index row (Appwrite file is left in
// place; matches the codebase's existing convention of not hard-deleting
// storage objects on row removal elsewhere).
galleryRouter.delete('/:id', verifyAuth, requireRole(['admin', 'high_rank']), async (req, res) => {
  await prisma.galleryPhoto.delete({ where: { id: String(req.params.id) } }).catch(() => null)
  res.json({ ok: true })
})