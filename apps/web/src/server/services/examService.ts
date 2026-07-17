/**
 * apps/web/src/server/services/examService.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE of four areas within the file (unrelated
 *   exports such as exam CRUD basics, approveResults/releaseResults/
 *   unlockMarks/getStudentResults/getClassAnalytics/MANEB are unaffected).
 * [R-PHASE]: R7 — Academics III: Exam Pipeline Repair & Grading Engine
 *   Unification
 * [PURPOSE]:
 *   (1) Removed the private calcGrade() function and the MSCE_GRADES/
 *   JCE_GRADES constants entirely. computeTermResults() now imports and
 *   awaits gradeService.ts's exported, async, database-backed calcGrade()
 *   — this is the single change that makes the Phase 1B grading-settings
 *   admin UI finally affect real computed results; previously that panel
 *   was decorative, since every real result was computed through this
 *   file's own hardcoded, pre-gradeService table.
 *   (2) enterMarks(): now advances Exam.status through IN_PROGRESS →
 *   MARKS_DRAFT as marks are entered, not only ExamMark.isDraft — an exam
 *   previously stayed frozen at SCHEDULED forever regardless of real
 *   marks-entry progress, since this function never touched Exam.status
 *   at all. Only advances forward (SCHEDULED/IN_PROGRESS/MARKS_PENDING →
 *   MARKS_DRAFT); never regresses an exam already past draft-marks entry.
 *   (3) finalizeMarks(): now validates mark *validity*, not merely row
 *   *existence* — rejects finalization if any ExamMark row has
 *   `mark: null && absent: false`. The previous check only confirmed a
 *   row existed per active student, which an uninitialized client-side
 *   entry could satisfy without ever containing a real mark value.
 *   (4) Removed the PDF report-card generation function and its private
 *   HTML-building helper and browser-launcher, and the standalone student
 *   promotion-engine function, entirely — confirmed duplicate/overlapping
 *   implementations of logic that belongs solely to reportCardService.ts
 *   (Phase 3B) and promotionService.ts (Phase 3C) respectively. Leaving
 *   both implementations live was the direct cause of the
 *   two-independent-PDF-pipelines conflict Phase 3A flagged. Their now-dead
 *   imports (puppeteer-core, @sparticuz/chromium, uploadFile,
 *   STORAGE_BUCKETS) are removed with them — both packages remain genuine
 *   dependencies (receiptService.ts has its own independent puppeteer
 *   usage; reportCardService.ts uses jsPDF instead), only this file's
 *   import lines are dead. This file's MANEB record management exports are
 *   *not* duplicates and are *not* removed — they are this file's correct,
 *   sole implementation.
 *   Consequential (necessary to keep the build passing once the standalone
 *   promotion function above is removed): exams.ts's POST /promote route —
 *   its only caller — is deleted outright rather than repointed, since a
 *   complete, correct, already-wired implementation already exists at the
 *   dedicated /promotion route (server/routes/promotion.ts →
 *   promotionService.ts's own export of the same name) with zero relation
 *   to the broken route; keeping both would reintroduce the exact
 *   duplicate-implementation problem this phase removes.
 *   Consequential (needed for exams/page.tsx's explicit "All classes"
 *   fix): the exam-listing function's classId parameter is now optional,
 *   building the Prisma filter conditionally, so selecting "All classes"
 *   can run one aggregated query instead of the route always requiring a
 *   class.
 *   Consequential (needed for MarksEntrySheet.tsx's explicit
 *   draft-restore fix): added a new exported function to read back
 *   previously-saved ExamMark rows for an exam — none existed before.
 *   Consequential (explicit follow-up instruction — the internal exam
 *   pipeline must never be used for a term MANEB itself grades):
 *   createExam() now rejects creating an END_TERM exam for Form 2 Term 3
 *   or Form 4 Term 3 (the JCE/MSCE national sittings — see
 *   @shared/constants/malawi's MANEB_NATIONAL_FORM_TERM) and rejects
 *   creating a MANEB_JCE/MANEB_MSCE-typed exam at all, at any form/term —
 *   those two enum values exist on Exam.type but MANEB results must only
 *   ever be recorded via ManebRecord, never through ExamMark/
 *   computeTermResults(). computeTermResults() itself now refuses to run
 *   for a MANEB national term for the same reason, even if an Exam row
 *   for one exists from before this guard was added.
 *   Added `import 'server-only'`; removed the leftover
 *   `// ← WAS '../lib/prisma'`-style refactor-artifact comments on every
 *   import line.
 * [DEPENDS ON]: apps/web/src/server/services/gradeService.ts (calcGrade),
 *   @shared/constants/malawi (getManebExamType)
 *
 * [R8 ADDENDUM — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment]: listExams() now also returns className/totalStudents/
 *   feeBlockedCount/marksEntered per exam — ResultsReleaseWorkflow.tsx
 *   needs these for its per-exam release-readiness summary and previously
 *   had no source for any of them.
 */
import 'server-only'

import { prisma }           from '@/lib/prisma'
import { logger }           from '@/lib/logger'
import { checkBalanceGate } from '@/server/services/feeService'
import { calcGrade }        from '@/server/services/gradeService'
import { getManebExamType } from '@shared/constants/malawi'
import type { CreateExamInput, BulkMarkEntryInput, CreateManebRecordInput } from '@shared/schemas/exam'
import type { Decimal } from '@prisma/client/runtime/library'
import type { ExamStatus } from '@prisma/client'

function toNumber(v: Decimal | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  return typeof v === 'number' ? v : Number(v)
}

// ─── CREATE EXAM ─────────────────────────────────────────
// Form 2 Term 3 (JCE) and Form 4 Term 3 (MSCE) are MANEB national
// examinations — the school does not set, mark, or grade them, so no
// internal Exam of type END_TERM may be created for those slots; results
// for them arrive via ManebRecord (createManebRecord()) instead. The two
// MANEB_* exam types are reserved for that same import path and may never
// be created through this internal pipeline at all, regardless of
// form/term — creating one here would let MANEB marks flow through
// ExamMark/computeTermResults(), the exact parallel-grading-path this
// phase closes.
export async function createExam(data: CreateExamInput, actorUid: string) {
  if (data.type === 'MANEB_JCE' || data.type === 'MANEB_MSCE') {
    throw new Error(
      `${data.type === 'MANEB_JCE' ? 'JCE' : 'MSCE'} results come from MANEB, not internal marks entry. Record them via the MANEB panel (createManebRecord) once MANEB releases results.`
    )
  }

  const targetClass = await prisma.class.findUniqueOrThrow({ where: { id: data.classId }, select: { form: true } })
  const manebType = getManebExamType(targetClass.form, data.term)
  if (manebType && data.type === 'END_TERM') {
    throw new Error(
      `Form ${targetClass.form} Term ${data.term} is the national ${manebType} examination, administered by MANEB — the school does not set an internal end-of-term exam for this slot. Record results via the MANEB panel once MANEB releases them.`
    )
  }

  const exam = await prisma.exam.create({
    data: { ...data, date: new Date(data.date), createdByUid: actorUid },
    include: { class: { select: { name: true, form: true } } },
  })
  logger.info({ event: 'exam.create', examId: exam.id, actorUid })
  return exam
}

// classId is optional — omitted entirely, the query aggregates across
// every class for the given academicYear/term (the exams list page's
// "All classes…" filter, previously disabled outright rather than
// supported by this function).
// classId is optional — omitted entirely, the query aggregates across
// every class for the given academicYear/term (the exams list page's
// "All classes…" filter, previously disabled outright rather than
// supported by this function). Also returns className/totalStudents/
// feeBlockedCount/marksEntered — ResultsReleaseWorkflow.tsx (R8) needs
// these to render its per-exam release-readiness summary; the underlying
// joins were straightforward additions to a query that already had to
// touch Class and ExamMark.
export async function listExams(classId: string | undefined, academicYear: string, term: number) {
  const exams = await prisma.exam.findMany({
    where: {
      ...(classId ? { classId } : {}),
      academicYear,
      term,
    },
    include: {
      class: { select: { name: true } },
      _count: { select: { marks: true } },
    },
    orderBy: { date: 'asc' },
  })

  return Promise.all(
    exams.map(async (exam) => {
      const [totalStudents, feeBlockedCount] = await Promise.all([
        prisma.student.count({ where: { classId: exam.classId, status: 'ACTIVE' } }),
        prisma.invoice.count({
          where: {
            academicYear,
            term,
            balance: { gt: 0 },
            student: { classId: exam.classId, status: 'ACTIVE' },
          },
        }),
      ])
      return {
        ...exam,
        className:     exam.class.name,
        totalStudents,
        feeBlockedCount,
        marksEntered:  exam._count.marks,
      }
    }),
  )
}

// ─── ENTER MARKS (bulk upsert) ────────────────────────────

// Only these statuses may advance to MARKS_DRAFT as a result of marks
// being entered — an exam already past draft-marks entry (MARKS_FINAL and
// beyond) is never regressed by a later enterMarks() call.
const ADVANCEABLE_TO_MARKS_DRAFT: ExamStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'MARKS_PENDING']

export async function enterMarks(data: BulkMarkEntryInput, actorUid: string) {
  const { entries, isDraft } = data
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: entries[0]!.examId } })
  const max = toNumber(exam.maxMark)
  for (const e of entries) {
    if (e.mark !== undefined && e.mark > max)
      throw new Error(`Mark ${e.mark} exceeds maximum ${max} for exam ${exam.title}`)
  }
  const upserted = await prisma.$transaction(
    entries.map((e) =>
      prisma.examMark.upsert({
        where: { examId_studentId: { examId: e.examId, studentId: e.studentId } },
        create: { ...e, mark: e.mark ?? null, comment: e.comment ?? null, enteredByUid: actorUid, isDraft },
        update: { mark: e.mark ?? null, absent: e.absent ?? false, comment: e.comment ?? null, isDraft, enteredByUid: actorUid },
      })
    )
  )

  if (isDraft && ADVANCEABLE_TO_MARKS_DRAFT.includes(exam.status)) {
    await prisma.exam.update({ where: { id: exam.id }, data: { status: 'MARKS_DRAFT' } })
  }

  logger.info({ event: 'marks.enter', examId: entries[0]!.examId, count: entries.length, isDraft, actorUid })
  return upserted
}

// ─── READ MARKS (draft-restore for MarksEntrySheet.tsx) ──
export async function getMarksForExam(examId: string) {
  return prisma.examMark.findMany({
    where: { examId },
    orderBy: { studentId: 'asc' },
  })
}

// ─── FINALIZE MARKS ──────────────────────────────────────
export async function finalizeMarks(examId: string, actorUid: string) {
  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: { class: { include: { students: { where: { status: 'ACTIVE' } } } } },
  })

  const marks = await prisma.examMark.findMany({
    where:  { examId },
    select: { studentId: true, mark: true, absent: true },
  })
  const markedIds = marks.map((m) => m.studentId)
  const missing = exam.class.students.filter((s) => !markedIds.includes(s.id))
  if (missing.length > 0)
    throw new Error(`Missing marks for ${missing.length} student(s). Enter all marks first.`)

  // Row *existence* alone is not enough — a row can exist with mark: null
  // and absent: false (an uninitialized client-side entry that was upserted
  // with defaults but never actually given a real value). Reject those too.
  const invalid = marks.filter((m) => m.mark === null && !m.absent)
  if (invalid.length > 0)
    throw new Error(`${invalid.length} student(s) have no mark entered and are not marked absent. Enter a mark or mark them absent before finalizing.`)

  await prisma.examMark.updateMany({ where: { examId }, data: { isDraft: false, finalizedAt: new Date() } })
  await prisma.exam.update({ where: { id: examId }, data: { status: 'MARKS_FINAL' } })
  logger.info({ event: 'marks.finalized', examId, actorUid })
  return { finalized: true, examId }
}

export async function approveResults(examId: string, actorUid: string) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } })
  if (exam.status !== 'MARKS_FINAL') throw new Error('Marks must be finalized before approval.')
  await prisma.exam.update({ where: { id: examId }, data: { status: 'RESULTS_APPROVED' } })
  logger.info({ event: 'results.approved', examId, actorUid })
}

export async function releaseResults(examId: string, actorUid: string) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } })
  if (exam.status !== 'RESULTS_APPROVED') throw new Error('Results must be approved before release.')
  await prisma.exam.update({ where: { id: examId }, data: { status: 'RESULTS_RELEASED' } })
  logger.info({ event: 'results.released', examId, actorUid })
}

export async function unlockMarks(examId: string, actorUid: string) {
  await prisma.exam.update({ where: { id: examId }, data: { status: 'MARKS_PENDING' } })
  await prisma.examMark.updateMany({ where: { examId }, data: { isDraft: true } })
  logger.info({ event: 'marks.unlocked', examId, actorUid })
}

// ─── GET STUDENT RESULTS — FEE GATE ENFORCED ─────────────
export async function getStudentResults(studentId: string, academicYear: string, term: number) {
  // CRITICAL: Never bypass this check. 403 means fees unpaid.
  const gateOpen = await checkBalanceGate(studentId, term, academicYear)
  if (!gateOpen) {
    const err = new Error('Outstanding fee balance. Pay fees to view results.') as Error & { status: number }
    err.status = 403
    throw err
  }
  return prisma.termResult.findFirst({ where: { studentId, academicYear, term } })
}

// ─── COMPUTE TERM RESULTS ────────────────────────────────
// Refuses to run for a MANEB national term (Form 2 Term 3 / Form 4 Term 3)
// — those results come from MANEB itself (ManebRecord), never from
// aggregating internally-marked Exam/ExamMark rows, even if some were
// mistakenly created before createExam()'s own guard was added.
export async function computeTermResults(classId: string, academicYear: string, term: number, actorUid: string) {
  const classRecord = await prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { form: true } })
  const classForm: number = classRecord.form // e.g. 1, 2, 3, or 4

  const manebType = getManebExamType(classForm, term)
  if (manebType) {
    throw new Error(
      `Form ${classForm} Term ${term} is the national ${manebType} examination — results come from MANEB, not internal computation. Record them via the MANEB panel once MANEB releases them.`
    )
  }

  const students = await prisma.student.findMany({ where: { classId, status: 'ACTIVE' } })
  const exams = await prisma.exam.findMany({
    where: { classId, academicYear, term, status: 'RESULTS_RELEASED' },
    include: { marks: true },
  })
  const results: { studentId: string; average: number }[] = []

  for (const student of students) {
    const subjectMap: Record<string, { marks: number[] }> = {}
    for (const exam of exams) {
      const mark = exam.marks.find((m) => m.studentId === student.id)
      if (!subjectMap[exam.subject]) subjectMap[exam.subject] = { marks: [] }
      if (mark && !mark.absent && mark.mark !== null)
        subjectMap[exam.subject]!.marks.push((toNumber(mark.mark) / toNumber(exam.maxMark)) * 100)
    }
    const subjectResults: Record<string, { average: number; grade: string; pass: boolean }> = {}
    let totalAvg = 0, subjectCount = 0
    for (const [subject, data] of Object.entries(subjectMap)) {
      const avg = data.marks.length > 0 ? data.marks.reduce((a, b) => a + b, 0) / data.marks.length : 0
      // gradeService.calcGrade() is the single grade-boundary authority
      // anywhere in the codebase now — persisted exactly as returned, no
      // local override.
      const { grade, pass } = await calcGrade(avg, 'INTERNAL', classForm)
      subjectResults[subject] = { average: Math.round(avg * 100) / 100, grade, pass }
      totalAvg += avg; subjectCount++
    }
    const overallAvg = subjectCount > 0 ? totalAvg / subjectCount : 0
    const { grade, pass } = await calcGrade(overallAvg, 'INTERNAL', classForm)
    await prisma.termResult.upsert({
      where: { studentId_academicYear_term: { studentId: student.id, academicYear, term } },
      create: { studentId: student.id, classId, academicYear, term, totalMark: subjectCount * overallAvg, average: Math.round(overallAvg * 100) / 100, grade, passStatus: pass, subjectResults },
      update: { average: Math.round(overallAvg * 100) / 100, grade, passStatus: pass, subjectResults },
    })
    results.push({ studentId: student.id, average: overallAvg })
  }

  results.sort((a, b) => b.average - a.average)
  await prisma.$transaction(
    results.map((r, i) => prisma.termResult.update({
      where: { studentId_academicYear_term: { studentId: r.studentId, academicYear, term } },
      data: { position: i + 1 },
    }))
  )
  logger.info({ event: 'term_results.computed', classId, academicYear, term, count: results.length, actorUid })
  return { computed: results.length }
}

// ─── MANEB ────────────────────────────────────────────────
export async function createManebRecord(data: CreateManebRecordInput, actorUid: string) {
  const record = await prisma.manebRecord.create({
    data: {
      ...data,
      overallGrade: data.overallGrade ?? null,
    },
  })
  logger.info({ event: 'maneb.record.create', recordId: record.id, actorUid })
  return record
}

export async function listManebRecords(academicYear: string, examType?: 'JCE' | 'MSCE') {
  return prisma.manebRecord.findMany({
    where: { academicYear, ...(examType ? { examType } : {}) },
    orderBy: { candidateNo: 'asc' },
  })
}

/**
 * [R18] Bulk MANEB record import. A thin, sequential loop over the existing
 * createManebRecord() — the single, audit-confirmed sole write path for MANEB
 * results — so every created row goes through exactly the same validation and
 * logging as a single create. Rows are validated and inserted independently:
 * a failed row (e.g. a duplicate candidateNo, which is @unique) is collected
 * into `errors` and does not abort the remaining rows. Returns the created
 * records and a per-row error list for the caller to surface. This does NOT
 * introduce a second MANEB write path — it is a batching wrapper only.
 */
export async function bulkCreateManebRecords(rows: CreateManebRecordInput[], actorUid: string) {
  const created: Awaited<ReturnType<typeof createManebRecord>>[] = []
  const errors: Array<{ index: number; candidateNo: string; error: string }> = []

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row) continue
    try {
      created.push(await createManebRecord(row, actorUid))
    } catch (err) {
      errors.push({
        index: i,
        candidateNo: row.candidateNo,
        error: err instanceof Error ? err.message : 'Unknown error creating MANEB record',
      })
    }
  }

  logger.info({ event: 'maneb.record.bulk_create', created: created.length, failed: errors.length, actorUid })
  return { created, errors }
}

// ─── ANALYTICS ───────────────────────────────────────────
export async function getClassAnalytics(classId: string, academicYear: string, term: number) {
  const results = await prisma.termResult.findMany({ where: { classId, academicYear, term } })
  if (results.length === 0) return null
  const passed = results.filter((r) => r.passStatus).length
  const averages = results.map((r) => toNumber(r.average))
  const classAvg = averages.reduce((a, b) => a + b, 0) / averages.length
  const top10 = [...results].sort((a, b) => toNumber(b.average) - toNumber(a.average)).slice(0, 10)
  return {
    totalStudents: results.length,
    passRate: Math.round((passed / results.length) * 100),
    classAverage: Math.round(classAvg * 100) / 100,
    top10: top10.map((r) => ({ studentId: r.studentId, average: toNumber(r.average), grade: r.grade, position: r.position })),
  }
}
