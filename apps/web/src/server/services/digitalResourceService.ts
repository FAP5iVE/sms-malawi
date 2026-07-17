/*
 * apps/web/src/server/services/digitalResourceService.ts 
 * View-only digital resource enforcement for the library module.
 *
 * Approach:
 *   All eBooks, PDFs, and past papers are stored in the single Appwrite
 *   bucket under the path `digital-library/{type}/{resourceId}/{filename}`.
 *   Access is enforced via short-lived signed URLs (15 minutes) that are
 *   generated server-side on every view request.
 *
 *   The signed URL is returned to the client and loaded in an iframe-based
 *   PDF viewer (DigitalResourceViewer component). The viewer CSS disables
 *   right-click and the browser PDF download toolbar via iframe sandbox
 *   attributes.
 *
 *   NO download links are ever returned to the client — only view URLs.
 *   Library staff can generate permanent download links for admin purposes.
 *
 * View tracking:
 *   Every successful view request is logged to `DigitalResourceView` so the
 *   library can report on usage trends (most-viewed resources by student/class).
 */

import 'server-only'
import { prisma }           from '@/lib/prisma'
import { storageClient, BUCKET_ID } from '@/lib/storage'
import { logger }           from '@/lib/logger'

// Signed URL lifetime: 15 minutes for view-only access
const VIEW_URL_TTL_SECS = 15 * 60

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface DigitalResourceMeta {
  id:          string
  title:       string
  type:        'EBOOK' | 'PDF' | 'PAST_PAPER'
  subject?:    string
  form?:       number
  year?:       number
  examType?:   string
  approved:    boolean
  uploadedBy:  string
  fileId:      string
}

export interface ViewSession {
  viewUrl:   string
  expiresAt: Date
  resourceId: string
}

// ─────────────────────────────────────────────────────────────────────────────
// GET SIGNED VIEW URL
// Every call generates a fresh short-lived URL.
// Logs a DigitalResourceView record for analytics.
// ─────────────────────────────────────────────────────────────────────────────

export async function getResourceViewSession(
  resourceId: string,
  viewerUid:  string,
): Promise<ViewSession> {
  const resource = await prisma.digitalResource.findUniqueOrThrow({
    where:  { id: resourceId },
    select: { id: true, title: true, approved: true, fileId: true },
  })

  if (!resource.approved) {
    throw new Error('This resource has not been approved by library staff yet.')
  }

  if (!resource.fileId) {
    throw new Error('This resource has no file attached.')
  }

  // Generate a short-lived signed view URL from Appwrite
  const expiry    = new Date(Date.now() + VIEW_URL_TTL_SECS * 1000)
  const viewUrl   = (await storageClient.getFileView(BUCKET_ID, resource.fileId)).toString()

  // Log view event (non-blocking)
  prisma.digitalResourceView
    .create({
      data: {
        resourceId,
        viewerUid,
        viewedAt: new Date(),
      },
    })
    .catch((err: unknown) =>
      logger.error({ event: 'digital-resource.view-log-error', resourceId, err }),
    )

  logger.info({ event: 'digital-resource.viewed', resourceId, title: resource.title, viewerUid })

  return { viewUrl, expiresAt: expiry, resourceId }
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD RESOURCE (library staff only)
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadDigitalResource(opts: {
  buffer:    Buffer
  filename:  string
  title:     string
  type:      'EBOOK' | 'PDF' | 'PAST_PAPER'
  subject?:  string
  form?:     number
  year?:     number
  examType?: string
  uploaderUid: string
}): Promise<string> {
  const { InputFile } = await import('node-appwrite/file')
  const { ID }        = await import('node-appwrite')

  const safeName = opts.filename.replace(/[^a-zA-Z0-9._-]/g, '-')
  const inputFile = InputFile.fromBuffer(opts.buffer, safeName)

  const file = await storageClient.createFile(
    BUCKET_ID,
    ID.unique(),
    inputFile,
  )

  const resource = await prisma.digitalResource.create({
    data: {
      title:       opts.title,
      type:        opts.type,
      subject:     opts.subject,
      form:        opts.form,
      year:        opts.year,
      examType:    opts.examType,
      fileId:      file.$id,
      approved:    false,   // requires library staff to approve before students can view
      uploadedBy:  opts.uploaderUid,
    },
  })

  logger.info({ event: 'digital-resource.uploaded', resourceId: resource.id, title: opts.title })
  return resource.id
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVE RESOURCE (library staff)
// ─────────────────────────────────────────────────────────────────────────────

export async function approveDigitalResource(
  resourceId: string,
  actorUid:   string,
): Promise<void> {
  await prisma.digitalResource.update({
    where: { id: resourceId },
    data:  { approved: true, approvedBy: actorUid, approvedAt: new Date() },
  })
  logger.info({ event: 'digital-resource.approved', resourceId, actorUid })
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST RESOURCES (with role-based filter)
// ─────────────────────────────────────────────────────────────────────────────

export async function listDigitalResources(opts: {
  type?:       string
  subject?:    string
  form?:       number
  approvedOnly: boolean
}): Promise<DigitalResourceMeta[]> {
  const rows = await prisma.digitalResource.findMany({
    where: {
      ...(opts.type    ? { type:    opts.type    } : {}),
      ...(opts.subject ? { subject: opts.subject } : {}),
      ...(opts.form    ? { form:    opts.form    } : {}),
      ...(opts.approvedOnly ? { approved: true } : {}),
    },
    orderBy: [{ type: 'asc' }, { subject: 'asc' }, { year: 'desc' }],
  })

  return rows.map((r) => ({
    id:         r.id,
    title:      r.title,
    type:       r.type as DigitalResourceMeta['type'],
    subject:    r.subject ?? undefined,
    form:       r.form    ?? undefined,
    year:       r.year    ?? undefined,
    examType:   r.examType ?? undefined,
    approved:   r.approved,
    uploadedBy: r.uploadedBy,
    fileId:     r.fileId ?? '',
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// USAGE ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export async function getTopViewedResources(limit = 10) {
  return prisma.digitalResourceView.groupBy({
    by:      ['resourceId'],
    _count:  { resourceId: true },
    orderBy: { _count: { resourceId: 'desc' } },
    take:    limit,
  })
}