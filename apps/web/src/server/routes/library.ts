/*
 * apps/web/src/server/routes/library.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT (route/permission corrections; the
 *   eBook-upload multer configuration is unaffected — see R16)
 * [R-PHASE]: R12 — Library Domain & the Storage API Contract Fix
 * [PURPOSE]:
 *   1. Corrected the shared LIB_STAFF = ['admin', 'library'] constant's use
 *      on manageCatalog/issueBook/processReturn/uploadDigitalResource/
 *      approveDigitalResource — all five are held by `library` alone per
 *      PERMISSIONS_MAP.md; LIB_STAFF baked the admin over-grant into all
 *      five simultaneously. Each now gates on requirePermission() against
 *      its own real permission instead.
 *   2. Removed the redundant explicit re-listing of 'admin' in GET
 *      /stats's requireRole([...LIB_STAFF, 'admin', 'high_rank']) —
 *      LIB_STAFF already contained it.
 *   3. Added real role/permission gating to GET /, GET /:id, GET /digital,
 *      and GET /digital/:id/view — previously none of the four had any
 *      restriction beyond verifyAuth, so lower_rank (explicitly excluded
 *      from library.viewCatalog per the permission matrix) could call
 *      them freely.
 *   4. Added POST/PATCH /recommendations and POST/PATCH /fine-waivers —
 *      the two now-repaired libraryWorkflowService.ts workflows
 *      (this phase's schema-mismatch fix), permission-gated appropriately:
 *      recommendation create/list needs library.recommendResource,
 *      approve/reject needs library.approveRecommendation; fine-waiver
 *      create is self-service (verifyAuth only, matching the established
 *      "narrowing not granting" self-service pattern — see
 *      sms-erp-security's clear-password-change-flag precedent), and
 *      approve/reject needs library.waiveFine or finance.waiveFine (the
 *      permission's own doc comment: "requires finance coordination").
 *      Both route groups are registered BEFORE GET /:id — Express matches
 *      routes in registration order, and /:id would otherwise shadow
 *      /recommendations and /fine-waivers by treating either literal
 *      segment as an :id value.
 * [DEPENDS ON]: packages/shared/schemas/library.ts (the four new schemas
 *   — same phase), apps/web/src/server/services/libraryWorkflowService.ts
 *   (this phase's rewrite), packages/shared/types/permissions.ts
 *   (library.viewCatalog / .viewDigitalResources / .recommendResource /
 *   .approveRecommendation / .waiveFine, finance.waiveFine — unchanged,
 *   read directly from source this phase)
 */
import { Router } from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { requirePermission, requireAnyPermission } from '@/server/middleware/verifyPermission'
import {
  CreateBookSchema,
  UpdateBookSchema,
  IssueBorrowingSchema,
  ReturnBorrowingSchema,
  CreateDigitalResourceSchema,
  CreateRecommendationSchema,
  ReviewRecommendationSchema,
  RejectRecommendationSchema,
  CreateFineWaiverSchema,
  RejectFineWaiverSchema,
} from '@shared/schemas/library'
import * as libService from '@/server/services/libraryService'
import * as workflowService from '@/server/services/libraryWorkflowService'
import { createDirectUploadTicket, FILE_PREFIX } from '@/lib/storage'
import { sendError } from '@/server/lib/sendError'

export const libraryRouter = Router()

const LIB_STAFF = ['admin', 'library'] as const

// ── CATALOG (static/collection routes first) ──
libraryRouter.get('/', verifyAuth, requirePermission('library.viewCatalog'),
  async (req, res) => {
    const { category, search, available, publisher, year, sortBy, sortDir } = req.query as Record<string, string>
    return res.json(await libService.listBooks({
      category, search, available: available === 'true',
      publisher, year: year ? Number(year) : undefined,
      sortBy: sortBy as never, sortDir: sortDir as never,
    }))
  })

libraryRouter.get('/stats', verifyAuth, requireRole([...LIB_STAFF, 'high_rank']),
  async (_req, res) => {return res.json(await libService.getLibraryStats())})

// [PRODUCTION FIX 2026-07-28] Most-borrowed/most-read/category breakdown —
// requested for librarian reports, never computed anywhere before.
libraryRouter.get('/reports/catalog', verifyAuth, requireRole([...LIB_STAFF, 'high_rank']),
  async (_req, res) => {return res.json(await libService.getCatalogReportStats())})

libraryRouter.get('/reports/overdue-by-class', verifyAuth, requireRole([...LIB_STAFF, 'high_rank']),
  async (_req, res) => {return res.json(await libService.getOverdueByClass())})

libraryRouter.get('/barcode/:barcode', verifyAuth, requireRole([...LIB_STAFF]),
  async (req, res) => {
    const book = await libService.findBookByBarcode(String(req.params.barcode))
    if (!book) return res.status(404).json({ error: 'Book not found for this barcode.' })
    return res.json(book)
  })

// [PRODUCTION FIX 2026-07-28] Fines were created automatically but had no
// listing route at all — only the separate waiver-request workflow
// existed. library.clearFine already existed as a real permission with
// nothing implementing it.
libraryRouter.get('/fines', verifyAuth, requireAnyPermission(['library.viewInventoryReports', 'library.clearFine']),
  async (req, res) => {
    const { status } = req.query as Record<string, string>
    return res.json(await libService.listFines(status))
  })

libraryRouter.patch('/fines/:id/clear', verifyAuth, requirePermission('library.clearFine'),
  async (req, res) => {
    return res.json(await libService.clearFine(String(req.params.id), req.user!.uid))
  })

// ── BORROWING ──
libraryRouter.get('/borrowings/list', verifyAuth, requireRole([...LIB_STAFF, 'high_rank']),
  async (req, res) => {
    const { studentId, staffId, status, overdue } = req.query as Record<string, string>
    return res.json(await libService.listBorrowings({ studentId, staffId, status, overdue: overdue === 'true' }))
  })

libraryRouter.post('/borrowings/issue', verifyAuth, requirePermission('library.issueBook'),
  async (req, res) => {
    const parsed = IssueBorrowingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    try {
      return res.status(201).json(await libService.issueBorrowing(parsed.data, req.user!.uid))
    } catch (err: unknown) {
      return sendError(res, err, { defaultStatus: 400, tags: { module: 'library' } })
    }
  })

libraryRouter.patch('/borrowings/:id/return', verifyAuth, requirePermission('library.processReturn'),
  async (req, res) => {
    const parsed = ReturnBorrowingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await libService.returnBook(String(req.params.id), parsed.data, req.user!.uid))
  })

// ── DIGITAL LIBRARY (static/collection routes before /digital/:id/view) ──
libraryRouter.get('/digital', verifyAuth, requirePermission('library.viewDigitalResources'),
  async (req, res) => {
    const { type, form, subject } = req.query as Record<string, string>
    const approvedOnly = req.user!.role === 'student'
    return res.json(await libService.listDigitalResources({
      type, subject, form: form ? Number(form) : undefined, approvedOnly,
    }))
  })

// POST /digital/upload-ticket — mints a one-time Appwrite upload
// credential. Digital resources (eBooks, past papers, notes) are private —
// FILE_PREFIX.DIGITAL_RESOURCE is not one of the public prefixes — so the
// file gets no public read permission; viewing still goes through
// GET /digital/:id/view's role-checked signed URL, same as before.
libraryRouter.post('/digital/upload-ticket', verifyAuth, requirePermission('library.uploadDigitalResource'),
  async (_req, res) => {
    try {
      const ticket = await createDirectUploadTicket(FILE_PREFIX.DIGITAL_RESOURCE)
      res.json(ticket)
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'library', route: 'digital-upload-ticket' } })
    }
  })

// POST /digital/upload — records a resource the browser has ALREADY
// uploaded directly to Appwrite via /digital/upload-ticket. Takes the
// resulting fileId/fileSize/mimeType (JSON body) instead of the file
// itself.
// [PRODUCTION FIX] Was multer-based (100MB limit, for eBooks/past papers),
// going through this app's own Vercel function for the raw file bytes —
// hitting the same two hard limits as every other upload in this
// codebase: Vercel's 4.5MB request-body cap (far below the 100MB this
// route was actually meant to allow) and no retry on a dropped connection
// mid-upload. This was the specific "PDF resources don't go through" bug
// reported at the very start of this investigation.
libraryRouter.post('/digital/upload', verifyAuth, requirePermission('library.uploadDigitalResource'),
  async (req, res) => {
    try {
      const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : undefined
      if (!fileId || !fileId.startsWith(`${FILE_PREFIX.DIGITAL_RESOURCE}_`)) {
        return res.status(400).json({ error: 'Missing or invalid fileId — upload the file via /digital/upload-ticket first.' })
      }
      const fileSize = typeof req.body?.fileSize === 'number' ? req.body.fileSize : undefined
      const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : undefined
      if (!fileSize || !mimeType) {
        return res.status(400).json({ error: 'Missing fileSize or mimeType.' })
      }
      const parsed = CreateDigitalResourceSchema.safeParse(req.body)
      if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
      const resource = await libService.recordDigitalResource(
        parsed.data, fileId, fileSize, mimeType, req.user!.uid
      )
      return res.status(201).json(resource)
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'library', route: 'digital-upload' } })
    }
  })

libraryRouter.get('/digital/:id/view', verifyAuth, requirePermission('library.viewDigitalResources'),
  async (req, res) => {
    try {
      const url = await libService.getDigitalResourceViewUrl(String(req.params.id), req.user!.role)
      return res.json({ url })
    } catch (err: unknown) {
      return sendError(res, err, { tags: { module: 'library' } })
    }
  })

libraryRouter.patch('/digital/:id/approve', verifyAuth, requirePermission('library.approveDigitalResource'),
  async (req, res) => { return res.json(await libService.approveDigitalResource(String(req.params.id), req.user!.uid))})

// ── RESOURCE RECOMMENDATIONS (registered before GET /:id — see header) ──
libraryRouter.get('/recommendations', verifyAuth, requirePermission('library.recommendResource'),
  async (req, res) => {
    const { status } = req.query as Record<string, string>
    return res.json(await workflowService.listRecommendations(
      status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined,
    ))
  })

libraryRouter.post('/recommendations', verifyAuth, requirePermission('library.recommendResource'),
  async (req, res) => {
    const parsed = CreateRecommendationSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const id = await workflowService.createRecommendation({
      ...parsed.data,
      requestedByUid: req.user!.uid,
    })
    return res.status(201).json({ id })
  })

libraryRouter.patch('/recommendations/:id/approve', verifyAuth, requirePermission('library.approveRecommendation'),
  async (req, res) => {
    const parsed = ReviewRecommendationSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    await workflowService.approveRecommendation(String(req.params.id), req.user!.uid, parsed.data.notes)
    return res.json({ ok: true })
  })

libraryRouter.patch('/recommendations/:id/reject', verifyAuth, requirePermission('library.approveRecommendation'),
  async (req, res) => {
    const parsed = RejectRecommendationSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    await workflowService.rejectRecommendation(String(req.params.id), req.user!.uid, parsed.data.reason)
    return res.json({ ok: true })
  })

// ── FINE WAIVER REQUESTS (registered before GET /:id — see header) ──
libraryRouter.get('/fine-waivers', verifyAuth, requireAnyPermission(['library.waiveFine', 'finance.waiveFine']),
  async (req, res) => {
    const { status } = req.query as Record<string, string>
    return res.json(await workflowService.listFineWaiverRequests(
      status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined,
    ))
  })

// Self-service create — any authenticated user may request a waiver on a
// fine (narrowing, not granting, per sms-erp-security's established
// self-service pattern); createFineWaiverRequest() itself confirms the
// fine exists and still has an outstanding balance.
libraryRouter.post('/fine-waivers', verifyAuth,
  async (req, res) => {
    const parsed = CreateFineWaiverSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    try {
      const id = await workflowService.createFineWaiverRequest({
        ...parsed.data,
        requestedByUid: req.user!.uid,
      })
      return res.status(201).json({ id })
    } catch (err: unknown) {
      return sendError(res, err, { defaultStatus: 400, tags: { module: 'library' } })
    }
  })

libraryRouter.patch('/fine-waivers/:id/approve', verifyAuth, requireAnyPermission(['library.waiveFine', 'finance.waiveFine']),
  async (req, res) => {
    await workflowService.approveFineWaiver(String(req.params.id), req.user!.uid)
    return res.json({ ok: true })
  })

libraryRouter.patch('/fine-waivers/:id/reject', verifyAuth, requireAnyPermission(['library.waiveFine', 'finance.waiveFine']),
  async (req, res) => {
    const parsed = RejectFineWaiverSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    await workflowService.rejectFineWaiver(String(req.params.id), parsed.data.reason, req.user!.uid)
    return res.json({ ok: true })
  })

// ── CATALOG single-item route — MUST be registered after /recommendations
// and /fine-waivers above, or it would shadow both by matching their path
// segment as an :id value. ──
libraryRouter.get('/:id', verifyAuth, requirePermission('library.viewCatalog'),
  async (req, res) =>{return res.json(await libService.getBook(String(req.params.id)))})

libraryRouter.post('/', verifyAuth, requirePermission('library.manageCatalog'),
  async (req, res) => {
    const parsed = CreateBookSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await libService.createBook(parsed.data, req.user!.uid))
  })

// [PRODUCTION FIX 2026-07-28] No edit or archive path existed for an
// existing catalog entry at all — create + list only.
libraryRouter.patch('/:id', verifyAuth, requirePermission('library.manageCatalog'),
  async (req, res) => {
    const parsed = UpdateBookSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await libService.updateBook(String(req.params.id), parsed.data))
  })

libraryRouter.delete('/:id', verifyAuth, requirePermission('library.manageCatalog'),
  async (req, res) => {
    return res.json(await libService.archiveBook(String(req.params.id)))
  })