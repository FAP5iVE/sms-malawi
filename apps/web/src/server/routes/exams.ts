/**
 * apps/web/src/server/routes/exams.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE of the route-registration portion
 *   (individual handler bodies for unaffected routes are unchanged).
 * [R-PHASE]: R7 — Academics III: Exam Pipeline Repair & Grading Engine
 *   Unification
 * [PURPOSE]:
 *   1. The entire results pipeline was confirmed non-functional at its two
 *      final steps for every school and every user: this file had a
 *      duplicate registration of both POST /:id/approve and POST
 *      /:id/release, and Express's first-match routing meant the live
 *      handlers were the ones missing verifyAuth entirely — req.user was
 *      always undefined, so requireRole always rejected with 403 before
 *      the correctly-built duplicate definitions (which did have
 *      verifyAuth) could ever run. The first-registered, verifyAuth-
 *      missing definitions of both routes are removed; only the
 *      verifyAuth-bearing versions survive, now first (and only) match.
 *   2. exam.approveResults: narrowed to exam_officer only (removing the
 *      admin+high_rank over-grant — neither holds this permission under
 *      the real matrix). exam.authorizeRelease: narrowed to high_rank
 *      only (removing the admin over-grant). exam.create: gate changed to
 *      requirePermission('exam.create'), which correctly resolves to
 *      high_rank/academic/exam_officer — the previous
 *      requireRole(['admin','high_rank','exam_officer']) both over-granted
 *      to admin (which doesn't hold this permission) and wrongly excluded
 *      academic (which does). exam.enterOwnClassMarks: narrowed to
 *      academic only (removing the exam_officer+admin over-grant — neither
 *      holds this permission).
 *   3. Deleted GET /report-cards/student/:studentId (plural, confirmed
 *      unauthenticated — zero auth middleware of any kind, serving any
 *      visitor a signed URL to any student's report card PDF) entirely.
 *      The correctly-secured singular sibling GET /report-card/:studentId
 *      already serves the same purpose; consolidating onto one name and
 *      one security posture removes both the vulnerability and the naming
 *      collision in the same change.
 *   4. Added PATCH /:id and DELETE /:id, gated by requirePermission(
 *      'exam.edit')/requirePermission('exam.delete') — both permissions
 *      already defined with no route implementation before this phase.
 *   5. Added a permission gate to POST /exams/compute
 *      (requirePermission('exam.computeResults'), a new permission this
 *      phase adds) — no PERMISSIONS_MAP entry existed for this action at
 *      all before.
 *   6. Deleted POST /exams/report-card (the single-report generation route
 *      backed by examService.ts's now-removed report-card generation
 *      function). Its one frontend caller (useExams.ts's
 *      useGenerateReportCard()) is left as-is and will fail at runtime
 *      until repointed — R8's explicit responsibility per this phase's own
 *      scope boundary, since the correct single-student entry point on
 *      reportCardService.ts is not yet confirmed to exist.
 *   7. Deleted POST /promote — examService.ts's standalone promotion
 *      function (its only implementation) is removed in this same phase;
 *      a complete, correct, already-wired implementation already exists at
 *      the dedicated /promotion route with zero relation to this one, so
 *      the fix is deletion, not a repoint.
 *   8. Added GET /:id/marks (gated by the existing exam.viewDraftMarks
 *      permission — academic/high_rank/exam_officer) — backs
 *      MarksEntrySheet.tsx's new "restore previously-saved draft marks"
 *      requirement; no route existed to read marks back.
 *   9. GET /: classId is now optional (only academicYear/term are
 *      required) — backs exams/page.tsx's "All classes" aggregated-query
 *      fix; examService.listExams() was updated in the same phase to
 *      support an omitted classId.
 * [DEPENDS ON]: apps/web/src/server/services/examService.ts,
 *   @shared/schemas/exam (CreateExamSchema, BulkMarkEntrySchema,
 *   CreateManebRecordSchema)
 *
 * [R8 ADDENDUM — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment]:
 *   - Fixed a second, independent broken import this file already had:
 *     `getViewUrl`/`STORAGE_BUCKETS` usage referenced a function
 *     (getViewUrl) that storage.ts has never exported — rewired onto the
 *     real getSignedViewUrl()/canReadFile() API.
 *   - GET /report-card/:studentId's ownership check compared req.user.uid
 *     (a Firebase UID) directly against :studentId (a Prisma Student.id)
 *     — different identifier spaces that were never interchangeable. Now
 *     resolves the student's real Student.firebaseUid first, and staff
 *     access uses canReadFile()'s FILE_PREFIX.REPORT_CARD role list
 *     instead of an ad-hoc student-only check.
 *   - Added GET /report-card/:studentId/data (structured ReportCardData
 *     JSON for PrintableReportCard.tsx's in-browser preview) and POST
 *     /report-card (single-student generation via reportCardService.
 *     generateSingleReportCard(), this same phase) — replacing the route
 *     of the same name R7 deleted pending this phase's implementation.
 *   - GET /report-cards/:classId/:term: added the verifyAuth this route
 *     was missing entirely — previously always 403'd (dead code with zero
 *     real callers); now ReportCardGenerator.tsx (this same phase) is
 *     wired into the live app as a real caller.
 */
import { Router }              from 'express'
import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { requirePermission }   from '@/server/middleware/verifyPermission'
import { CreateExamSchema, UpdateExamSchema, BulkMarkEntrySchema, CreateManebRecordSchema } from '@shared/schemas/exam'
import * as examService        from '@/server/services/examService'
import { getSignedViewUrl, canReadFile } from '@/lib/storage'
import { prisma }              from '@/lib/prisma'
import * as reportCardService  from '@/server/services/reportCardService'

export const examsRouter = Router()

// ── GET /exams/report-cards/:classId/:term (exam_officer | admin) ─────────────
// Triggers or re-runs batch PDF generation for all students in a class.
// Returns per-student generation results with signed Appwrite URLs.
// verifyAuth was missing entirely before this phase — req.user was always
// undefined, so requireRole always rejected with 403 (this route was
// dead code with zero real callers until ReportCardGenerator.tsx, this
// same phase, is wired into the live app — see exams/page.tsx).
examsRouter.get(
  '/report-cards/:classId/:term',
  verifyAuth,
  requireRole(['admin', 'exam_officer']),
  async (req, res) => {
    // R15 (typecheck cleanup in a touched file): Express 5 types
    // req.params values as string | string[]; coerce explicitly.
    const classId = String(req.params['classId'] ?? '')
    const term    = String(req.params['term'] ?? '')
    const { academicYear }  = req.query as { academicYear?: string }

    if (!academicYear) {
      return res.status(400).json({ error: 'academicYear query param required' })
    }

    const termNum = parseInt(term, 10) as 1 | 2 | 3
    if (![1, 2, 3].includes(termNum)) {
      return res.status(400).json({ error: 'term must be 1, 2 or 3' })
    }

    const results = await reportCardService.batchGenerateReportCards(
      classId,
      termNum,
      academicYear,
      req.user!.uid,
    )
    return res.json(results)
  },
)

// GET /exams?classId=&academicYear=&term=
// classId is optional — omitted entirely, results aggregate across every
// class for the given academicYear/term (the "All classes…" filter).
examsRouter.get('/', verifyAuth, requirePermission('exam.view'),
  async (req, res) => {
    const { classId, academicYear, term } = req.query as Record<string, string | undefined>
    if (!academicYear || !term) return res.status(400).json({ error: 'academicYear and term are required' })
    return res.json(await examService.listExams(classId, academicYear, Number(term), { uid: req.user!.uid, role: req.user!.role }))
  })


// POST /exams — create exam
examsRouter.post('/', verifyAuth, requirePermission('exam.create'),
  async (req, res) => {
    const parsed = CreateExamSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await examService.createExam(parsed.data, { uid: req.user!.uid, role: req.user!.role }))
  })

// PATCH /exams/:id — subject-ownership-scoped; blocked once results are
// finalized; re-runs the MANEB guard on any class/subject/term/type change
// (all enforced in examService.updateExam).
examsRouter.patch('/:id', verifyAuth, requirePermission('exam.edit'),
  async (req, res) => {
    const id = String(req.params.id)
    const parsed = UpdateExamSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await examService.updateExam(id, parsed.data, { uid: req.user!.uid, role: req.user!.role }))
  })

// DELETE /exams/:id — subject-ownership-scoped; blocked once marks exist or
// results are locked (enforced in examService.deleteExam).
examsRouter.delete('/:id', verifyAuth, requirePermission('exam.delete'),
  async (req, res) => {
    const id = String(req.params.id)
    return res.json(await examService.deleteExam(id, { uid: req.user!.uid, role: req.user!.role }))
  })

// POST /exams/:id/marks — enter marks (teacher, own class only)
examsRouter.post('/:id/marks', verifyAuth, requirePermission('exam.enterOwnClassMarks'),
  async (req, res) => {
    const parsed = BulkMarkEntrySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await examService.enterMarks(parsed.data, { uid: req.user!.uid, role: req.user!.role }))
  })

// GET /exams/:id/marks — read back previously-saved marks (draft-restore)
examsRouter.get('/:id/marks', verifyAuth, requirePermission('exam.viewDraftMarks'),
  async (req, res) => {
    return res.json(await examService.getMarksForExam(String(req.params.id), { uid: req.user!.uid, role: req.user!.role }))
  })

// POST /exams/:id/correct-marks — RW-1: exam_officer/high_rank correct
// individual marks during review (finalized/approved, pre-release).
examsRouter.post('/:id/correct-marks', verifyAuth, requirePermission('exam.correctMarksInReview'),
  async (req, res) => {
    const parsed = BulkMarkEntrySchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.json(await examService.correctMarksInReview(String(req.params.id), parsed.data.entries, { uid: req.user!.uid, role: req.user!.role }))
  })

// GET /exams/fee-blocked?classId=&academicYear=&term= — RW-2: which students are
// fee-blocked for a term (the identities behind the release-workflow count).
examsRouter.get('/fee-blocked', verifyAuth, requirePermission('exam.viewAllResults'),
  async (req, res) => {
    const { classId, academicYear, term } = req.query as Record<string, string>
    if (!classId || !academicYear || !term) return res.status(400).json({ error: 'classId, academicYear and term are required' })
    return res.json(await examService.listFeeBlockedStudents(classId, academicYear, Number(term)))
  })

// POST /exams/release-term — RW-4 + RW-5: release ALL end-of-term exams for a
// term in unison (only once all are approved) + post the combined top-10
// announcement. High-rank release authority.
examsRouter.post('/release-term', verifyAuth, requirePermission('exam.authorizeRelease'),
  async (req, res) => {
    const { academicYear, term } = req.body as { academicYear?: string; term?: number }
    if (!academicYear || !term) return res.status(400).json({ error: 'academicYear and term are required' })
    return res.json(await examService.releaseTermEndResults(academicYear, Number(term), { uid: req.user!.uid, role: req.user!.role }))
  })

// POST /exams/:id/finalize — teacher finalizes marks
examsRouter.post('/:id/finalize', verifyAuth, requirePermission('exam.finalizeMarks'),
  async (req, res) => {
    await examService.finalizeMarks(String(req.params.id), { uid: req.user!.uid, role: req.user!.role })
    return res.json({ success: true })
  })

// POST /exams/:id/approve — exam officer approves. Single surviving
// registration of this path (see file header) — narrowed to exam_officer
// only; neither admin nor high_rank holds exam.approveResults.
examsRouter.post('/:id/approve', verifyAuth, requirePermission('exam.approveResults'),
  async (req, res) => {
    await examService.approveResults(String(req.params.id), { uid: req.user!.uid, role: req.user!.role })
    return res.json({ success: true })
  })

// POST /exams/:id/release — high rank authorizes release to students.
// Single surviving registration of this path (see file header) — narrowed
// to high_rank only; admin does not hold exam.authorizeRelease.
examsRouter.post('/:id/release', verifyAuth, requirePermission('exam.authorizeRelease'),
  async (req, res) => {
    await examService.releaseResults(String(req.params.id), { uid: req.user!.uid, role: req.user!.role })
    return res.json({ success: true })
  })

// POST /exams/:id/unlock — AC-1: NOT an admin action. unlock rewinds
// finalized/released results (a substantive edit), so it is gated on
// exam.unlockMarks (exam_officer / high_rank) and audited in the service.
examsRouter.post('/:id/unlock', verifyAuth, requirePermission('exam.unlockMarks'),
  async (req, res) => {
    await examService.unlockMarks(String(req.params.id), { uid: req.user!.uid, role: req.user!.role })
    return res.json({ success: true })
  })

// GET /exams/results/:studentId — student views their results (FEE GATE)
// R15: :studentId is a Prisma Student.id — getStudentResults() queries
// TermResult.studentId with it. The previous student-role ownership check
// compared req.user.uid (a Firebase UID) directly against that param, so a
// student could ONLY pass their UID — which then never matched any
// TermResult row. Ownership is now resolved via the student's real
// Student.firebaseUid (the same identifier-space fix R7/R8 applied to the
// report-card route below), so callers pass the real Student.id (e.g. from
// GET /students/me) and students still cannot read anyone else's results.
examsRouter.get('/results/:studentId', verifyAuth,
  async (req, res) => {
    const { academicYear, term } = req.query as { academicYear: string; term: string }
    const sid = String(req.params.studentId)
    if (req.user!.role === 'student') {
      const own = await prisma.student.findUnique({
        where:  { firebaseUid: req.user!.uid },
        select: { id: true },
      })
      if (!own || own.id !== sid)
        return res.status(403).json({ error: 'You can only view your own results.' })
    }
    try {
      const result = await examService.getStudentResults(sid, academicYear, Number(term))
      return res.json(result)
    } catch (err: unknown) {
      const e = err as Error & { status?: number }
      return res.status(e.status ?? 500).json({ error: e.message })
    }
  })

// POST /exams/compute — trigger term result computation
examsRouter.post('/compute', verifyAuth, requirePermission('exam.computeResults'),
  async (req, res) => {
    const { classId, academicYear, term } = req.body as { classId: string; academicYear: string; term: number }
    if (!classId || !academicYear || !term) return res.status(400).json({ error: 'classId, academicYear and term are required' })
    return res.json(await examService.computeTermResults(classId, academicYear, term, req.user!.uid))
  })

// GET /exams/report-card/:studentId — download a generated report card.
// Ownership is resolved via the student's real Student.firebaseUid, not by
// comparing req.user.uid (a Firebase UID) directly against the route's
// :studentId param (a Prisma Student.id) — those are different identifier
// spaces in this system and were never interchangeable. Staff access uses
// the same canReadFile() role list (FILE_PREFIX.REPORT_CARD) storage.ts
// already defines, instead of an ad-hoc student-only check.
examsRouter.get('/report-card/:studentId', verifyAuth,
  async (req, res) => {
    const { academicYear, term } = req.query as { academicYear: string; term: string }
    const sid = String(req.params.studentId)

    const student = await prisma.student.findUnique({ where: { id: sid }, select: { firebaseUid: true } })
    if (!student) return res.status(404).json({ error: 'Student not found.' })

    // 'report_card_x' is a synthetic ID, not a real file — canReadFile() only
    // extracts the FILE_PREFIX ('report_card') from its first two
    // underscore-separated segments to look up the READ_ROLES list; this
    // route is checking role/ownership access to a data resource, not one
    // specific stored file.
    if (!canReadFile('report_card_x', req.user!.role, req.user!.uid, student.firebaseUid ?? undefined)) {
      return res.status(403).json({ error: 'Access denied.' })
    }

    try {
      await examService.getStudentResults(sid, academicYear, Number(term)) // fee gate
    } catch (err: unknown) {
      const e = err as Error & { status?: number }
      return res.status(e.status ?? 500).json({ error: e.message })
    }
    const result = await prisma.termResult.findFirst({ where: { studentId: sid, academicYear, term: Number(term) } })
    if (!result?.reportCardKey) return res.status(404).json({ error: 'Report card not yet generated.' })
    return res.json({ url: await getSignedViewUrl(result.reportCardKey) })
  })

// GET /exams/report-card/:studentId/data — structured ReportCardData JSON
// for the in-browser PrintableReportCard.tsx preview, distinct from the
// downloadable-PDF path above. Same ownership/staff access check.
examsRouter.get('/report-card/:studentId/data', verifyAuth,
  async (req, res) => {
    const { academicYear, term } = req.query as { academicYear: string; term: string }
    const sid = String(req.params.studentId)

    const student = await prisma.student.findUnique({ where: { id: sid }, select: { firebaseUid: true } })
    if (!student) return res.status(404).json({ error: 'Student not found.' })

    if (!canReadFile('report_card_x', req.user!.role, req.user!.uid, student.firebaseUid ?? undefined)) {
      return res.status(403).json({ error: 'Access denied.' })
    }

    try {
      await examService.getStudentResults(sid, academicYear, Number(term)) // fee gate
    } catch (err: unknown) {
      const e = err as Error & { status?: number }
      return res.status(e.status ?? 500).json({ error: e.message })
    }

    const termNum = Number(term) as 1 | 2 | 3
    if (![1, 2, 3].includes(termNum)) return res.status(400).json({ error: 'term must be 1, 2 or 3' })
    return res.json(await reportCardService.getReportCardData(sid, termNum, academicYear))
  })

// POST /exams/report-card — single-student generation, backed by
// reportCardService.generateSingleReportCard() (this same phase) —
// replaces the route this same name had before R7 removed it (that one
// called examService.ts's now-removed generateReportCard()).
examsRouter.post('/report-card', verifyAuth, requireRole(['admin', 'exam_officer']),
  async (req, res) => {
    const { studentId, academicYear, term } = req.body as { studentId: string; academicYear: string; term: number }
    if (!studentId || !academicYear || !term) {
      return res.status(400).json({ error: 'studentId, academicYear and term are required' })
    }
    const termNum = Number(term) as 1 | 2 | 3
    if (![1, 2, 3].includes(termNum)) return res.status(400).json({ error: 'term must be 1, 2 or 3' })

    const result = await reportCardService.generateSingleReportCard(studentId, termNum, academicYear, req.user!.uid)
    if (result.error) return res.status(500).json({ error: result.error })
    return res.status(201).json(result)
  })

// POST /exams/report-card/mine — SR-3: a student generates + downloads THEIR
// OWN report card (the staff POST above is admin/officer-only, which is why
// students previously got 403). Resolves the caller's studentId from their
// firebaseUid and applies the same fee gate as the results view.
examsRouter.post('/report-card/mine', verifyAuth,
  async (req, res) => {
    const { academicYear, term } = req.body as { academicYear: string; term: number }
    if (!academicYear || !term) return res.status(400).json({ error: 'academicYear and term are required' })
    const termNum = Number(term) as 1 | 2 | 3
    if (![1, 2, 3].includes(termNum)) return res.status(400).json({ error: 'term must be 1, 2 or 3' })

    const student = await prisma.student.findFirst({ where: { firebaseUid: req.user!.uid }, select: { id: true } })
    if (!student) return res.status(404).json({ error: 'No student record is linked to your account.' })

    try {
      await examService.getStudentResults(student.id, academicYear, termNum) // fee gate + release check
    } catch (err: unknown) {
      const e = err as Error & { status?: number }
      return res.status(e.status ?? 500).json({ error: e.message })
    }

    const result = await reportCardService.generateSingleReportCard(student.id, termNum, academicYear, req.user!.uid)
    if (result.error) return res.status(500).json({ error: result.error })
    return res.status(201).json(result)
  })

// GET /exams/analytics/class
examsRouter.get('/analytics/class', verifyAuth, requireRole(['admin','high_rank','academic','exam_officer']),
  async (req, res) => {
    const { classId, academicYear, term } = req.query as Record<string, string>
    if (!classId || !academicYear || !term) return res.status(400).json({ error: 'classId, academicYear and term are required' })
    return res.json(await examService.getClassAnalytics(classId, academicYear, Number(term)))
  })

// GET /exams/analytics/top-bottom — AN-1 (top/bottom-N, filters, tie-safe) +
// AN-3 (pass rate, grade distribution, at-risk). Oversight sees any class; a
// teacher is scoped by the service to classes they teach.
examsRouter.get('/analytics/top-bottom', verifyAuth, requirePermission('exam.viewClassAnalytics'),
  async (req, res) => {
    const { classId, subject, academicYear, term, limit } = req.query as Record<string, string>
    if (!academicYear || !term) return res.status(400).json({ error: 'academicYear and term are required' })
    return res.json(await examService.getExamAnalytics(
      academicYear, Number(term),
      { classId: classId || undefined, subject: subject || undefined, limit: limit ? Number(limit) : undefined },
      { uid: req.user!.uid, role: req.user!.role },
    ))
  })

// MANEB
examsRouter.get('/maneb', verifyAuth, requireRole(['admin','high_rank','exam_officer']),
  async (req, res) => {
    const { academicYear, type } = req.query as { academicYear: string; type?: string }
    return res.json(await examService.listManebRecords(academicYear, type as 'JCE' | 'MSCE' | undefined))
  })

examsRouter.post('/maneb', verifyAuth, requirePermission('exam.manageManebRecords'),
  async (req, res) => {
    const parsed = CreateManebRecordSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await examService.createManebRecord(parsed.data, { uid: req.user!.uid, role: req.user!.role }))
  })

// [R18] Bulk MANEB import. Validates an array of records through the same
// CreateManebRecordSchema as the single-create route, then delegates to
// examService.bulkCreateManebRecords (a thin loop over createManebRecord — the
// sole MANEB write path). Returns { created, errors } so partial success is
// visible; a duplicate candidateNo fails only its own row.
examsRouter.post('/maneb/bulk', verifyAuth, requirePermission('exam.manageManebRecords'),
  async (req, res) => {
    const parsed = CreateManebRecordSchema.array().min(1).max(500).safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    return res.status(201).json(await examService.bulkCreateManebRecords(parsed.data, { uid: req.user!.uid, role: req.user!.role }))
  })

// POST /exams/maneb/recompute — GR-1: recompute overallGrade + aggregatePoints
// from stored subjectGrades for all MANEB records in a year (one-time after
// the GR-1 rollout; new records are computed on create/import).
examsRouter.post('/maneb/recompute', verifyAuth, requirePermission('exam.manageManebRecords'),
  async (req, res) => {
    const academicYear = typeof req.body?.academicYear === 'string' ? req.body.academicYear : undefined
    if (!academicYear) return res.status(400).json({ error: 'academicYear is required' })
    return res.json(await examService.recomputeManebAggregates(academicYear, { uid: req.user!.uid, role: req.user!.role }))
  })