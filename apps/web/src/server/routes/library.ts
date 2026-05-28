import { Router } from 'express'
import multer from 'multer'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { CreateBookSchema, IssueBorrowingSchema, ReturnBorrowingSchema, CreateDigitalResourceSchema } from '@shared/schemas/library'
import * as libService from '@/server/services/libraryService'

export const libraryRouter = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }) // 100MB for eBooks

const LIB_STAFF = ['admin', 'library'] as const

// ── CATALOG ──
libraryRouter.get('/', verifyAuth,
  async (req, res) => {
    const { category, search, available } = req.query as Record<string, string>
    return res.json(await libService.listBooks({ category, search, available: available === 'true' }))
  })

libraryRouter.get('/stats', verifyAuth, requireRole([...LIB_STAFF, 'admin', 'high_rank']),
  async (_req, res) => {return res.json(await libService.getLibraryStats())})

libraryRouter.get('/barcode/:barcode', verifyAuth, requireRole([...LIB_STAFF]),
  async (req, res) => {
    const book = await libService.findBookByBarcode(String(req.params.barcode))
    if (!book) return res.status(404).json({ error: 'Book not found for this barcode.' })
    return res.json(book)
  })

libraryRouter.get('/:id', verifyAuth,
  async (req, res) =>{return res.json(await libService.getBook(String(req.params.id)))})

libraryRouter.post('/', verifyAuth, requireRole([...LIB_STAFF]),
  async (req, res) => {
    const parsed = CreateBookSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await libService.createBook(parsed.data, req.user!.uid))
  })

// ── BORROWING ──
libraryRouter.get('/borrowings/list', verifyAuth, requireRole([...LIB_STAFF, 'high_rank']),
  async (req, res) => {
    const { studentId, staffId, status, overdue } = req.query as Record<string, string>
    return res.json(await libService.listBorrowings({ studentId, staffId, status, overdue: overdue === 'true' }))
  })

libraryRouter.post('/borrowings/issue', verifyAuth, requireRole([...LIB_STAFF]),
  async (req, res) => {
    const parsed = IssueBorrowingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    try {
      return res.status(201).json(await libService.issueBorrowing(parsed.data, req.user!.uid))
    } catch (err: unknown) {
      const e = err as Error
      return res.status(400).json({ error: e.message })
    }
  })

libraryRouter.patch('/borrowings/:id/return', verifyAuth, requireRole([...LIB_STAFF]),
  async (req, res) => {
    const parsed = ReturnBorrowingSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await libService.returnBook(String(req.params.id), parsed.data, req.user!.uid))
  })

// ── DIGITAL LIBRARY ──
libraryRouter.get('/digital', verifyAuth,
  async (req, res) => {
    const { type, form, subject } = req.query as Record<string, string>
    const approvedOnly = req.user!.role === 'student'
    return res.json(await libService.listDigitalResources({
      type, subject, form: form ? Number(form) : undefined, approvedOnly,
    }))
  })

libraryRouter.get('/digital/:id/view', verifyAuth,
  async (req, res) => {
    try {
      const url = await libService.getDigitalResourceViewUrl(String(req.params.id), req.user!.role)
      return res.json({ url })
    } catch (err: unknown) {
      const e = err as Error & { status?: number }
      return res.status(e.status ?? 500).json({ error: e.message })
    }
  })

libraryRouter.post('/digital/upload', verifyAuth, requireRole(['admin','library','academic']),
  upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
    const parsed = CreateDigitalResourceSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const resource = await libService.uploadDigitalResource(
      parsed.data, req.file.buffer, req.file.originalname, req.file.mimetype, req.file.size, req.user!.uid
    )
    return res.status(201).json(resource)
  })

libraryRouter.patch('/digital/:id/approve', verifyAuth, requireRole([...LIB_STAFF]),
  async (req, res) => { return res.json(await libService.approveDigitalResource(String(req.params.id), req.user!.uid))})
