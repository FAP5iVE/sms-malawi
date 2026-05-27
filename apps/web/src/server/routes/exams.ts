import { Router }              from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'      // ← WAS '../middleware/auth'
import { CreateExamSchema, BulkMarkEntrySchema, CreateManebRecordSchema } from '@shared/schemas/exam'
import * as examService         from '@/server/services/examService'  // ← WAS '../services/examService'
import { getViewUrl, STORAGE_BUCKETS } from '@/lib/storage'      // ← WAS '../lib/storage'
import { prisma }              from '@/lib/prisma'             // ← WAS '../lib/prisma'

export const examsRouter = Router()

// GET /exams?classId=&academicYear=&term=
examsRouter.get('/', verifyAuth, requireRole(['admin','high_rank','academic','exam_officer','lower_rank','student']),
  async (req, res) => {
    const { classId, academicYear, term } = req.query as Record<string, string>
    if (!classId || !academicYear || !term) return res.status(400).json({ error: 'classId, academicYear and term are required' })
    return res.json(await examService.listExams(classId, academicYear, Number(term)))
  })

// POST /exams — create exam
examsRouter.post('/', verifyAuth, requireRole(['admin','high_rank','exam_officer']),
  async (req, res) => {
    const parsed = CreateExamSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await examService.createExam(parsed.data, req.user!.uid))
  })

// POST /exams/:id/marks — enter marks (teachers)
examsRouter.post('/:id/marks', verifyAuth, requireRole(['admin','high_rank','academic','exam_officer']),
  async (req, res) => {
    const parsed = BulkMarkEntrySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await examService.enterMarks(parsed.data, req.user!.uid))
  })

// POST /exams/:id/finalize — teacher finalizes marks
examsRouter.post('/:id/finalize', verifyAuth, requireRole(['academic','exam_officer','admin']),
  async (req, res) => {
    await examService.finalizeMarks(String(req.params.id), req.user!.uid)
    return res.json({ success: true })
  })

// POST /exams/:id/approve — exam officer approves
examsRouter.post('/:id/approve', verifyAuth, requireRole(['exam_officer','high_rank']),
  async (req, res) => {
    await examService.approveResults(String(req.params.id), req.user!.uid)
    return res.json({ success: true })
  })

// POST /exams/:id/release — high rank authorizes release to students
examsRouter.post('/:id/release', verifyAuth, requireRole(['high_rank','admin']),
  async (req, res) => {
    await examService.releaseResults(String(req.params.id), req.user!.uid)
    return res.json({ success: true })
  })

// POST /exams/:id/unlock — admin only, lets teachers re-edit finalized marks
examsRouter.post('/:id/unlock', verifyAuth, requireRole(['admin']),
  async (req, res) => {
    await examService.unlockMarks(String(req.params.id), req.user!.uid)
    return res.json({ success: true })
  })

// GET /exams/results/:studentId — student views their results (FEE GATE)
examsRouter.get('/results/:studentId', verifyAuth,
  async (req, res) => {
    const { academicYear, term } = req.query as { academicYear: string; term: string }
    const sid = String(req.params.studentId)
    if (req.user!.role === 'student' && req.user!.uid !== sid)
      return res.status(403).json({ error: 'You can only view your own results.' })
    try {
      const result = await examService.getStudentResults(sid, academicYear, Number(term))
      return res.json(result)
    } catch (err: unknown) {
      const e = err as Error & { status?: number }
      return res.status(e.status ?? 500).json({ error: e.message })
    }
  })

// POST /exams/compute — exam officer triggers term result computation
examsRouter.post('/compute', verifyAuth, requireRole(['exam_officer','admin','high_rank']),
  async (req, res) => {
    const { classId, academicYear, term } = req.body as { classId: string; academicYear: string; term: number }
    if (!classId || !academicYear || !term) return res.status(400).json({ error: 'classId, academicYear and term are required' })
    return res.json(await examService.computeTermResults(classId, academicYear, term, req.user!.uid))
  })

// POST /exams/promote — run at end of Term 3 only
examsRouter.post('/promote', verifyAuth, requireRole(['admin','high_rank']),
  async (req, res) => {
    const { academicYear, rules } = req.body as { academicYear: string; rules?: Parameters<typeof examService.runPromotion>[2] }
    return res.json(await examService.runPromotion(academicYear, req.user!.uid, rules))
  })

// POST /exams/report-card — generate PDF and upload to Appwrite
examsRouter.post('/report-card', verifyAuth, requireRole(['admin','exam_officer','high_rank']),
  async (req, res) => {
    const { studentId, academicYear, term } = req.body as { studentId: string; academicYear: string; term: number }
    const fileId = await examService.generateReportCard(studentId, academicYear, term)
    const url = await getViewUrl(STORAGE_BUCKETS.REPORT_CARDS, fileId)
    return res.json({ fileId, url })
  })

// GET /exams/report-card/:studentId — download a generated report card
examsRouter.get('/report-card/:studentId', verifyAuth,
  async (req, res) => {
    const { academicYear, term } = req.query as { academicYear: string; term: string }
    const sid = String(req.params.studentId)
    if (req.user!.role === 'student' && req.user!.uid !== sid)
      return res.status(403).json({ error: 'Access denied.' })
    try {
      await examService.getStudentResults(sid, academicYear, Number(term)) // fee gate
    } catch (err: unknown) {
      const e = err as Error & { status?: number }
      return res.status(e.status ?? 500).json({ error: e.message })
    }
    const result = await prisma.termResult.findFirst({ where: { studentId: sid, academicYear, term: Number(term) } })
    if (!result?.reportCardKey) return res.status(404).json({ error: 'Report card not yet generated.' })
    return res.json({ url: await getViewUrl(STORAGE_BUCKETS.REPORT_CARDS, result.reportCardKey) })
  })

// GET /exams/analytics/class
examsRouter.get('/analytics/class', verifyAuth, requireRole(['admin','high_rank','academic','exam_officer']),
  async (req, res) => {
    const { classId, academicYear, term } = req.query as Record<string, string>
    if (!classId || !academicYear || !term) return res.status(400).json({ error: 'classId, academicYear and term are required' })
    return res.json(await examService.getClassAnalytics(classId, academicYear, Number(term)))
  })

// MANEB
examsRouter.get('/maneb', verifyAuth, requireRole(['admin','high_rank','exam_officer']),
  async (req, res) => {
    const { academicYear, type } = req.query as { academicYear: string; type?: string }
    return res.json(await examService.listManebRecords(academicYear, type as 'JCE' | 'MSCE' | undefined))
  })

examsRouter.post('/maneb', verifyAuth, requireRole(['admin','high_rank','exam_officer']),
  async (req, res) => {
    const parsed = CreateManebRecordSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await examService.createManebRecord(parsed.data, req.user!.uid))
  })